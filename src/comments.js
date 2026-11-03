import {playerKey,localId,iconPrefix,playerIconUrl} from './player-address.js';
import '../public/shared/comment-target.js';
import {randomToken, ensurePlIdentity, resolveCharacterIdentity, storeImage, verifyRoomAdmin} from './data-model.js';

export const targets = globalThis.JijinCommentTarget;
const json = (data, status=200) => new Response(JSON.stringify(data), {status, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const fail = (message, status=400) => { throw Object.assign(Error(message), {status}); };
const clean = (v, max=4000) => String(v ?? '').slice(0,max);
const bodyOf = async request => { try { const b=await request.json(); if(b && typeof b==='object' && !Array.isArray(b))return b; } catch {} fail('コメント情報を読み込めません'); };
const select = `SELECT c.*,ps.text_color AS pl_text_color,cs.text_color AS character_text_color,p.pl_name,p.pl_icon_key,p.pl_color,p.pl_color_dark,
  ch.character_name,ch.character_type,ch.character_icon_key,ch.character_color,ch.character_color_dark,
  r.start_line_id,r.end_line_id,r.start_character_offset,r.end_character_offset,r.selected_text,r.marker_color,
  (SELECT COUNT(*) FROM comment_reaction cr WHERE cr.comment_id=c.comment_id) AS like_count,
  EXISTS(SELECT 1 FROM comment_reaction cr WHERE cr.comment_id=c.comment_id AND cr.author_pl_id=?) AS liked_by_me
  FROM comment c JOIN pl p ON p.pl_id=c.author_pl_id
  LEFT JOIN character ch ON ch.character_id=c.author_character_id
  LEFT JOIN speaker_style ps ON ps.person_id=p.pl_id
  LEFT JOIN speaker_style cs ON cs.person_id=ch.character_id
  LEFT JOIN log_comment_range r ON r.comment_id=c.comment_id`;

export function serializeComment(board, c) {
  const target=targets.fromStorage(board,c),isLog=c.comment_target_type==='log_range';
  return {id:c.comment_id,target,parent_id:c.parent_comment_id||'',author_id:localId(c.author_pl_id),author_name:c.pl_name,
    persona_name:c.character_name||c.pl_name,persona_type:c.character_type||'PL',
    text_color:c.author_character_id?(c.character_text_color||''):(c.pl_text_color||''),
    persona_icon:playerIconUrl(board,c.character_icon_key||c.pl_icon_key),
    color:isLog?(c.marker_color||'yellow'):`${c.character_color||c.pl_color||'#ffe66b'}|${c.character_color_dark||c.pl_color_dark||'#ffe66b'}`,
    body:c.comment_body,created_at:c.created_at,updated_at:c.updated_at,has_image:c.comment_image_key?1:0,
    like_count:Number(c.like_count)||0,liked_by_me:!!c.liked_by_me,
    // Read-only compatibility fields. New callers use target; stored IDs do not change.
    target_id:c.comment_target_id,cell_id:c.comment_target_type==='spreadsheet_cell'?c.comment_target_id:'',
    room_id:isLog?c.comment_target_id:'',message_id:c.start_line_id||'',end_message_id:c.end_line_id||c.start_line_id||'',
    start_offset:Number(c.start_character_offset)||0,end_offset:Number(c.end_character_offset)||0,quote:c.selected_text||''};
}
const item=serializeComment;
async function one(db,board,id,viewer='') {
  return db.prepare(`${select} WHERE c.room_id=? AND c.comment_id=?`).bind(viewer,board,id).first();
}
function conditions(scope, exact=false) {
  if (!scope) return {sql:'',args:[]};
  const t=scope;
  if (exact || t.messageId || t.pointId || t.cellId || t.legacyId) {
    const s=targets.storage(t),args=[s.type,s.key];
    let sql=' AND c.comment_target_type=? AND c.comment_target_id=?';
    if(t.kind==='log'){sql+=' AND r.start_line_id=? AND r.end_line_id=? AND r.start_character_offset=? AND r.end_character_offset=?';args.push(t.messageId,t.endMessageId,t.startOffset,t.endOffset)}
    return {sql,args};
  }
  if(t.kind==='log')return {sql:" AND c.comment_target_type='log_range' AND c.comment_target_id=?",args:[t.logId]};
  if(t.kind==='sheet')return {sql:" AND c.comment_target_type='spreadsheet_cell'",args:[]};
  if(t.legacyId)return conditions(t,true);
  if(t.templateId)return {sql:" AND c.comment_target_type='matrix_template' AND instr(c.comment_target_id,?)=1",args:[`${t.templateId}@@matrix-template@@`]};
  return {sql:" AND c.comment_target_type IN ('matrix_point','matrix_template')",args:[]};
}
async function validateTarget(db, board, t, write=false) {
  if(t.kind==='log' && !await db.prepare('SELECT 1 FROM log WHERE log_id=? AND room_id=?').bind(t.logId,board).first())fail('この自陣にないログです',404);
  if(write && t.kind==='matrix' && t.templateId){
    const page=await db.prepare('SELECT template_image_key FROM matrix_template WHERE room_id=? AND template_id=?').bind(board,t.templateId).first();
    if(!page || page.template_image_key==='__deleted__')fail('テンプレートが見つかりません',404);
  }
}
async function identity(env,b,board) {
  const rawId=clean(b.authorId,120);if(!rawId)fail('参加者情報が必要です');
  const plId=playerKey(board,rawId);
  const old=await env.DB.prepare('SELECT * FROM pl WHERE pl_id=?').bind(plId).first();
  const name=clean(b.authorName||b.plName||old?.pl_name||'PL',80).trim()||'PL';
  await ensurePlIdentity(env.DB,plId,name);
  const type=clean(b.personaType||'PL',8).toUpperCase();
  if(!['PL','PC','NPC'].includes(type))fail('発言者の種類が不正です');
  if(type==='PL')return {plId,characterId:null};
  const personaName=clean(b.personaName,80).trim();if(!personaName)fail('発言者名が必要です');
  const iconKey=b.personaIcon?await storeImage(env.LOGS,String(b.personaIcon),iconPrefix(board,'character-icons')):'';
  const character=await resolveCharacterIdentity(env.DB,plId,personaName,type,{plName:name,characterId:clean(b.characterId,120)||undefined,iconKey});
  if(!character || character.pl_id!==plId)fail('発言者情報を確認してください',403);
  return {plId,characterId:character.character_id};
}
export async function notifyComments(request,env,board,action,data,executionContext) {
  if(!env.ROOMS)return;
  const hub=env.ROOMS.get(env.ROOMS.idFromName(board));
  const notification=hub.fetch('https://room/notify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,data:{boardId:board,...data},excludeClientId:request.headers.get('x-realtime-client')||''})}).catch(error=>console.warn('Comment notification failed',error));
  if(executionContext?.waitUntil)executionContext.waitUntil(notification);else await notification;
}
async function version(db,board) {
  const row=await db.prepare('SELECT room_revision FROM room WHERE room_id=?').bind(board).first();return Number(row?.room_revision)||0;
}
const bump = (db,board) => db.prepare('UPDATE room SET room_revision=room_revision+1,updated_at=CURRENT_TIMESTAMP WHERE room_id=?').bind(board);

// Notes are a single display label on a target, not an authored discussion. They
// use the same address/API/notification channel, retaining the existing point row.
async function note(request,env,board,b,executionContext) {
  const t=targets.parse(b.target,board);
  if(t.kind!=='matrix'||!t.pointId)fail('コマのアドレスを指定してください');
  await validateTarget(env.DB,board,t,true);await identity(env,b,board);
  const text=clean(b.body ?? b.comment),position=['top','bottom','left','right'].includes(b.commentPosition)?b.commentPosition:'top';
  const settings=JSON.stringify({commentPosition:position,commentDeleted:!text});
  const recover=!!b.recoverIfEmpty,hasBase=Object.hasOwn(b,'baseComment'),base=clean(b.baseComment);
  const result=await env.DB.prepare(`INSERT INTO matrix_point(room_id,template_id,point_id,supplement_body,point_settings)
    SELECT ?,?,?,?,? WHERE ?=0 OR ?='' OR EXISTS(SELECT 1 FROM matrix_point WHERE room_id=? AND template_id=? AND point_id=?)
    ON CONFLICT(room_id,template_id,point_id) DO UPDATE SET supplement_body=excluded.supplement_body,
      point_settings=json_patch(matrix_point.point_settings,excluded.point_settings),updated_at=CURRENT_TIMESTAMP
    WHERE (?=0 OR matrix_point.supplement_body=?) AND (?=0 OR (matrix_point.supplement_body='' AND COALESCE(json_extract(matrix_point.point_settings,'$.commentDeleted'),0)=0))`)
    .bind(board,t.templateId,t.pointId,text,settings,hasBase?1:0,base,board,t.templateId,t.pointId,hasBase?1:0,base,recover?1:0).run();
  const row=await env.DB.prepare('SELECT supplement_body,point_settings FROM matrix_point WHERE room_id=? AND template_id=? AND point_id=?').bind(board,t.templateId,t.pointId).first();
  const point={templateId:t.templateId,itemId:t.pointId,comment:row?.supplement_body||'',commentPosition:JSON.parse(row?.point_settings||'{}').commentPosition||'top'};
  if(!result.meta?.changes&&!recover) return json({error:'コマのコメントが更新されています。最新の内容を確認してから編集してください。',point},409);
  if(result.meta?.changes){await bump(env.DB,board).run();await notifyComments(request,env,board,'comment:note',{target:t.address,point},executionContext)}
  return json({ok:true,kind:'display',target:t.address,body:point.comment,point});
}

export async function handleComments(request,env,board,id='',action='',executionContext=null,legacy={}) {
  try {
    if(!await env.DB.prepare('SELECT room_id FROM room WHERE room_id=?').bind(board).first())fail('自陣が見つかりません',404);
    const url=new URL(request.url),method=request.method;
    const scopeValue=legacy.scope||url.searchParams.get('scope'),scope=scopeValue?targets.parse(scopeValue,board):null;
    const targetValue=url.searchParams.get('target'),exact=targetValue?targets.parse(targetValue,board):null;
    if(scope)await validateTarget(env.DB,board,scope);
    if(exact)await validateTarget(env.DB,board,exact);
    const within=(parent,target)=>{
      if(!parent)return true;
      if(parent.kind!==target.kind)return false;
      if(parent.kind==='log')return parent.logId===target.logId&&(!parent.messageId||parent.address===target.address);
      if(parent.kind==='sheet')return !parent.cellId||parent.cellId===target.cellId;
      if(parent.legacyId)return parent.address===target.address;
      return (!parent.templateId||parent.templateId===target.templateId)&&(!parent.pointId||parent.pointId===target.pointId);
    };
    const matches=target=>within(scope,target)&&(!exact||target.address===exact.address);
    const match=c=>matches(targets.parse(targets.fromStorage(board,c),board));
    if(scope&&exact&&!within(scope,exact))fail('コメントの対象と範囲が一致しません');
    if(method==='GET'&&!id){
      const viewerId=clean(url.searchParams.get('authorId'),120),viewer=viewerId?playerKey(board,viewerId):'',filter=conditions(exact||scope,!!exact);
      const [v,rows]=await env.DB.batch([
        env.DB.prepare('SELECT room_revision FROM room WHERE room_id=?').bind(board),
        env.DB.prepare(`${select} WHERE c.room_id=?${filter.sql} ORDER BY c.created_at,c.comment_id`).bind(viewer,board,...filter.args)
      ]);
      const comments=(rows.results||[]).map(c=>item(board,c));return json({comments,annotations:comments,version:Number(v.results?.[0]?.room_revision)||0});
    }
    if(method==='GET'&&id==='version')return json({version:await version(env.DB,board)});
    if(method==='GET'&&id==='note'){
      if(!exact||exact.kind!=='matrix'||!exact.pointId)fail('コマのアドレスを指定してください');
      await validateTarget(env.DB,board,exact,true);
      const row=await env.DB.prepare('SELECT supplement_body,point_settings FROM matrix_point WHERE room_id=? AND template_id=? AND point_id=?').bind(board,exact.templateId,exact.pointId).first();
      return json({kind:'display',target:exact.address,body:row?.supplement_body||'',commentPosition:JSON.parse(row?.point_settings||'{}').commentPosition||'top'});
    }
    if(method==='PUT'&&id==='note')return await note(request,env,board,await bodyOf(request),executionContext);
    if(method==='POST'&&!id){
      const b=await bodyOf(request),target=targets.parse(b.target,board),stored=targets.storage(target),text=clean(b.body).trim(),parent=clean(b.parentId,120);
      if(!matches(target))fail('コメントの対象と範囲が一致しません');
      if(!text&&!b.imageData)fail('感想または画像を入力してください');
      await validateTarget(env.DB,board,target,true);
      if(parent){const row=await one(env.DB,board,parent);if(!row)fail('返信先が見つかりません',404);if(targets.fromStorage(board,row)!==target.address)fail('返信先とコメント対象が一致しません')}
      const who=await identity(env,b,board),cid=randomToken(16),imageKey=b.imageData?await storeImage(env.LOGS,b.imageData,iconPrefix(board,'comment-images')):'';
      if(!text&&!imageKey)fail('画像を読み込めません');
      const writes=[env.DB.prepare(`INSERT INTO comment(comment_id,room_id,author_pl_id,author_character_id,comment_target_type,comment_target_id,comment_body,comment_image_key,parent_comment_id) VALUES(?,?,?,?,?,?,?,?,NULLIF(?,''))`).bind(cid,board,who.plId,who.characterId,stored.type,stored.key,text,imageKey||null,parent)];
      if(target.kind==='log')writes.push(env.DB.prepare('INSERT INTO log_comment_range(comment_id,start_line_id,start_character_offset,end_line_id,end_character_offset,selected_text,marker_color) VALUES(?,?,?,?,?,?,?)').bind(cid,target.messageId,target.startOffset,target.endMessageId,target.endOffset,clean(b.quote,2000),clean(b.color||'yellow',40)));
      writes.push(bump(env.DB,board));await env.DB.batch(writes);
      const comment=item(board,await one(env.DB,board,cid,who.plId)),v=await version(env.DB,board);
      await notifyComments(request,env,board,'comment:create',{target:comment.target,comment,annotation:comment,logId:comment.room_id,version:v},executionContext);
      return json({id:cid,comment,annotation:comment,version:v},201);
    }
    const row=id?await one(env.DB,board,id,url.searchParams.get('authorId')?playerKey(board,clean(url.searchParams.get('authorId'),120)):''):null;
    if(!row||!match(row))fail('コメントが見つかりません',404);
    const target=targets.fromStorage(board,row),logId=row.comment_target_type==='log_range'?row.comment_target_id:'';
    if(method==='GET'&&action==='image'){
      const object=row.comment_image_key?await env.LOGS.get(row.comment_image_key):null;
      return object?new Response(object.body,{headers:{'content-type':object.httpMetadata?.contentType||'image/webp','cache-control':'private, no-store'}}):new Response('Not found',{status:404});
    }
    if(method==='GET')return json({comment:item(board,row)});
    const b=await bodyOf(request),rawAuthor=clean(b.authorId,120),author=rawAuthor?playerKey(board,rawAuthor):'';
    if(method==='POST'&&action==='like'){
      if(!author)fail('参加者情報が必要です');
      if(!await env.DB.prepare('SELECT 1 FROM pl WHERE pl_id=?').bind(author).first())await ensurePlIdentity(env.DB,author,b.authorName||'PL');
      const old=await env.DB.prepare('SELECT 1 FROM comment_reaction WHERE comment_id=? AND author_pl_id=?').bind(id,author).first();
      await env.DB.batch([old?env.DB.prepare('DELETE FROM comment_reaction WHERE comment_id=? AND author_pl_id=?').bind(id,author):env.DB.prepare('INSERT OR IGNORE INTO comment_reaction(comment_id,author_pl_id) VALUES(?,?)').bind(id,author),bump(env.DB,board)]);
      const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM comment_reaction WHERE comment_id=?').bind(id).first(),v=await version(env.DB,board),data={target,logId,id,actorId:localId(author),liked:!old,likeCount:Number(count.n)||0,version:v};
      await notifyComments(request,env,board,'comment:like',data,executionContext);return json(data);
    }
    if(row.author_pl_id!==author && !(method==='DELETE'&&await verifyRoomAdmin(env.DB,board,request.headers.get('x-admin-token')||'')))fail('自分のコメントだけ編集・削除できます',403);
    if(method==='PATCH'){
      if(b.target && targets.parse(b.target,board).address!==target)fail('コメントの対象は変更できません');
      const text=clean(b.body??row.comment_body).trim();let image=row.comment_image_key;
      if(b.imageData!==undefined&&b.imageData!==null)image=b.imageData?await storeImage(env.LOGS,b.imageData,iconPrefix(board,'comment-images')):null;
      if(!text&&!image)fail('感想または画像を入力してください');
      const writes=[env.DB.prepare('UPDATE comment SET comment_body=?,comment_image_key=?,updated_at=CURRENT_TIMESTAMP WHERE comment_id=? AND room_id=?').bind(text,image||null,id,board)];
      if(logId&&b.color!==undefined)writes.push(env.DB.prepare('UPDATE log_comment_range SET marker_color=? WHERE comment_id=?').bind(clean(b.color,40),id));
      writes.push(bump(env.DB,board));await env.DB.batch(writes);
      const comment=item(board,await one(env.DB,board,id,author)),v=await version(env.DB,board);
      const {liked_by_me,...patch}=comment;
      await notifyComments(request,env,board,'comment:edit',{target,logId,comment:patch,patch,version:v},executionContext);return json({ok:true,comment,patch,version:v});
    }
    if(method==='DELETE'){
      const descendants=`WITH RECURSIVE d(id) AS (SELECT comment_id FROM comment WHERE comment_id=? AND room_id=? UNION SELECT c.comment_id FROM comment c JOIN d ON c.parent_comment_id=d.id WHERE c.room_id=?)`;
      const rows=await env.DB.prepare(`${descendants} SELECT id FROM d`).bind(id,board,board).all(),deletedIds=(rows.results||[]).map(r=>r.id);
      await env.DB.batch([env.DB.prepare(`${descendants} DELETE FROM comment WHERE comment_id IN (SELECT id FROM d)`).bind(id,board,board),bump(env.DB,board)]);
      const v=await version(env.DB,board);await notifyComments(request,env,board,'comment:delete',{target,logId,deletedIds,version:v},executionContext);return json({ok:true,deletedIds,version:v});
    }
    return json({error:'Method not allowed'},405);
  } catch(error) { if(error.status || error instanceof URIError || /アドレス|対象|範囲|ID/.test(error.message))return json({error:error.message},error.status||400);throw error; }
}

