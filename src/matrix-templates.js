import { dataImage,ensurePlIdentity,parentRoomForLog } from './data-model.js';

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const safeBody=async request=>{try{return await request.json()}catch{return null}};
const templateKey=(roomId,templateId)=>`rooms/${roomId}/matrix/templates/${templateId}/image.webp`;
const imageUrl=(roomId,templateId)=>`/api/boards/${encodeURIComponent(roomId)}/matrix/templates/${encodeURIComponent(templateId)}/image`;
const POINT_FIELDS=new Set(['placed','x','y','templateX','templateY','scaleBaseWidth','coordVersion','comment']);

async function validateLog(db,roomId,logId){
  const log=await parentRoomForLog(db,logId);
  return !!log&&log.room_id===roomId;
}
function parseDefinition(text){try{const value=JSON.parse(text||'{}');return value&&typeof value==='object'?value:{}}catch{return{}}}
function parseSettings(text){try{const value=JSON.parse(text||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}catch{return{}}}
const cleanState=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
const cloneObject=value=>{try{return JSON.parse(JSON.stringify(cleanState(value)))}catch{return{}}};
const finite=value=>{const n=Number(value);return Number.isFinite(n)?n:null};
function itemSettings(item){const settings={};for(const [key,value] of Object.entries(cleanState(item)))if(!POINT_FIELDS.has(key))settings[key]=value;return settings}
function applyPoint(state,point){
  state.items=state.items&&typeof state.items==='object'&&!Array.isArray(state.items)?state.items:{};
  const item={...parseSettings(point.point_settings),...(state.items[point.point_id]&&typeof state.items[point.point_id]==='object'?state.items[point.point_id]:{})};
  item.placed=!!point.is_placed;
  if(point.point_x!==null)item.x=Number(point.point_x);
  if(point.point_y!==null)item.y=Number(point.point_y);
  if(point.template_x!==null)item.templateX=Number(point.template_x);
  if(point.template_y!==null)item.templateY=Number(point.template_y);
  if(point.scale_base_width!==null)item.scaleBaseWidth=Number(point.scale_base_width);
  item.coordVersion=Number(point.coordinate_version)||0;
  item.comment=String(point.supplement_body||'');
  state.items[point.point_id]=item;
}
async function characterMap(db,roomId){
  const rows=(await db.prepare(`SELECT rp.pl_id,c.character_id FROM room_participant rp JOIN character c ON c.character_id=rp.character_id WHERE rp.room_id=? AND rp.character_id IS NOT NULL`).bind(roomId).all()).results||[];
  return new Map(rows.map(row=>[`participant:${row.pl_id}:${row.character_id}`,row.character_id]));
}
async function saveTemplatePoints(db,roomId,templateId,templateState){
  const items=cleanState(templateState.items),ids=Object.keys(items),characters=await characterMap(db,roomId);
  const existing=(await db.prepare('SELECT point_id FROM matrix_point WHERE room_id=? AND template_id=?').bind(roomId,templateId).all()).results||[];
  for(const row of existing)if(!Object.prototype.hasOwnProperty.call(items,row.point_id))await db.prepare('DELETE FROM matrix_point WHERE room_id=? AND template_id=? AND point_id=?').bind(roomId,templateId,row.point_id).run();
  for(const pointId of ids){
    const item=cleanState(items[pointId]),settings=JSON.stringify(itemSettings(item));
    if(settings.length>100_000)throw Object.assign(new Error('MATRIXのPC個別設定が大きすぎます'),{status:413});
    await db.prepare(`INSERT INTO matrix_point(room_id,template_id,point_id,character_id,is_placed,point_x,point_y,template_x,template_y,scale_base_width,coordinate_version,supplement_body,point_settings,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(room_id,template_id,point_id) DO UPDATE SET
        character_id=COALESCE(excluded.character_id,matrix_point.character_id),is_placed=excluded.is_placed,point_x=excluded.point_x,point_y=excluded.point_y,template_x=excluded.template_x,template_y=excluded.template_y,scale_base_width=excluded.scale_base_width,coordinate_version=excluded.coordinate_version,supplement_body=excluded.supplement_body,point_settings=excluded.point_settings,updated_at=CURRENT_TIMESTAMP`)
      .bind(roomId,templateId,pointId,characters.get(pointId)||null,item.placed?1:0,finite(item.x),finite(item.y),finite(item.templateX),finite(item.templateY),finite(item.scaleBaseWidth),Math.max(0,Math.min(10,Math.trunc(finite(item.coordVersion)??0))),String(item.comment||'').slice(0,4000),settings).run();
  }
}

export async function handleMatrixTemplates(request,env,roomId,logId,templateId='',imageOnly=false){
  if(!roomId)return json({error:'自陣が見つかりません'},404);
  if(imageOnly){
    if(request.method!=='GET')return json({error:'Method not allowed'},405);
    const row=await env.DB.prepare('SELECT template_image_key FROM matrix_template WHERE room_id=? AND template_id=?').bind(roomId,templateId).first();
    if(!row?.template_image_key)return new Response('Not found',{status:404});
    const object=await env.LOGS.get(row.template_image_key);if(!object)return new Response('Not found',{status:404});
    return new Response(object.body,{headers:{'content-type':object.httpMetadata?.contentType||'image/webp','cache-control':'private, no-cache'}});
  }
  if(!logId||!await validateLog(env.DB,roomId,logId))return json({error:'この自陣にないログです'},404);

  if(request.method==='GET'&&!templateId){
    const rows=(await env.DB.prepare('SELECT template_id,template_name,template_image_key,template_definition,created_at,updated_at FROM matrix_template WHERE room_id=? ORDER BY created_at,template_id').bind(roomId).all()).results||[];
    const points=(await env.DB.prepare('SELECT template_id,point_id,is_placed,point_x,point_y,template_x,template_y,scale_base_width,coordinate_version,supplement_body,point_settings FROM matrix_point WHERE room_id=?').bind(roomId).all()).results||[];
    const pointsByTemplate=new Map();
    for(const point of points){const list=pointsByTemplate.get(point.template_id)||[];list.push(point);pointsByTemplate.set(point.template_id,list)}
    return json({templates:rows.map(row=>{
      const definition=parseDefinition(row.template_definition),templateState=cloneObject(definition.templateState);
      for(const point of pointsByTemplate.get(row.template_id)||[])applyPoint(templateState,point);
      return{record:{id:row.template_id,name:row.template_name,dataUrl:row.template_image_key?imageUrl(roomId,row.template_id):'',imageName:String(definition.imageName||''),createdAt:Number(definition.createdAt)||Date.parse(row.created_at)||Date.now(),updatedAt:Number(definition.updatedAt)||Date.parse(row.updated_at)||Date.now()},templateState};
    })});
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
      await env.LOGS.put(key,image.bytes,{httpMetadata:{contentType:image.contentType||'image/webp',cacheControl:'private, no-cache'}});
    }
    const name=String(record.name||'MATRIX').trim().slice(0,120)||'MATRIX';
    const createdAt=Number(record.createdAt)||Date.now(),updatedAt=Number(record.updatedAt)||Date.now();
    const definitionState={...templateState,items:{}};
    const definition=JSON.stringify({imageName:String(record.imageName||'').slice(0,180),createdAt,updatedAt,templateState:definitionState});
    if(definition.length>300_000)return json({error:'テンプレート設定が大きすぎます'},413);
    await env.DB.prepare(`INSERT INTO matrix_template(room_id,template_id,template_name,template_image_key,template_definition,updated_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(room_id,template_id) DO UPDATE SET template_name=excluded.template_name,template_image_key=CASE WHEN excluded.template_image_key<>'' THEN excluded.template_image_key ELSE matrix_template.template_image_key END,template_definition=excluded.template_definition,updated_at=CURRENT_TIMESTAMP`).bind(roomId,templateId,name,key,definition).run();
    try{await saveTemplatePoints(env.DB,roomId,templateId,templateState)}catch(error){return json({error:error.message},error.status||500)}
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
