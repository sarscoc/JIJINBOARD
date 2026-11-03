import {playerKey,characterKey,localId,iconPrefix,playerIconUrl} from './player-address.js';
import { ensurePlIdentity,resolveCharacterIdentity,storeImage,parentRoomForLog } from './data-model.js';

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});


async function roomParticipants(request,env,roomId,logId='',characterId=''){
  if(logId){const log=await parentRoomForLog(env.DB,logId);if(!log||log.room_id!==roomId)return json({error:'この自陣にないログです'},404)}

  if(request.method==='GET'&&!characterId){
    return json(await publicParticipants(env.DB,roomId));
  }

  let body=null;try{body=await request.json()}catch{}
  const rawPlId=String(body?.authorId||'').slice(0,120),plName=String(body?.plName||'').trim().slice(0,80);if(!rawPlId)return json({error:'発言者情報がありません'},400);

  const plId=playerKey(roomId,rawPlId),charId=characterId?characterKey(roomId,rawPlId,characterId):'';
  if(request.method==='POST'&&characterId){
    const character=await env.DB.prepare('SELECT character_id FROM character WHERE character_id=? AND pl_id=?').bind(charId,plId).first();if(!character)return json({error:'自分のPCだけ変更できます'},403);
    const key=await storeImage(env.LOGS,String(body?.icon||''),iconPrefix(roomId,'matrix-icons'));if(!key)return json({error:'画像を選択してください'},400);
    await env.DB.prepare('UPDATE character SET matrix_icon_key=?,updated_at=CURRENT_TIMESTAMP WHERE character_id=? AND pl_id=?').bind(key,charId,plId).run();
    return json({ok:true});
  }

  if(request.method==='POST'){
    const personas=Array.isArray(body?.personas)?body.personas.slice(0,100):[];if(!plName)return json({error:'先に発言者を登録してください'},400);
    await ensurePlIdentity(env.DB,plId,plName);
    const ids=[];
    for(const persona of personas){
      const name=String(persona?.name||'').trim().slice(0,80);if(!name)continue;
      const iconKey=await storeImage(env.LOGS,String(persona?.icon||persona?.baseIcon||''),iconPrefix(roomId,'character-icons'));
      const character=await resolveCharacterIdentity(env.DB,plId,name,String(persona?.type||'PC'),{characterId:persona?.id,plName,iconKey,color:persona?.color?String(persona.color).split('|')[0]:undefined,colorDark:persona?.colorDark});if(character)ids.push(character.character_id);
    }
    await env.DB.prepare('DELETE FROM room_participant WHERE room_id=? AND pl_id=?').bind(roomId,plId).run();
    await env.DB.prepare('INSERT OR IGNORE INTO room_participant(room_id,pl_id,character_id) VALUES(?,?,NULL)').bind(roomId,plId).run();
    if(ids.length)await env.DB.batch(ids.map(id=>env.DB.prepare('INSERT OR IGNORE INTO room_participant(room_id,pl_id,character_id) VALUES(?,?,?)').bind(roomId,plId,id)));
    return json({ok:true,participants:ids.length});
  }

  if(request.method==='DELETE'){
    if(characterId){const result=await env.DB.prepare('DELETE FROM room_participant WHERE room_id=? AND pl_id=? AND character_id=?').bind(roomId,plId,charId).run();return json({ok:true,deleted:Number(result.meta?.changes||0)})}
    await env.DB.prepare('DELETE FROM room_participant WHERE room_id=? AND pl_id=?').bind(roomId,plId).run();return json({ok:true});
  }

  return null;
}


export async function handleRoomParticipants(request,env,roomId,logId='',characterId='',context){
 const response=await roomParticipants(request,env,roomId,logId,characterId);
 if(response?.ok&&!['GET','HEAD','OPTIONS'].includes(request.method)&&env.ROOMS){
  const task=(async()=>{await env.DB.prepare('UPDATE room SET room_revision=room_revision+1 WHERE room_id=?').bind(roomId).run();const snapshot=await publicParticipants(env.DB,roomId);return env.ROOMS.get(env.ROOMS.idFromName(roomId)).fetch('https://room/notify',{method:'POST',body:JSON.stringify({action:'participants',data:{profileChanged:true,...snapshot}})})})().catch(()=>{});
  if(context?.waitUntil)context.waitUntil(task);else await task;
 }
 return response;
}

export async function publicParticipants(db,roomId){
    const version=await db.prepare('SELECT room_revision FROM room WHERE room_id=?').bind(roomId).first(),revision=Number(version?.room_revision)||0;
    const result=await db.prepare(`SELECT rp.pl_id,c.character_id,c.character_name,c.character_type,c.character_color,c.character_icon_key,c.matrix_icon_key,p.pl_name,s.text_color
      FROM room_participant rp
      JOIN pl p ON p.pl_id=rp.pl_id
      JOIN character c ON c.character_id=rp.character_id
      LEFT JOIN speaker_style s ON s.person_id=c.character_id
      WHERE rp.room_id=? AND rp.character_id IS NOT NULL
      ORDER BY rp.created_at,c.created_at,c.character_name`).bind(roomId).all();
    return {participants:(result.results||[]).map(row=>({
      authorId:localId(row.pl_id),
      plName:row.pl_name,
      personaId:localId(row.character_id),
      name:row.character_name,
      type:row.character_type,
      textColor:row.text_color||'',
      color:String(row.character_color||'').split('|')[0],
      icon:playerIconUrl(roomId,row.matrix_icon_key||row.character_icon_key),
      baseIcon:playerIconUrl(roomId,row.character_icon_key),
      matrixIcon:playerIconUrl(roomId,row.matrix_icon_key)
    })),revision};
}
