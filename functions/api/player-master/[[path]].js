import { randomToken,tokenHash,storeImage,imageReference,ensurePlIdentity } from '../../../src/data-model.js';

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const body=async request=>{try{return await request.json()}catch{return null}};
const code4=()=>String(crypto.getRandomValues(new Uint32Array(1))[0]%10000).padStart(4,'0');
const authToken=request=>String(request.headers.get('x-player-token')||'');
const publicIcon=key=>{if(!key)return'';const clean=String(key).replace(/^r2:/,''),hash=clean.split('/').pop();return `/api/player-master/icon/${encodeURIComponent(hash)}`};

async function masterRow(db,playerId){return db.prepare('SELECT pl_id,access_token_hash,pl_name,pl_icon_key,pl_color,pl_color_dark,created_at,updated_at FROM pl WHERE pl_id=?').bind(playerId).first()}
async function authorized(db,request,playerId){
  const row=await masterRow(db,playerId),raw=authToken(request);if(!row||!raw)return null;
  const hash=await tokenHash(raw);
  if(hash===row.access_token_hash)return row;
  const delegated=await db.prepare('SELECT 1 FROM transfer WHERE pl_id=? AND transfer_used_at IS NOT NULL AND transfer_code_hash=? LIMIT 1').bind(playerId,hash).first();
  return delegated?row:null;
}
async function characters(db,playerId){
  const result=await db.prepare('SELECT character_id,character_type,character_name,character_icon_key,matrix_icon_key,character_color,character_color_dark,updated_at FROM character WHERE pl_id=? ORDER BY updated_at,character_id').bind(playerId).all();
  return(result.results||[]).map(row=>({id:row.character_id,type:row.character_type,name:row.character_name,icon:publicIcon(row.character_icon_key),matrixIcon:publicIcon(row.matrix_icon_key),color:row.character_color,colorDark:row.character_color_dark,updatedAt:row.updated_at}));
}
async function responseMaster(db,row){return{playerId:row.pl_id,plName:row.pl_name,plIcon:publicIcon(row.pl_icon_key),plColor:row.pl_color,plColorDark:row.pl_color_dark,characters:await characters(db,row.pl_id),updatedAt:row.updated_at}}

async function upsertCharacters(env,playerId,list){
  for(const item of Array.isArray(list)?list.slice(0,100):[]){
    const id=String(item?.id||item?.characterId||'').slice(0,120),name=String(item?.name||'').trim().slice(0,80);if(!id||!name)continue;
    const type=String(item?.type||'PC')==='NPC'?'NPC':'PC';
    const existing=await env.DB.prepare('SELECT character_icon_key,matrix_icon_key FROM character WHERE character_id=? AND pl_id=?').bind(id,playerId).first();
    const iconRaw=String(item?.icon||''),matrixRaw=String(item?.matrixIcon||'');
    const icon=iconRaw?(await storeImage(env.LOGS,iconRaw,'character-icons')||String(existing?.character_icon_key||'')):String(existing?.character_icon_key||'');
    const matrixIcon=matrixRaw?(await storeImage(env.LOGS,matrixRaw,'matrix-icons')||String(existing?.matrix_icon_key||'')):String(existing?.matrix_icon_key||'');
    await env.DB.prepare(`INSERT INTO character(character_id,pl_id,character_type,character_name,character_icon_key,matrix_icon_key,character_color,character_color_dark,updated_at)
      VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(character_id) DO UPDATE SET pl_id=excluded.pl_id,character_type=excluded.character_type,character_name=excluded.character_name,character_icon_key=CASE WHEN excluded.character_icon_key<>'' THEN excluded.character_icon_key ELSE character.character_icon_key END,matrix_icon_key=CASE WHEN excluded.matrix_icon_key<>'' THEN excluded.matrix_icon_key ELSE character.matrix_icon_key END,character_color=excluded.character_color,character_color_dark=excluded.character_color_dark,updated_at=CURRENT_TIMESTAMP`).bind(playerId? id:id,playerId,type,name,icon,matrixIcon,String(item?.color||'#ffe66b').slice(0,40),String(item?.colorDark||item?.color||'#ffe66b').slice(0,40)).run();
  }
}

async function serveIcon(env,hash){
  if(!/^[A-Za-z0-9_-]{20,80}$/.test(hash)||!env.LOGS)return new Response('Not found',{status:404});
  for(const prefix of ['pl-icons','character-icons','matrix-icons']){
    const object=await env.LOGS.get(`${prefix}/${hash}`);if(!object)continue;
    return new Response(object.body,{headers:{'content-type':object.httpMetadata?.contentType||'image/webp','cache-control':'private, max-age=31536000, immutable'}});
  }
  return new Response('Not found',{status:404});
}

export async function onRequest({request,env,params}){
  if(!env.DB)return json({error:'D1データベースが接続されていません'},500);
  const parts=Array.isArray(params.path)?params.path:String(params.path||'').split('/').filter(Boolean),method=request.method;
  if(parts[0]==='icon'&&parts[1]&&method==='GET')return serveIcon(env,String(parts[1]));

  if(parts[0]==='redeem'&&parts[1]&&method==='POST'){
    const code=String(parts[1]).padStart(4,'0'),codeHash=await tokenHash(code),row=await env.DB.prepare('SELECT transfer_id,pl_id,transfer_expires_at,transfer_used_at FROM transfer WHERE transfer_code_hash=?').bind(codeHash).first();
    if(!row||row.transfer_used_at)return json({error:'コードが無効、または使用済みです'},404);
    if(Date.parse(row.transfer_expires_at)<=Date.now())return json({error:'コードの有効期限が切れています'},410);
    const master=await masterRow(env.DB,row.pl_id);if(!master)return json({error:'PLマスターが見つかりません'},404);
    const accessToken=randomToken(24),newHash=await tokenHash(accessToken),oldHash=master.access_token_hash;
    await env.DB.batch([
      env.DB.prepare('UPDATE transfer SET transfer_code_hash=?,transfer_used_at=CURRENT_TIMESTAMP WHERE transfer_id=?').bind(oldHash,row.transfer_id),
      env.DB.prepare('UPDATE pl SET access_token_hash=?,updated_at=CURRENT_TIMESTAMP WHERE pl_id=?').bind(newHash,row.pl_id)
    ]);
    const fresh=await masterRow(env.DB,row.pl_id);
    return json({playerId:fresh.pl_id,accessToken,master:await responseMaster(env.DB,fresh)});
  }

  const data=method==='GET'?null:await body(request),playerId=String(data?.playerId||new URL(request.url).searchParams.get('playerId')||'').slice(0,120);
  if(method==='POST'&&parts.length===0){
    if(!playerId||!String(data?.plName||'').trim())return json({error:'PL情報が足りません'},400);
    let row=await masterRow(env.DB,playerId),accessToken='';
    const implicit=!row||String(row.access_token_hash||'').startsWith('implicit:');
    if(!row||implicit){
      accessToken=randomToken(24);
      const plIconKey=await storeImage(env.LOGS,String(data?.plIcon||''),'pl-icons');
      if(!row)await env.DB.prepare('INSERT INTO pl(pl_id,access_token_hash,pl_name,pl_icon_key,pl_color,pl_color_dark) VALUES(?,?,?,?,?,?)').bind(playerId,await tokenHash(accessToken),String(data.plName).trim().slice(0,80),plIconKey,String(data?.plColor||'#ffe66b').slice(0,40),String(data?.plColorDark||data?.plColor||'#ffe66b').slice(0,40)).run();
      else await env.DB.prepare('UPDATE pl SET access_token_hash=?,pl_name=?,pl_icon_key=CASE WHEN ?<>\'\' THEN ? ELSE pl_icon_key END,pl_color=?,pl_color_dark=?,updated_at=CURRENT_TIMESTAMP WHERE pl_id=?').bind(await tokenHash(accessToken),String(data.plName).trim().slice(0,80),plIconKey,plIconKey,String(data?.plColor||row.pl_color).slice(0,40),String(data?.plColorDark||data?.plColor||row.pl_color_dark).slice(0,40),playerId).run();
    }else{
      const allowed=await authorized(env.DB,request,playerId);if(!allowed)return json({error:'このPLマスターへのアクセス権がありません'},403);
      accessToken=authToken(request);
    }
    await upsertCharacters(env,playerId,data?.characters);
    row=await masterRow(env.DB,playerId);
    return json({playerId,accessToken,master:await responseMaster(env.DB,row)},implicit?201:200);
  }

  if(!playerId)return json({error:'playerIdがありません'},400);
  const master=await authorized(env.DB,request,playerId);if(!master)return json({error:'このPLマスターへのアクセス権がありません'},403);

  if(parts[0]==='code'&&method==='POST'){
    let code='';
    for(let i=0;i<20;i++){
      const candidate=code4(),candidateHash=await tokenHash(candidate),exists=await env.DB.prepare('SELECT 1 FROM transfer WHERE transfer_code_hash=? AND transfer_used_at IS NULL AND transfer_expires_at>CURRENT_TIMESTAMP').bind(candidateHash).first();
      if(!exists){code=candidate;break}
    }
    if(!code)return json({error:'コードを発行できませんでした'},503);
    const expires=new Date(Date.now()+10*60*1000).toISOString(),id=randomToken(18);
    await env.DB.prepare('INSERT INTO transfer(transfer_id,pl_id,transfer_code_hash,transfer_expires_at) VALUES(?,?,?,?)').bind(id,playerId,await tokenHash(code),expires).run();
    return json({code,expiresAt:expires});
  }

  if(parts[0]==='room'){
    const roomId=String(data?.boardId||new URL(request.url).searchParams.get('boardId')||data?.roomId||new URL(request.url).searchParams.get('roomId')||'').slice(0,120);if(!roomId)return json({error:'roomIdがありません'},400);
    if(method==='GET'){
      const result=await env.DB.prepare('SELECT character_id FROM room_participant WHERE pl_id=? AND room_id=? AND character_id IS NOT NULL ORDER BY created_at,character_id').bind(playerId,roomId).all();
      return json({characterIds:(result.results||[]).map(r=>r.character_id)});
    }
    if(method==='PUT'){
      const ids=[...new Set((Array.isArray(data?.characterIds)?data.characterIds:[]).map(v=>String(v).slice(0,120)).filter(Boolean))];
      await env.DB.prepare('DELETE FROM room_participant WHERE pl_id=? AND room_id=?').bind(playerId,roomId).run();
      await env.DB.prepare('INSERT OR IGNORE INTO room_participant(room_id,pl_id,character_id) VALUES(?,?,NULL)').bind(roomId,playerId).run();
      const inserts=ids.map(id=>env.DB.prepare('INSERT OR IGNORE INTO room_participant(room_id,pl_id,character_id) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM character WHERE pl_id=? AND character_id=?)').bind(roomId,playerId,id,playerId,id));
      if(inserts.length)await env.DB.batch(inserts);
      return json({ok:true,characterIds:ids});
    }
  }

  if(parts[0]==='characters'&&parts[1]&&method==='DELETE'){
    await env.DB.prepare('DELETE FROM character WHERE pl_id=? AND character_id=?').bind(playerId,parts[1]).run();
    return json({ok:true});
  }

  if(method==='PUT'&&parts.length===0){
    const plIconKey=String(data?.plIcon||'')?(await storeImage(env.LOGS,String(data.plIcon),'pl-icons')||master.pl_icon_key):master.pl_icon_key;
    await env.DB.prepare('UPDATE pl SET pl_name=?,pl_icon_key=?,pl_color=?,pl_color_dark=?,updated_at=CURRENT_TIMESTAMP WHERE pl_id=?').bind(String(data?.plName||master.pl_name).trim().slice(0,80),plIconKey,String(data?.plColor||master.pl_color).slice(0,40),String(data?.plColorDark||data?.plColor||master.pl_color_dark).slice(0,40),playerId).run();
    await upsertCharacters(env,playerId,data?.characters);
    const row=await masterRow(env.DB,playerId);
    return json({master:await responseMaster(env.DB,row)});
  }
  if(method==='GET'&&parts.length===0)return json({master:await responseMaster(env.DB,master)});
  return json({error:'Not found'},404);
}
