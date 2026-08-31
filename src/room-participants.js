import { ensurePlIdentity,resolveCharacterIdentity,storeImage,parentRoomForLog } from './data-model.js';

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});

export async function handleRoomParticipants(request,env,roomId,logId='',characterId=''){
  if(logId){const log=await parentRoomForLog(env.DB,logId);if(!log||log.room_id!==roomId)return json({error:'この自陣にないログです'},404)}
  let body=null;try{body=await request.json()}catch{}
  const plId=String(body?.authorId||'').slice(0,120),plName=String(body?.plName||'').trim().slice(0,80);if(!plId)return json({error:'発言者情報がありません'},400);

  if(request.method==='POST'&&characterId){
    const character=await env.DB.prepare('SELECT character_id FROM character WHERE character_id=? AND pl_id=?').bind(characterId,plId).first();if(!character)return json({error:'自分のPCだけ変更できます'},403);
    const key=await storeImage(env.LOGS,String(body?.icon||''),'matrix-icons');if(!key)return json({error:'画像を選択してください'},400);
    await env.DB.prepare('UPDATE character SET matrix_icon_key=?,updated_at=CURRENT_TIMESTAMP WHERE character_id=? AND pl_id=?').bind(key,characterId,plId).run();
    return json({ok:true});
  }

  if(request.method==='POST'){
    const personas=Array.isArray(body?.personas)?body.personas.slice(0,100):[];if(!plName)return json({error:'先に発言者を登録してください'},400);
    await ensurePlIdentity(env.DB,plId,plName);
    const ids=[];
    for(const persona of personas){
      const name=String(persona?.name||'').trim().slice(0,80);if(!name)continue;
      const iconKey=await storeImage(env.LOGS,String(persona?.icon||persona?.baseIcon||''),'character-icons');
      const character=await resolveCharacterIdentity(env.DB,plId,name,String(persona?.type||'PC'),{characterId:persona?.id,plName,iconKey});if(character)ids.push(character.character_id);
    }
    await env.DB.prepare('DELETE FROM room_participant WHERE room_id=? AND pl_id=?').bind(roomId,plId).run();
    await env.DB.prepare('INSERT OR IGNORE INTO room_participant(room_id,pl_id,character_id) VALUES(?,?,NULL)').bind(roomId,plId).run();
    if(ids.length)await env.DB.batch(ids.map(id=>env.DB.prepare('INSERT OR IGNORE INTO room_participant(room_id,pl_id,character_id) VALUES(?,?,?)').bind(roomId,plId,id)));
    return json({ok:true,participants:ids.length});
  }

  if(request.method==='DELETE'){
    if(characterId){const result=await env.DB.prepare('DELETE FROM room_participant WHERE room_id=? AND pl_id=? AND character_id=?').bind(roomId,plId,characterId).run();return json({ok:true,deleted:Number(result.meta?.changes||0)})}
    await env.DB.prepare('DELETE FROM room_participant WHERE room_id=? AND pl_id=?').bind(roomId,plId).run();return json({ok:true});
  }

  return null;
}
