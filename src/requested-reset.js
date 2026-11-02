// Explicit, one-time reset requested by the owner. Enabled only by RESET_DATASET_ONCE.
// The durable completion record survives code deployment and is never in the wipe set.
import {createStatements} from './schema.js';
import {freshnessStatements} from './data-freshness.js';
const controlSQL=`CREATE TABLE IF NOT EXISTS app_reset (reset_id TEXT PRIMARY KEY,state TEXT NOT NULL DEFAULT 'pending',phase TEXT NOT NULL DEFAULT 'drain',generation TEXT NOT NULL,not_before INTEGER NOT NULL,lease_token TEXT NOT NULL DEFAULT '',lease_until INTEGER NOT NULL DEFAULT 0,plan TEXT NOT NULL DEFAULT '{}',cursor INTEGER NOT NULL DEFAULT 0,completed_at TEXT)`;
const quote=name=>'"'+String(name).replace(/"/g,'""')+'"';
const system=name=>/^(sqlite_|_cf_|d1_)/.test(name);
const preserve=new Set(['app_reset','app_dataset','top_auth','top_session']);
// After the reset, even an already-admitted old Worker request cannot recreate
// the retired global identity rows. New application code always uses addresses.
const scopeTriggers=[
 `CREATE TRIGGER IF NOT EXISTS pl_room_address_insert BEFORE INSERT ON pl WHEN NEW.pl_id NOT GLOB '/boards/*/players/*' BEGIN SELECT RAISE(ABORT,'Room player address required'); END`,
 `CREATE TRIGGER IF NOT EXISTS pl_room_address_update BEFORE UPDATE ON pl WHEN NEW.pl_id NOT GLOB '/boards/*/players/*' BEGIN SELECT RAISE(ABORT,'Room player address required'); END`,
 `CREATE TRIGGER IF NOT EXISTS character_room_address_insert BEFORE INSERT ON character WHEN NEW.character_id NOT GLOB (NEW.pl_id||'/characters/*') BEGIN SELECT RAISE(ABORT,'Room character address required'); END`,
 `CREATE TRIGGER IF NOT EXISTS character_room_address_update BEFORE UPDATE ON character WHEN NEW.character_id NOT GLOB (NEW.pl_id||'/characters/*') BEGIN SELECT RAISE(ABORT,'Room character address required'); END`,
 `CREATE TRIGGER IF NOT EXISTS room_owner_address_insert BEFORE INSERT ON room WHEN NEW.owner_pl_id NOT GLOB '/boards/*/players/*' BEGIN SELECT RAISE(ABORT,'Room owner address required'); END`
];
const pending=(diagnostic={})=>new Response(JSON.stringify({...diagnostic,code:'DATASET_RESETTING',error:'保存データを初期化しています。しばらくしてから再読み込みしてください。'}),{status:503,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','retry-after':'5'}});
export async function performRequestedReset(env){
 const id=String(env.RESET_DATASET_ONCE||'');if(!id)return null;
 const db=env.DB;
 await db.prepare(controlSQL).run();
 const found=await db.prepare('SELECT * FROM app_reset WHERE reset_id=?').bind(id).first();
 if(found?.state==='complete')return null;
 // Revoke all browser generations before touching data. Old in-flight requests drain
 // while every new entry into this Worker is held behind this same durable gate.
 await db.batch([
  db.prepare(freshnessStatements[0]),
  db.prepare('INSERT OR IGNORE INTO app_reset(reset_id,generation,not_before) VALUES(?,?,?)').bind(id,crypto.randomUUID(),Date.now()+30_000),
  db.prepare(`INSERT INTO app_dataset(singleton,generation) SELECT 1,generation FROM app_reset WHERE reset_id=? AND state<>'complete'
    ON CONFLICT(singleton) DO UPDATE SET generation=excluded.generation`).bind(id)
 ]);
 let row=await db.prepare('SELECT * FROM app_reset WHERE reset_id=?').bind(id).first();
 if(row.state==='complete')return null;
 if(row.not_before>Date.now())return pending();
 const lease=crypto.randomUUID(),claimed=await db.prepare(`UPDATE app_reset SET state='running',lease_token=?,lease_until=? WHERE reset_id=? AND state<>'complete' AND lease_until<?`).bind(lease,Date.now()+600_000,id,Date.now()).run();
 if(!claimed.meta?.changes)return pending();
 row=await db.prepare('SELECT * FROM app_reset WHERE reset_id=? AND lease_token=?').bind(id,lease).first();
 const own=async()=>!!await db.prepare("SELECT 1 FROM app_reset WHERE reset_id=? AND lease_token=? AND state='running'").bind(id,lease).first();
 try{
  if(!env.LOGS)throw Error('R2 binding is required for a complete reset');
  if(row.phase==='drain'){
   const objects=(await db.prepare("SELECT name,type FROM sqlite_master WHERE type IN ('table','view') ORDER BY type DESC,name").all()).results||[];
   const plan=objects.filter(x=>!system(x.name)&&!preserve.has(x.name)).map(x=>({...x,refs:x.type==='table'?null:[]}));
   await db.prepare("UPDATE app_reset SET phase='plan',plan=?,cursor=0,lease_until=0 WHERE reset_id=? AND lease_token=?").bind(JSON.stringify(plan),id,lease).run();return pending();
  }
  if(row.phase==='plan'){
   const plan=JSON.parse(row.plan);
   // Keep each invocation below the free-tier D1 query/subrequest budget.
   for(const table of plan.filter(x=>x.refs===null).slice(0,12))table.refs=((await db.prepare(`PRAGMA foreign_key_list(${quote(table.name)})`).all()).results||[]).map(x=>x.table);
   if(plan.some(x=>x.refs===null)){
    await db.prepare('UPDATE app_reset SET plan=?,lease_until=0 WHERE reset_id=? AND lease_token=?').bind(JSON.stringify(plan),id,lease).run();return pending();
   }
   const order=[],left=new Map(plan.filter(x=>x.type==='table').map(x=>[x.name,x]));
   while(left.size){let name=[...left.keys()].find(candidate=>![...left.values()].some(child=>child.name!==candidate&&child.refs.includes(candidate)));name||=left.keys().next().value;order.push(name);left.delete(name)}
   const statements=[...plan.filter(x=>x.type==='view').map(x=>`DROP VIEW IF EXISTS ${quote(x.name)}`),...order.map(name=>`DROP TABLE IF EXISTS ${quote(name)}`),...createStatements,...freshnessStatements,...scopeTriggers];
   await db.prepare("UPDATE app_reset SET phase='database',plan=?,cursor=0,lease_until=0 WHERE reset_id=? AND lease_token=?").bind(JSON.stringify(statements),id,lease).run();return pending();
  }
  if(row.phase==='database'){
   const statements=JSON.parse(row.plan),next=Math.min(statements.length,row.cursor+12);
   if(!await own())return pending();
   await db.batch([
    db.prepare('PRAGMA defer_foreign_keys=ON'),
    ...statements.slice(row.cursor,next).map(sql=>db.prepare(sql)),
    db.prepare('UPDATE app_reset SET phase=?,cursor=?,lease_until=0 WHERE reset_id=? AND lease_token=?').bind(next===statements.length?'images':'database',next,id,lease)
   ]);return pending();
  }
  // Always start at the first page: a failed invocation can safely resume without
  // losing a cursor, and no new application writes are allowed during the wipe.
  for(let page=0;page<8;page++){
   if(!await own())return pending();
   const listed=await env.LOGS.list({limit:1000}),keys=(listed.objects||[]).map(x=>x.key);
   if(!keys.length){
    const remaining=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()).results||[];
    const tables=remaining.filter(x=>!system(x.name)&&!preserve.has(x.name));
    const counts=tables.length?(await db.prepare(tables.map(x=>`SELECT COUNT(*) AS n FROM ${quote(x.name)}`).join(' UNION ALL ')).all()).results||[]:[];
    if(counts.some(x=>Number(x.n)!==0)){
     await db.prepare("UPDATE app_reset SET phase='drain',plan='{}',cursor=0,not_before=?,lease_until=0 WHERE reset_id=? AND lease_token=?").bind(Date.now()+30_000,id,lease).run();return pending();
    }
    const violations=(await db.prepare('PRAGMA foreign_key_check').all()).results||[];if(violations.length)throw Error('Reset foreign-key verification failed');
    if(!await own())return pending();
    await db.prepare("UPDATE app_reset SET state='complete',completed_at=CURRENT_TIMESTAMP,lease_until=0 WHERE reset_id=? AND lease_token=?").bind(id,lease).run();
    return null;
   }
   await env.LOGS.delete(keys);
  }
  // Very large buckets continue on the next request, still in maintenance mode.
  await db.prepare('UPDATE app_reset SET lease_until=0 WHERE reset_id=? AND lease_token=?').bind(id,lease).run();
  return pending();
 }catch(error){
  console.error('Requested dataset reset paused',error);
  await db.prepare('UPDATE app_reset SET lease_until=0 WHERE reset_id=? AND lease_token=?').bind(id,lease).run();
  return pending({phase:row.phase,detail:String(error.message||error).slice(0,300)});
 }
}

export async function requestedResetStatus(env){
 if(!env.RESET_DATASET_ONCE)return null;
 const row=await env.DB.prepare('SELECT reset_id,state,phase,cursor,completed_at FROM app_reset WHERE reset_id=?').bind(String(env.RESET_DATASET_ONCE)).first();
 return row?{id:row.reset_id,state:row.state,phase:row.phase,cursor:Number(row.cursor)||0,completedAt:row.completed_at||null}:null;
}
