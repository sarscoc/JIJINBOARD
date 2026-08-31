import { parentRoomForLog,ensurePlIdentity } from './data-model.js';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const finite=(value,fallback=null)=>{const n=Number(value);return Number.isFinite(n)?n:fallback};
const characterIdFromItem=(itemId,authorId)=>{const prefix=`participant:${authorId}:`;return String(itemId||'').startsWith(prefix)?String(itemId).slice(prefix.length):String(itemId||'')};
export async function handleMatrixPoint(request,env,roomId,logId,itemId){
  if(request.method!=='PATCH')return json({error:'Method not allowed'},405);
  if(!roomId||!logId||!itemId)return json({error:'座標情報が足りません'},400);
  const log=await parentRoomForLog(env.DB,logId);if(!log||log.room_id!==roomId)return json({error:'この自陣にないログです'},404);
  let body=null;try{body=await request.json()}catch{}
  const authorId=String(body?.authorId||'').slice(0,120),authorName=String(body?.authorName||'').trim().slice(0,80),templateId=String(body?.templateId||'').slice(0,160);
  if(!authorId||!authorName)return json({error:'先に発言者を登録してください'},400);
  if(!templateId)return json({error:'テンプレート情報がありません'},400);
  await ensurePlIdentity(env.DB,authorId,authorName);
  await env.DB.prepare(`INSERT OR IGNORE INTO matrix_template(room_id,template_id,template_name,template_image_key,template_definition) VALUES(?,?,?,'','{}')`).bind(roomId,templateId,'MATRIX').run();
  const old=await env.DB.prepare('SELECT * FROM matrix_point WHERE room_id=? AND template_id=? AND point_id=?').bind(roomId,templateId,itemId).first();
  const placed=body?.placed!==undefined?!!body.placed:!!old?.is_placed,x=finite(body?.x,old?.point_x??null),y=finite(body?.y,old?.point_y??null),templateX=finite(body?.templateX,old?.template_x??null),templateY=finite(body?.templateY,old?.template_y??null),scale=finite(body?.scaleBaseWidth,old?.scale_base_width??null),version=Math.max(0,Math.min(10,Math.trunc(finite(body?.coordVersion,old?.coordinate_version??0))));
  const candidate=characterIdFromItem(itemId,authorId),ch=await env.DB.prepare('SELECT character_id FROM character WHERE character_id=?').bind(candidate).first();
  await env.DB.prepare(`INSERT INTO matrix_point(room_id,template_id,point_id,character_id,is_placed,point_x,point_y,template_x,template_y,scale_base_width,coordinate_version,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(room_id,template_id,point_id) DO UPDATE SET character_id=COALESCE(excluded.character_id,matrix_point.character_id),is_placed=excluded.is_placed,point_x=excluded.point_x,point_y=excluded.point_y,template_x=excluded.template_x,template_y=excluded.template_y,scale_base_width=excluded.scale_base_width,coordinate_version=excluded.coordinate_version,updated_at=CURRENT_TIMESTAMP`).bind(roomId,templateId,itemId,ch?.character_id||null,placed?1:0,x,y,templateX,templateY,scale,version).run();
  return json({ok:true,point:{itemId,templateId,placed,x,y,templateX,templateY,coordVersion:version,scaleBaseWidth:scale}});
}
