import { ensurePlIdentity,resolveCharacterIdentity,storeImage,parentRoomForLog } from './data-model.js';

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const iconUrl=key=>{if(!key)return'';const hash=String(key).replace(/^r2:/,'').split('/').pop();return `/api/player-master/icon/${encodeURIComponent(hash)}`};

export async function handleRoomParticipants(request,env,roomId,logId='',characterId=''){
  if(logId){const log=await parentRoomForLog(env.DB,logId);if(!log||log.room_id!==roomId)return json({error:'この自陣にないログです'},404)}

  if(request.method==='GET'&&!characterId){
    const result=await env.DB.prepare(`SELECT rp.pl_id,c.character_id,c.character_name,c.character_type,c.character_icon_key,c.matrix_icon_key,p.pl_name
      FROM room_participant rp
      JOIN pl p ON p.pl_id=rp.pl_id
      JOIN character c ON c.character_id=rp.character_id
      WHERE rp.room_id=? AND rp.character_id IS NOT NULL
      ORDER BY rp.created_at,c.created_at,c.character_name`).bind(roomId).all();
    return json({participants:(result.results||[]).map(row=>({
      authorId:row.pl_id,
      plName:row.pl_name,
      personaId:row.character_id,
      name:row.character_name,
      type:row.character_type,
      icon:iconUrl(row.matrix_icon_key||row.character_icon_key),
      baseIcon:iconUrl(row.character_icon_key),
      matrixIcon:iconUrl(row.matrix_icon_key)
    }))});
  }

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
