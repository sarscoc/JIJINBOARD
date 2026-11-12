import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleMatrixTemplates} from '../src/matrix-templates.js';

function fixture(){
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  sqlite.exec("INSERT INTO pl(pl_id,access_token_hash,pl_name) VALUES('pl','token','PL'); INSERT INTO room(room_id,owner_pl_id,room_name,room_admin_token_hash) VALUES('board','pl','test','token'); INSERT INTO log(log_id,room_id,log_name) VALUES('log','board','test');");
  const objects=new Map();
  const env={DB:{async batch(statements){sqlite.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(statement.run());sqlite.exec('COMMIT');return result}catch(error){sqlite.exec('ROLLBACK');throw error}},prepare(sql){let values=[];return {bind(...args){values=args;return this},async first(){return sqlite.prepare(sql).get(...values)||null},async all(){return {results:sqlite.prepare(sql).all(...values)}},run(){return {meta:sqlite.prepare(sql).run(...values)}}}}},LOGS:{async put(key,bytes){objects.set(key,bytes)},async delete(key){objects.delete(key)}}};
  const call=(method,body,id='tpl')=>handleMatrixTemplates(new Request('https://test/api',{method,...(body?{body:JSON.stringify({authorId:'pl',authorName:'PL',...body})}:{})}),env,'board','log',id);
  const list=async()=> (await (await call('GET',null,'')).json()).templates;
  const save=(baseRevision,name,color='white',dataUrl='')=>call('PUT',{baseRevision,record:{name,dataUrl,updatedAt:1},templateState:{display:{color},items:{pc:{placed:true,x:20,y:30}}}});
  return {sqlite,objects,call,list,save};
}

test('old or unversioned clients cannot roll back a saved template',async()=>{
  const f=fixture();assert.equal((await f.save(null,'original')).status,200);
  const [original]=await f.list();assert.ok(original.record.revision);
  assert.equal((await f.save(original.record.revision,'latest','black')).status,200);
  assert.equal((await f.save(original.record.revision,'stale')).status,409);
  assert.equal((await f.save(undefined,'old client')).status,409);
  const [latest]=await f.list();assert.equal(latest.record.name,'latest');assert.equal(latest.templateState.display.color,'black');
});

test('only one of two concurrent writers succeeds, even with the same timestamp',async()=>{
  const f=fixture();await f.save(null,'initial');const [row]=await f.list();
  const results=await Promise.all([f.save(row.record.revision,'A'),f.save(row.record.revision,'B')]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
});

test('two concurrent creations cannot overwrite each other',async()=>{
  const f=fixture();const results=await Promise.all([f.save(null,'A'),f.save(null,'B')]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
});

test('legacy templates get a revision without migrating or resetting data',async()=>{
  const f=fixture();f.sqlite.prepare("INSERT INTO matrix_template(room_id,template_id,template_name,template_definition) VALUES('board','tpl','legacy',?)").run(JSON.stringify({templateState:{display:{color:'blue'}}}));
  const [row]=await f.list();assert.equal(row.templateState.display.color,'blue');
  assert.equal((await f.save(row.record.revision,'edited')).status,200);
});

test('metadata edits preserve independently saved placements and comments',async()=>{
  const f=fixture();await f.save(null,'initial');
  f.sqlite.exec("UPDATE matrix_point SET point_x=88,supplement_body='keep',point_settings='{\"size\":64}'");
  const [row]=await f.list();await f.save(row.record.revision,'renamed');
  const [saved]=await f.list();assert.equal(saved.templateState.items.pc.x,88);assert.equal(saved.templateState.items.pc.comment,'keep');assert.equal(saved.templateState.items.pc.size,64);
});

test('a losing image upload cannot replace the winner image',async()=>{
  const f=fixture();await f.save(null,'initial');const [row]=await f.list();
  const results=await Promise.all([f.save(row.record.revision,'A','white','data:image/webp;base64,QQ=='),f.save(row.record.revision,'B','white','data:image/webp;base64,Qg==')]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(f.objects.size,1);
  const stored=f.sqlite.prepare("SELECT template_image_key,template_name FROM matrix_template").get();
  assert.equal(new TextDecoder().decode(f.objects.get(stored.template_image_key)),stored.template_name);
});

test('deleted templates stay deleted when an old editor saves',async()=>{
  const f=fixture();await f.save(null,'initial');const [row]=await f.list();await f.call('DELETE');
  assert.equal((await f.save(row.record.revision,'resurrected')).status,409);assert.deepEqual(await f.list(),[]);
});


test('a point-created empty parent does not block the first template save',async()=>{
  const f=fixture();f.sqlite.exec("INSERT INTO matrix_template(room_id,template_id,template_name) VALUES('board','tpl','MATRIX'); INSERT INTO matrix_point(room_id,template_id,point_id,is_placed,point_x) VALUES('board','tpl','pc',1,91)");
  assert.equal((await f.save(null,'new template')).status,200);
  const [row]=await f.list();assert.equal(row.record.name,'new template');assert.equal(row.templateState.items.pc.x,91);
});


test('existing PC appearance is saved without reverting newer point coordinates',async()=>{
  const f=fixture();await f.save(null,'initial');
  f.sqlite.exec("UPDATE matrix_point SET point_x=88,supplement_body='keep',point_settings='{\"size\":64}'");
  const [row]=await f.list();
  const body={baseRevision:row.record.revision,record:row.record,templateState:{...row.templateState,items:{pc:{...row.templateState.items.pc,size:96,x:10}}}};
  assert.equal((await f.call('PUT',body)).status,200);
  const [saved]=await f.list();assert.equal(saved.templateState.items.pc.size,96);assert.equal(saved.templateState.items.pc.x,88);assert.equal(saved.templateState.items.pc.comment,'keep');
  body.templateState.items.pc.size=32;
  assert.equal((await f.call('PUT',body)).status,409);
  assert.equal((await f.list())[0].templateState.items.pc.size,96);
});


test('a device-local image URL cannot create a broken shared template',async()=>{
 const f=fixture();assert.equal((await f.save(null,'broken','white','blob:https://old-device/image')).status,400);assert.deepEqual(await f.list(),[]);
});
test('saving metadata cannot change a template creation time',async()=>{
 const f=fixture();await f.save(null,'original');const [row]=await f.list();
 await f.call('PUT',{baseRevision:row.record.revision,record:{...row.record,createdAt:1},templateState:row.templateState});
 assert.equal((await f.list())[0].record.createdAt,row.record.createdAt);
});

test('metadata saves keep the same cacheable image URL',async()=>{
 const f=fixture();await f.save(null,'initial','white','data:image/webp;base64,QQ==');
 const [first]=await f.list();
 await f.call('PUT',{baseRevision:first.record.revision,record:first.record,templateState:{...first.templateState,display:{color:'black'}}});
 const [second]=await f.list();assert.equal(second.record.dataUrl,first.record.dataUrl);
 await f.save(second.record.revision,'new image','black','data:image/webp;base64,Qg==');
 assert.notEqual((await f.list())[0].record.dataUrl,first.record.dataUrl);
});

test('token comments save independently and do not revert newer coordinates',async()=>{
 const {handleMatrixPoint}=await import('../src/matrix-point.js');
 const f=fixture();await f.save(null,'original');
 const env={DB:{prepare(sql){let args=[];return {bind(...values){args=values;return this},async first(){return f.sqlite.prepare(sql).get(...args)||null},async all(){return {results:f.sqlite.prepare(sql).all(...args)}},async run(){return {meta:f.sqlite.prepare(sql).run(...args)}}}}}};
 const call=body=>handleMatrixPoint(new Request('https://test/api',{method:'PATCH',body:JSON.stringify({authorId:'pl',authorName:'PL',templateId:'tpl',...body})}),env,'board','log','pc');
 await call({placed:true,x:88,y:77});
 assert.equal((await call({comment:'shared bubble',commentPosition:'bottom'})).status,200);
 let [row]=await f.list();assert.equal(row.templateState.items.pc.x,88);assert.equal(row.templateState.items.pc.comment,'shared bubble');assert.equal(row.templateState.items.pc.commentPosition,'bottom');
 await call({comment:'stale recovery',recoverIfEmpty:true});[row]=await f.list();assert.equal(row.templateState.items.pc.comment,'shared bubble');
 await call({comment:'',commentPosition:'top'});[row]=await f.list();assert.equal(row.templateState.items.pc.comment,'');assert.equal(row.templateState.items.pc.x,88);
});


test('new templates are committed with their copied placements and notes, or fail before publishing',async()=>{
  const f=fixture();
  const record={name:'Copied',dataUrl:'data:image/webp;base64,QQ=='};
  const items={pc:{placed:true,x:22,y:42,comment:'note',commentPosition:'bottom'}};
  const invalid=await f.call('PUT',{baseRevision:null,record,templateState:{items:{pc:{...items.pc,oversized:'x'.repeat(100001)}}}});
  assert.equal(invalid.status,413);
  assert.deepEqual(await f.list(),[]);
  assert.equal(f.objects.size,0);
  assert.equal((await f.call('PUT',{baseRevision:null,record,templateState:{items}})).status,200);
  const [saved]=await f.list();
  assert.equal(saved.templateState.items.pc.x,22);
  assert.equal(saved.templateState.items.pc.comment,'note');
  assert.equal(saved.templateState.items.pc.commentPosition,'bottom');
});
