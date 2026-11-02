import {ensureSchema} from './schema.js';
import {randomToken,tokenHash,verifyRoomAdmin,parentRoomForLog,bumpRoomRevision} from './data-model.js';
import {playerKey} from './player-address.js';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const bodyOf=async request=>{try{return await request.json()}catch{return null}};
export async function onRequest(ctx){
 const {request,env,params}=ctx;await ensureSchema(env.DB);
 const parts=Array.isArray(params.path)?params.path:String(params.path||'').split('/').filter(Boolean),method=request.method;
 if(parts[0]==='boards'){
  if(method==='POST'&&parts.length===1){
   const body=await bodyOf(request),name=String(body?.name||'').trim().slice(0,120),owner=String(body?.ownerId||'').slice(0,120);
   if(!name||!owner)return json({error:'部屋名と作成者情報が必要です'},400);
   const id=randomToken(20),adminToken=randomToken(24),ownerKey=playerKey(id,owner);
   await env.DB.prepare('INSERT INTO room(room_id,owner_pl_id,room_name,room_admin_token_hash) VALUES(?,?,?,?)').bind(id,ownerKey,name,await tokenHash(adminToken)).run();
   // The owner/admin key is separate from the participant's first PL registration.
   return json({id,adminToken,name},201);
  }
  const roomId=parts[1];if(!await env.DB.prepare('SELECT 1 FROM room WHERE room_id=?').bind(roomId||'').first())return json({error:'自陣が見つかりません'},404);
  if(method==='PATCH'&&parts.length===2){
   if(!await verifyRoomAdmin(env.DB,roomId,request.headers.get('x-board-admin-token')||''))return json({error:'部屋主だけが変更できます'},403);
   const body=await bodyOf(request),name=String(body?.name||'').trim().slice(0,120);if(!name)return json({error:'部屋名を入力してください'},400);
   await env.DB.prepare('UPDATE room SET room_name=?,updated_at=CURRENT_TIMESTAMP WHERE room_id=?').bind(name,roomId).run();return json({ok:true,name});
  }
 }
 if(parts[0]==='rooms'&&parts[1]){
  const logId=parts[1],log=await parentRoomForLog(env.DB,logId);if(!log)return json({error:'ログが見つかりません'},404);
  const board=log.room_id,hub=env.ROOMS?.get(env.ROOMS.idFromName(board));
  if(method==='GET'&&parts.length===2&&new URL(request.url).searchParams.get('summary')==='1')return json({id:log.log_id,title:log.log_name,createdAt:log.log_created_at});
  if(method==='GET'&&parts[2]==='realtime'&&parts.length===3){if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return json({error:'WebSocket接続が必要です'},426);return hub?hub.fetch(new Request(new URL('/realtime',request.url),request)):json({error:'リアルタイム機能が接続されていません'},503)}
  if(parts[2]==='presence'){
   if(!hub)return json({presence:[]});if(method==='GET')return hub.fetch('https://room/presence');
   if(method==='POST')return hub.fetch('https://room/presence',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(await bodyOf(request)||{})});
  }
  if(method==='PATCH'&&parts[2]==='annotations'&&parts[3]==='color'){
   const body=await bodyOf(request),raw=String(body?.authorId||'').slice(0,120),name=String(body?.personaName||''),type=body?.personaType==='PL'?'PL':body?.personaType==='NPC'?'NPC':'PC',color=String(body?.color||'').slice(0,40);
   if(!raw||!name||!color)return json({error:'色の更新情報が足りません'},400);
   const author=playerKey(board,raw);
   const char=type==='PL'?null:await env.DB.prepare('SELECT character_id FROM character WHERE pl_id=? AND character_name=? AND character_type=? LIMIT 1').bind(author,name,type).first();
   if(type==='PL'||char)await env.DB.prepare(`UPDATE log_comment_range SET marker_color=? WHERE comment_id IN (SELECT comment_id FROM comment WHERE room_id=? AND comment_target_type='log_range' AND comment_target_id=? AND author_pl_id=? AND ${type==='PL'?'author_character_id IS NULL':'author_character_id=?'})`).bind(color,board,logId,author,...(char?[char.character_id]:[])).run();
   await bumpRoomRevision(env.DB,board);
   if(hub)ctx.waitUntil(hub.fetch('https://room/notify',{method:'POST',body:JSON.stringify({action:'color',excludeClientId:request.headers.get('x-realtime-client')||''})}).catch(()=>{}));
   return json({ok:true});
  }
 }
 return json({error:'Not found'},404);
}
