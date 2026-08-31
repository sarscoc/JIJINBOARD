import { randomToken,ensurePlIdentity,resolveCharacterIdentity,storeImage,verifyRoomAdmin,parentRoomForLog,publicImagePath } from './data-model.js';

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const safeBody=async request=>{try{return await request.json()}catch{return null}};
const clean=(value,max=4000)=>String(value??'').slice(0,max);
const roomHub=(env,roomId)=>env.ROOMS?env.ROOMS.get(env.ROOMS.idFromName(roomId)):null;

function notify(ctx,roomId,action,data){
  const hub=roomHub(ctx.env,roomId);if(!hub)return;
  const excludeClientId=clean(ctx.request.headers.get('x-realtime-client')||'',100);
  ctx.executionContext?.waitUntil?.(hub.fetch('https://room/notify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,data,excludeClientId})}).catch(()=>{}));
}

async function bumpRevision(db,roomId){
  const row=await db.prepare('UPDATE room SET room_revision=room_revision+1,updated_at=CURRENT_TIMESTAMP WHERE room_id=? RETURNING room_revision').bind(roomId).first();
  return Number(row?.room_revision)||0;
}

async function fastIdentity(env,body){
  const plId=clean(body?.authorId,120);if(!plId)return{plId:'',characterId:null,personaIcon:''};
  const plName=clean(body?.authorName||body?.plName||'PL',80).trim()||'PL';
  let pl=await env.DB.prepare('SELECT pl_id,pl_name,pl_icon_key FROM pl WHERE pl_id=?').bind(plId).first();
  if(!pl){pl=await ensurePlIdentity(env.DB,plId,plName)}else if(pl.pl_name!==plName){await env.DB.prepare('UPDATE pl SET pl_name=?,updated_at=CURRENT_TIMESTAMP WHERE pl_id=?').bind(plName,plId).run();pl.pl_name=plName}
  const type=clean(body?.personaType||'PL',8).toUpperCase();
  if(type==='PL')return{plId,characterId:null,personaIcon:publicImagePath('pl',pl?.pl_icon_key)||clean(body?.personaIcon,1000)};
  const personaName=clean(body?.personaName,80).trim();
  let ch=null;
  const requestedId=clean(body?.characterId,120);
  if(requestedId)ch=await env.DB.prepare('SELECT character_id,character_icon_key FROM character WHERE character_id=? AND pl_id=?').bind(requestedId,plId).first();
  if(!ch)ch=await env.DB.prepare('SELECT character_id,character_icon_key FROM character WHERE pl_id=? AND character_type=? AND character_name=? ORDER BY updated_at DESC LIMIT 1').bind(plId,type==='NPC'?'NPC':'PC',personaName).first();
  if(!ch){ch=await resolveCharacterIdentity(env.DB,plId,personaName,type,{plName,characterId:requestedId||undefined})}
  return{plId,characterId:ch?.character_id||null,personaIcon:publicImagePath('character',ch?.character_icon_key)||clean(body?.personaIcon,1000)};
}

function annotationFromBody(id,logId,body,who,imageKey=''){
  return {
    id,room_id:logId,message_id:clean(body?.messageId,140),end_message_id:clean(body?.endMessageId||body?.messageId,140),parent_id:clean(body?.parentId,120),
    start_offset:Number(body?.startOffset)||0,end_offset:Number(body?.endOffset)||0,quote:clean(body?.quote,2000),color:clean(body?.color||'yellow',40),
    author_id:who.plId,author_name:clean(body?.authorName,80),persona_name:clean(body?.personaName,80),persona_type:clean(body?.personaType||'PL',8),persona_icon:who.personaIcon||'',
    body:clean(body?.body,4000).trim(),created_at:new Date().toISOString(),updated_at:new Date().toISOString(),has_image:imageKey?1:0,like_count:0,liked_by_me:false
  };
}

export async function handleLogCommentMutation(request,env,logId,cid='',action='',executionContext=null){
  const log=await parentRoomForLog(env.DB,logId);if(!log)return json({error:'部屋が見つかりません'},404);
  const roomId=log.room_id,ctx={request,env,executionContext};

  if(request.method==='POST'&&!cid){
    const b=await safeBody(request),required=['messageId','quote','authorName','personaName','personaType'],missing=!b?required:required.filter(k=>b[k]==null||String(b[k]).trim()==='');
    if(missing.length)return json({error:`入力が足りません（${missing.join(', ')}）`},400);
    const text=clean(b.body,4000).trim();if(!text)return json({error:'感想を入力してください'},400);
    const who=await fastIdentity(env,b);if(!who.plId)return json({error:'参加者情報が必要です'},400);
    const id=randomToken(16),imageKey=b.imageData?await storeImage(env.LOGS,String(b.imageData),'comment-images'):'';
    await env.DB.batch([
      env.DB.prepare("INSERT INTO comment(comment_id,room_id,author_pl_id,author_character_id,comment_target_type,comment_target_id,comment_body,comment_image_key,parent_comment_id) VALUES(?,?,?,?,'log_range',?,?,?,?,NULLIF(?,''))").bind(id,roomId,who.plId,who.characterId,logId,text,imageKey||null,clean(b.parentId,120)),
      env.DB.prepare('INSERT INTO log_comment_range(comment_id,start_line_id,start_character_offset,end_line_id,end_character_offset,selected_text,marker_color) VALUES(?,?,?,?,?,?,?)').bind(id,clean(b.messageId,140),Number(b.startOffset)||0,clean(b.endMessageId||b.messageId,140),Number(b.endOffset)||0,clean(b.quote,2000),clean(b.color||'yellow',40))
    ]);
    const version=await bumpRevision(env.DB,roomId),annotation=annotationFromBody(id,logId,b,who,imageKey);
    notify(ctx,roomId,'comment:create',{logId,annotation,version});
    return json({annotation,version},201);
  }

  if(request.method==='POST'&&cid&&action==='like'){
    const b=await safeBody(request),authorId=clean(b?.authorId,120);if(!authorId)return json({error:'参加者情報が必要です'},400);
    if(!await env.DB.prepare('SELECT 1 FROM pl WHERE pl_id=?').bind(authorId).first())await ensurePlIdentity(env.DB,authorId,'PL');
    const old=await env.DB.prepare('SELECT 1 FROM comment_reaction WHERE comment_id=? AND author_pl_id=?').bind(cid,authorId).first();
    if(old)await env.DB.prepare('DELETE FROM comment_reaction WHERE comment_id=? AND author_pl_id=?').bind(cid,authorId).run();else await env.DB.prepare('INSERT INTO comment_reaction(comment_id,author_pl_id) VALUES(?,?)').bind(cid,authorId).run();
    const countRow=await env.DB.prepare('SELECT COUNT(*) AS n FROM comment_reaction WHERE comment_id=?').bind(cid).first(),likeCount=Number(countRow?.n)||0,liked=!old,version=await bumpRevision(env.DB,roomId);
    notify(ctx,roomId,'comment:like',{logId,id:cid,likeCount,actorId:authorId,liked,version});
    return json({liked,likeCount,version});
  }

  if(request.method==='PATCH'&&cid&&cid!=='color'){
    const b=await safeBody(request),c=await env.DB.prepare('SELECT author_pl_id,comment_image_key,parent_comment_id FROM comment WHERE comment_id=? AND room_id=? AND comment_target_id=?').bind(cid,roomId,logId).first();
    if(!c)return json({error:'コメントが見つかりません'},404);if(clean(b?.authorId,120)!==c.author_pl_id)return json({error:'自分のコメントだけ編集できます'},403);
    const text=clean(b?.body,4000).trim();let imageKey=c.comment_image_key||'';
    if(b?.imageData!==undefined&&b?.imageData!==null)imageKey=String(b.imageData||'')?await storeImage(env.LOGS,String(b.imageData),'comment-images'):'';
    if(!text&&!imageKey)return json({error:'感想または画像を入力してください'},400);
    const color=clean(b?.color||'yellow',40);
    await env.DB.batch([
      env.DB.prepare('UPDATE comment SET comment_body=?,comment_image_key=?,updated_at=CURRENT_TIMESTAMP WHERE comment_id=?').bind(text,imageKey||null,cid),
      env.DB.prepare('UPDATE log_comment_range SET marker_color=? WHERE comment_id=?').bind(color,cid)
    ]);
    const version=await bumpRevision(env.DB,roomId),patch={id:cid,body:text,color,has_image:imageKey?1:0,updated_at:new Date().toISOString(),parent_id:c.parent_comment_id||''};
    notify(ctx,roomId,'comment:edit',{logId,patch,version});return json({patch,version});
  }

  if(request.method==='DELETE'&&cid){
    const b=await safeBody(request),c=await env.DB.prepare('SELECT author_pl_id FROM comment WHERE comment_id=? AND room_id=? AND comment_target_id=?').bind(cid,roomId,logId).first();if(!c)return json({error:'コメントが見つかりません'},404);
    if(clean(b?.authorId,120)!==c.author_pl_id&&!await verifyRoomAdmin(env.DB,roomId,request.headers.get('x-admin-token')||''))return json({error:'自分のコメントだけ削除できます'},403);
    const rows=await env.DB.prepare(`WITH RECURSIVE d(id) AS (SELECT comment_id FROM comment WHERE comment_id=? UNION ALL SELECT c.comment_id FROM comment c JOIN d ON c.parent_comment_id=d.id) SELECT id FROM d`).bind(cid).all(),deletedIds=(rows.results||[]).map(r=>r.id);
    if(deletedIds.length)await env.DB.prepare(`WITH RECURSIVE d(id) AS (SELECT comment_id FROM comment WHERE comment_id=? UNION ALL SELECT c.comment_id FROM comment c JOIN d ON c.parent_comment_id=d.id) DELETE FROM comment WHERE comment_id IN (SELECT id FROM d)`).bind(cid).run();
    const version=await bumpRevision(env.DB,roomId);notify(ctx,roomId,'comment:delete',{logId,deletedIds,version});return json({deletedIds,version});
  }

  return null;
}
