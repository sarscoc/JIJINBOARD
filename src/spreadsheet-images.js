const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const allowedTypes=new Set(['cell_image','global_background','character_background']);
const sheetId=roomId=>`sheet:${roomId}`;
const imageId=()=>crypto.randomUUID?.()||`img_${Date.now()}_${Math.random().toString(36).slice(2)}`;
const extension=type=>type==='image/png'?'png':type==='image/jpeg'?'jpg':type==='image/gif'?'gif':type==='image/svg+xml'?'svg':'webp';
const keyFor=(roomId,id,type)=>`rooms/${roomId}/spreadsheet/images/${id}.${extension(type)}`;

async function ensureSheet(db,roomId){
  const room=await db.prepare('SELECT room_id FROM room WHERE room_id=?').bind(roomId).first();
  if(!room)return null;
  const sid=sheetId(roomId);
  await db.prepare(`INSERT INTO spreadsheet(sheet_id,room_id,sheet_name,row_count,column_count,sheet_settings,updated_at)
    VALUES(?,?,?,0,0,'{}',CURRENT_TIMESTAMP)
    ON CONFLICT(sheet_id) DO NOTHING`).bind(sid,roomId,'Spreadsheet').run();
  return sid;
}

export async function handleSpreadsheetImage(request,env,roomId){
  const sid=await ensureSheet(env.DB,roomId);if(!sid)return json({error:'自陣が見つかりません'},404);
  const url=new URL(request.url),type=String(url.searchParams.get('type')||''),targetId=String(url.searchParams.get('target')||'').slice(0,500);
  if(!allowedTypes.has(type)||!targetId)return json({error:'画像の保存先が不正です'},400);
  const row=await env.DB.prepare('SELECT image_id,image_key,content_type FROM spreadsheet_image WHERE sheet_id=? AND image_type=? AND target_id=?').bind(sid,type,targetId).first();

  if(request.method==='GET'){
    if(!row?.image_key)return new Response('Not found',{status:404,headers:{'cache-control':'no-store'}});
    const object=await env.LOGS.get(row.image_key);if(!object)return new Response('Not found',{status:404,headers:{'cache-control':'no-store'}});
    return new Response(object.body,{headers:{'content-type':object.httpMetadata?.contentType||row.content_type||'image/webp','cache-control':'private, no-cache'}});
  }

  if(request.method==='PUT'){
    const contentType=String(request.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
    if(!contentType.startsWith('image/'))return json({error:'画像ファイルを送信してください'},415);
    const bytes=await request.arrayBuffer();
    if(!bytes.byteLength)return json({error:'画像が空です'},400);
    if(bytes.byteLength>5_000_000)return json({error:'圧縮後の画像が大きすぎます'},413);
    const id=String(row?.image_id||imageId()),nextKey=keyFor(roomId,id,contentType);
    if(row?.image_key&&row.image_key!==nextKey)await env.LOGS.delete(row.image_key).catch(()=>{});
    await env.LOGS.put(nextKey,bytes,{httpMetadata:{contentType,cacheControl:'private, no-cache'}});
    await env.DB.prepare(`INSERT INTO spreadsheet_image(image_id,sheet_id,image_type,target_id,image_key,content_type,updated_at)
      VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(sheet_id,image_type,target_id) DO UPDATE SET image_key=excluded.image_key,content_type=excluded.content_type,updated_at=CURRENT_TIMESTAMP`)
      .bind(id,sid,type,targetId,nextKey,contentType).run();
    return json({ok:true,imageId:id});
  }

  if(request.method==='DELETE'){
    if(row?.image_key)await env.LOGS.delete(row.image_key).catch(()=>{});
    await env.DB.prepare('DELETE FROM spreadsheet_image WHERE sheet_id=? AND image_type=? AND target_id=?').bind(sid,type,targetId).run();
    return json({ok:true});
  }
  return json({error:'Method not allowed'},405);
}
