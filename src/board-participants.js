import { ensurePlIdentity,resolveCharacterIdentity,storeImage,parentRoomForLog } from './data-model.js';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
export async function handleBoardParticipants(request,env,roomId,logId,personaId=''){
  const log=await parentRoomForLog(env.DB,logId);if(!log||log.room_id!==roomId)return json({error:'この自陣にないログです'},404);
  let body=null;try{body=await request.json()}catch{}
  const authorId=String(body?.authorId||'').slice(0,120),plName=String(body?.plName||'').trim().slice(0,80);if(!authorId)return json({error:'発言者情報がありません'},400);
  if(request.method==='POST'&&personaId){const ch=await env.DB.prepare('SELECT character_id FROM character WHERE character_id=? AND pl_id=?').bind(personaId,authorId).first();if(!ch)return json({error:'自分の参加PCだけ変更できます'},403);const key=await storeImage(env.LOGS,String(body?.icon||''),'matrix-icons');if(!key)return json({error:'画像を選択してください'},400);await env.DB.prepare('UPDATE character SET matrix_icon_key=?,updated_at=CURRENT_TIMESTAMP WHERE character_id=? AND pl_id=?').bind(key,personaId,authorId).run();return json({ok:true})}
  if(request.method==='POST'&&!personaId){
    const personas=Array.isArray(body?.personas)?body.personas.slice(0,24):[];if(!personas.length)return json({ok:true,ignoredEmpty:true});if(!plName)return json({error:'先に発言者を登録してください'},400);
    await ensurePlIdentity(env.DB,authorId,plName);
    const ids=[];for(const p of personas){const name=String(p?.name||'').trim().slice(0,80);if(!name)continue;const iconKey=await storeImage(env.LOGS,String(p?.icon||p?.baseIcon||''),'character-icons');const ch=await resolveCharacterIdentity(env.DB,authorId,name,String(p?.type||'PC'),{characterId:p?.id,plName,iconKey});if(ch)ids.push(ch.character_id)}
    await env.DB.prepare('DELETE FROM log_participant WHERE log_id=? AND character_id IN (SELECT character_id FROM character WHERE pl_id=?)').bind(logId,authorId).run();
    await env.DB.prepare('DELETE FROM room_participant WHERE room_id=? AND pl_id=?').bind(roomId,authorId).run();
    await env.DB.prepare('INSERT OR IGNORE INTO room_participant(room_id,pl_id,character_id) VALUES(?,?,NULL)').bind(roomId,authorId).run();
    const statements=[];ids.forEach((id,i)=>{statements.push(env.DB.prepare('INSERT OR IGNORE INTO room_participant(room_id,pl_id,character_id) VALUES(?,?,?)').bind(roomId,authorId,id));statements.push(env.DB.prepare('INSERT OR REPLACE INTO log_participant(log_id,character_id,participant_sort_order) VALUES(?,?,?)').bind(logId,id,i))});if(statements.length)await env.DB.batch(statements);return json({ok:true,participants:ids.length});
  }
  if(request.method==='DELETE'){
    if(personaId){const ch=await env.DB.prepare('SELECT character_id FROM character WHERE character_id=? AND pl_id=?').bind(personaId,authorId).first();if(!ch)return json({ok:true,deleted:0});const r=await env.DB.prepare('DELETE FROM log_participant WHERE log_id=? AND character_id=?').bind(logId,personaId).run();return json({ok:true,deleted:Number(r.meta?.changes||0)})}
    await env.DB.prepare('DELETE FROM log_participant WHERE log_id=? AND character_id IN (SELECT character_id FROM character WHERE pl_id=?)').bind(logId,authorId).run();return json({ok:true});
  }
  return null;
}
