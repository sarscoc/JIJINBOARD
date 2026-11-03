import {playerKey} from './player-address.js';
import {serializeComment} from './comments.js';
import { parentRoomForLog } from './data-model.js';

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const clean=(value,max=140)=>String(value??'').slice(0,max);

export async function handleLogCommentWindow(request,env,logId){
  const log=await parentRoomForLog(env.DB,logId);
  if(!log)return json({error:'部屋が見つかりません'},404);
  const roomId=log.room_id,url=new URL(request.url),viewer=url.searchParams.get('authorId')?playerKey(roomId,clean(url.searchParams.get('authorId'),120)):'';
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
      ps.text_color AS pl_text_color,cs.text_color AS character_text_color,p.pl_name,p.pl_icon_key,ch.character_name,ch.character_type,ch.character_icon_key,
      r.start_line_id,r.end_line_id,r.start_character_offset,r.end_character_offset,r.selected_text,r.marker_color,
      (SELECT COUNT(*) FROM comment_reaction cr WHERE cr.comment_id=c.comment_id) AS like_count,
      EXISTS(SELECT 1 FROM comment_reaction cr WHERE cr.comment_id=c.comment_id AND cr.author_pl_id=?) AS liked_by_me
    FROM comment c
    JOIN log_comment_range r ON r.comment_id=c.comment_id
    JOIN pl p ON p.pl_id=c.author_pl_id
    LEFT JOIN character ch ON ch.character_id=c.author_character_id
  LEFT JOIN speaker_style ps ON ps.person_id=p.pl_id
  LEFT JOIN speaker_style cs ON cs.person_id=ch.character_id
    WHERE c.room_id=? AND c.comment_target_type='log_range' AND c.comment_target_id=?
      AND (r.start_line_id IN (${marks}) OR r.end_line_id IN (${marks}))
    ORDER BY c.created_at,c.comment_id
  `).bind(...args).all()).results||[];

  return json({
    annotations:rows.map(c=>serializeComment(roomId,{...c,comment_target_type:'log_range',comment_target_id:logId})),
    version,totalCount
  });
}

