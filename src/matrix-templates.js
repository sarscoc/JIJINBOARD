import { dataImage,ensurePlIdentity,parentRoomForLog } from './data-model.js';

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const safeBody=async request=>{try{return await request.json()}catch{return null}};
const templateKey=(roomId,templateId)=>`rooms/${roomId}/matrix/templates/${templateId}/image.webp`;
const imageUrl=(roomId,templateId)=>`/api/boards/${encodeURIComponent(roomId)}/matrix/templates/${encodeURIComponent(templateId)}/image`;

async function validateLog(db,roomId,logId){
  const log=await parentRoomForLog(db,logId);
  return !!log&&log.room_id===roomId;
}
function parseDefinition(text){try{const value=JSON.parse(text||'{}');return value&&typeof value==='object'?value:{}}catch{return{}}}
const cleanState=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};

export async function handleMatrixTemplates(request,env,roomId,logId,templateId='',imageOnly=false){
  if(!roomId)return json({error:'自陣が見つかりません'},404);
  if(imageOnly){
    if(request.method!=='GET')return json({error:'Method not allowed'},405);
    const row=await env.DB.prepare('SELECT template_image_key FROM matrix_template WHERE room_id=? AND template_id=?').bind(roomId,templateId).first();
    if(!row?.template_image_key)return new Response('Not found',{status:404});
    const object=await env.LOGS.get(row.template_image_key);if(!object)return new Response('Not found',{status:404});
    return new Response(object.body,{headers:{'content-type':object.httpMetadata?.contentType||'image/webp','cache-control':'private, max-age=31536000, immutable'}});
  }
  if(!logId||!await validateLog(env.DB,roomId,logId))return json({error:'この自陣にないログです'},404);

  if(request.method==='GET'&&!templateId){
    const rows=(await env.DB.prepare("SELECT template_id,template_name,template_image_key,template_definition,created_at,updated_at FROM matrix_template WHERE room_id=? AND template_id NOT LIKE '__matrix_state__:%' ORDER BY created_at,template_id").bind(roomId).all()).results||[];
    return json({templates:rows.map(row=>{const definition=parseDefinition(row.template_definition);return{record:{id:row.template_id,name:row.template_name,dataUrl:row.template_image_key?imageUrl(roomId,row.template_id):'',imageName:String(definition.imageName||''),createdAt:Number(definition.createdAt)||Date.parse(row.created_at)||Date.now(),updatedAt:Number(definition.updatedAt)||Date.parse(row.updated_at)||Date.now()},templateState:cleanState(definition.templateState)}})});
  }

  if(request.method==='PUT'&&templateId){
    const body=await safeBody(request),record=body?.record&&typeof body.record==='object'?body.record:{},templateState=cleanState(body?.templateState),authorId=String(body?.authorId||'').slice(0,120),authorName=String(body?.authorName||'').trim().slice(0,80);
    if(!authorId||!authorName)return json({error:'先に発言者を登録してください'},400);
    await ensurePlIdentity(env.DB,authorId,authorName);
    const old=await env.DB.prepare('SELECT template_image_key FROM matrix_template WHERE room_id=? AND template_id=?').bind(roomId,templateId).first();
    let key=String(old?.template_image_key||'');
    const raw=String(record.dataUrl||'');
    if(raw.startsWith('data:image/')){
      const image=dataImage(raw);if(!image)return json({error:'テンプレ画像を読み込めません'},400);
      if(image.bytes.byteLength>4_500_000)return json({error:'圧縮後のテンプレ画像が大きすぎます'},413);
      key=templateKey(roomId,templateId);
      await env.LOGS.put(key,image.bytes,{httpMetadata:{contentType:image.contentType||'image/webp',cacheControl:'private, max-age=31536000, immutable'}});
    }
    const name=String(record.name||'MATRIX').trim().slice(0,120)||'MATRIX';
    const createdAt=Number(record.createdAt)||Date.now(),updatedAt=Number(record.updatedAt)||Date.now();
    const definition=JSON.stringify({imageName:String(record.imageName||'').slice(0,180),createdAt,updatedAt,templateState});
    if(definition.length>900_000)return json({error:'テンプレートの配置情報が大きすぎます'},413);
    await env.DB.prepare(`INSERT INTO matrix_template(room_id,template_id,template_name,template_image_key,template_definition,updated_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(room_id,template_id) DO UPDATE SET template_name=excluded.template_name,template_image_key=CASE WHEN excluded.template_image_key<>'' THEN excluded.template_image_key ELSE matrix_template.template_image_key END,template_definition=excluded.template_definition,updated_at=CURRENT_TIMESTAMP`).bind(roomId,templateId,name,key,definition).run();
    return json({ok:true,record:{id:templateId,name,dataUrl:key?imageUrl(roomId,templateId):'',imageName:String(record.imageName||''),createdAt,updatedAt},templateState});
  }

  if(request.method==='DELETE'&&templateId){
    const row=await env.DB.prepare('SELECT template_image_key FROM matrix_template WHERE room_id=? AND template_id=?').bind(roomId,templateId).first();
    if(row?.template_image_key)await env.LOGS.delete(row.template_image_key).catch(()=>{});
    await env.DB.prepare('DELETE FROM matrix_template WHERE room_id=? AND template_id=?').bind(roomId,templateId).run();
    return json({ok:true});
  }

  return json({error:'Method not allowed'},405);
}
