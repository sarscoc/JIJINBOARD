import { verifyRoomAdmin } from './data-model.js';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const color=value=>/^#[0-9a-f]{6}$/i.test(String(value||''))?String(value):null;
function normalize(input){if(color(input))return color(input);if(input&&typeof input==='object'){if(color(input.color))return color(input.color);for(const value of Object.values(input)){const c=color(value);if(c)return c}}return '#ffffff'}
export async function handleGroupRowColors(request,env,roomId){
  const room=await env.DB.prepare('SELECT room_id FROM room WHERE room_id=?').bind(roomId).first();if(!room)return json({error:'自陣が見つかりません'},404);
  if(request.method==='GET'){const row=await env.DB.prepare('SELECT group_row_color,updated_at FROM room_theme WHERE room_id=?').bind(roomId).first();return json({color:row?.group_row_color||'#ffffff',updatedAt:row?.updated_at||''})}
  if(!await verifyRoomAdmin(env.DB,roomId,request.headers.get('x-board-admin-token')||''))return json({error:'デザインを変更できるのは部屋主だけです'},403);
  if(request.method==='DELETE'){await env.DB.prepare("UPDATE room_theme SET group_row_color='#ffffff',updated_at=CURRENT_TIMESTAMP WHERE room_id=?").bind(roomId).run();return json({ok:true,color:'#ffffff'})}
  if(request.method!=='POST')return json({error:'Method not allowed'},405);let body=null;try{body=await request.json()}catch{}const shared=normalize(body?.color??body?.colors);
  await env.DB.prepare(`INSERT INTO room_theme(room_id,group_row_color,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(room_id) DO UPDATE SET group_row_color=excluded.group_row_color,updated_at=CURRENT_TIMESTAMP`).bind(roomId,shared).run();return json({ok:true,color:shared});
}
