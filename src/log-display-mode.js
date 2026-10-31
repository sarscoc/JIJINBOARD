import { verifyRoomAdmin,parentRoomForLog } from './data-model.js';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const normalize=value=>value==='dark'?'dark':'light';
export async function handleLogDisplayMode(request,env,roomId,logId){
  const log=await parentRoomForLog(env.DB,logId);if(!log||log.room_id!==roomId)return json({error:'自陣が見つかりません'},404);
  if(request.method==='GET')return json({displayMode:normalize(log.log_display_mode),updatedAt:log.log_updated_at||''});
  if(!await verifyRoomAdmin(env.DB,roomId,request.headers.get('x-board-admin-token')||''))return json({error:'ログの表示設定を変更できるのは部屋主だけです'},403);
  if(request.method!=='POST'&&request.method!=='PATCH')return json({error:'Method not allowed'},405);let body=null;try{body=await request.json()}catch{}const displayMode=normalize(body?.displayMode);await env.DB.prepare('UPDATE log SET log_display_mode=?,updated_at=CURRENT_TIMESTAMP WHERE log_id=? AND room_id=?').bind(displayMode,logId,roomId).run();return json({ok:true,displayMode});
}
