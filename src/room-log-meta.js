import { verifyRoomAdmin } from './data-model.js';

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const safeBody=async request=>{try{return await request.json()}catch{return null}};

async function roomRow(db,roomId){return db.prepare('SELECT room_id,room_name,created_at FROM room WHERE room_id=?').bind(roomId).first()}
async function logRow(db,roomId,logId){return db.prepare('SELECT log_id,room_id,log_name,scenario_title,scenario_participants,spoiler_enabled,log_sort_order,created_at FROM log WHERE room_id=? AND log_id=?').bind(roomId,logId).first()}

export async function handleRoomLogMeta(request,env,roomId,logId=''){
  const room=await roomRow(env.DB,roomId);if(!room)return json({error:'自陣の部屋が見つかりません'},404);

  if(request.method==='GET'&&!logId){
    const result=await env.DB.prepare('SELECT log_id,log_name,scenario_title,scenario_participants,spoiler_enabled,log_sort_order,created_at FROM log WHERE room_id=? ORDER BY log_sort_order,created_at').bind(roomId).all();
    return json({id:room.room_id,name:room.room_name,createdAt:room.created_at,logs:(result.results||[]).map((item,index)=>({
      roomId:item.log_id,
      title:item.log_name||'LOG',
      order:Number(item.log_sort_order)||index,
      spoiler:!!item.spoiler_enabled,
      scenarioTitle:item.scenario_title||'',
      scenarioParticipants:item.scenario_participants||'',
      createdAt:item.created_at,
      participants:[]
    }))});
  }

  if(request.method==='POST'&&!logId){
    if(!await verifyRoomAdmin(env.DB,roomId,request.headers.get('x-board-admin-token')||''))return json({error:'この自陣を編集できるのは部屋主だけです'},403);
    const body=await safeBody(request),id=String(body?.roomId||'');if(!id)return json({error:'追加するログが見つかりません'},404);
    const log=await logRow(env.DB,roomId,id);if(!log)return json({error:'追加するログが見つかりません'},404);
    await env.DB.prepare('UPDATE log SET spoiler_enabled=?,scenario_title=?,scenario_participants=?,updated_at=CURRENT_TIMESTAMP WHERE room_id=? AND log_id=?').bind(body?.spoiler?1:0,String(body?.scenarioTitle||'').trim().slice(0,120),String(body?.scenarioParticipants||'').trim().slice(0,300),roomId,id).run();
    return json({ok:true,roomId:id},201);
  }

  if(request.method==='PATCH'&&logId){
    if(!await verifyRoomAdmin(env.DB,roomId,request.headers.get('x-board-admin-token')||''))return json({error:'この自陣を編集できるのは部屋主だけです'},403);
    const body=await safeBody(request),result=await env.DB.prepare('UPDATE log SET spoiler_enabled=?,scenario_title=?,scenario_participants=?,updated_at=CURRENT_TIMESTAMP WHERE room_id=? AND log_id=?').bind(body?.spoiler?1:0,String(body?.scenarioTitle||'').trim().slice(0,120),String(body?.scenarioParticipants||'').trim().slice(0,300),roomId,logId).run();
    return result.meta?.changes?json({ok:true}):json({error:'ログが見つかりません'},404);
  }

  return null;
}
