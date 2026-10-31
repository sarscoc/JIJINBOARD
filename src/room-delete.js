import { verifyRoomAdmin,deleteR2Prefix } from './data-model.js';

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});

export async function handleRoomDelete(request,env,roomId,executionContext){
  if(request.method!=='DELETE')return null;
  const room=await env.DB.prepare('SELECT room_id FROM room WHERE room_id=?').bind(roomId).first();
  if(!room)return json({error:'自陣が見つかりません'},404);
  const token=String(request.headers.get('x-board-admin-token')||'');
  if(!await verifyRoomAdmin(env.DB,roomId,token))return json({error:'この自陣を削除する権限がありません'},403);

  await deleteR2Prefix(env.LOGS,`rooms/${roomId}/`);
  await env.DB.prepare('DELETE FROM room WHERE room_id=?').bind(roomId).run();

  if(env.ROOMS){
    const hub=env.ROOMS.get(env.ROOMS.idFromName(roomId));
    const task=hub.fetch('https://room/deleted',{method:'POST'}).catch(()=>{});
    if(executionContext?.waitUntil)executionContext.waitUntil(task);else await task;
  }
  return json({ok:true});
}
