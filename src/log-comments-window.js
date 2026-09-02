import { parentRoomForLog,publicImagePath } from './data-model.js';

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const clean=(value,max=140)=>String(value??'').slice(0,max);

export async function handleLogCommentWindow(request,env,logId){
  const log=await parentRoomForLog(env.DB,logId);
  if(!log)return json({error:'部屋が見つかりません'},404);
  const roomId=log.room_id,url=new URL(request.url),viewer=clean(url.searchParams.get('authorId')||'',120);
  const ids=[...new Set(String(url.searchParams.get('messageIds')||'').split(',').map(v=>clean(v.trim())).filter(Boolean))].slice(0,80);
  const [revision,totalRow]=await Promise.all([
    env.DB.prepare('SELECT room_revision FROM room WHERE room_id=?').bind(roomId).first(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM comment WHERE room_id=? AND comment_target_type='log_range' AND comment_target_id=?").bind(roomId,logId).first()
  ]);
  const version=Number(revision?.room_revision)||0,totalCount=Number(totalRow?.n)||0;
  if(!ids.length)return json({annotations:[],version,totalCount});

  const marks=ids.map(()=>'?').join(','),args=[viewer,roomId,logId,...ids,...ids];
  const rows=(await env.DB.prepare(`
    SELECT c.comment_id,c.author_pl_id,c.author_character_id,c.comment_body,c.comment_image_key,c.parent_comment_id,c.created_at,c.updated_at,
      p.pl_name,p.pl_icon_key,ch.character_name,ch.character_type,ch.character_icon_key,
      r.start_line_id,r.end_line_id,r.start_character_offset,r.end_character_offset,r.selected_text,r.marker_color,
      (SELECT COUNT(*) FROM comment_reaction cr WHERE cr.comment_id=c.comment_id) AS like_count,
      EXISTS(SELECT 1 FROM comment_reaction cr WHERE cr.comment_id=c.comment_id AND cr.author_pl_id=?) AS liked_by_me
    FROM comment c
    JOIN log_comment_range r ON r.comment_id=c.comment_id
    JOIN pl p ON p.pl_id=c.author_pl_id
    LEFT JOIN character ch ON ch.character_id=c.author_character_id
    WHERE c.room_id=? AND c.comment_target_type='log_range' AND c.comment_target_id=?
      AND (r.start_line_id IN (${marks}) OR r.end_line_id IN (${marks}))
    ORDER BY c.created_at,c.comment_id
  `).bind(...args).all()).results||[];

  return json({
    annotations:rows.map(c=>({
      id:c.comment_id,room_id:logId,message_id:c.start_line_id||'',end_message_id:c.end_line_id||c.start_line_id||'',parent_id:c.parent_comment_id||'',
      start_offset:Number(c.start_character_offset)||0,end_offset:Number(c.end_character_offset)||0,quote:c.selected_text||'',color:c.marker_color||'yellow',
      author_id:c.author_pl_id,author_name:c.pl_name,persona_name:c.character_name||c.pl_name,persona_type:c.character_type||'PL',
      persona_icon:publicImagePath(c.author_character_id?'character':'pl',c.character_icon_key||c.pl_icon_key)||'',body:c.comment_body,
      created_at:c.created_at,updated_at:c.updated_at,has_image:c.comment_image_key?1:0,like_count:Number(c.like_count)||0,liked_by_me:!!c.liked_by_me
    })),
    version,totalCount
  });
}
