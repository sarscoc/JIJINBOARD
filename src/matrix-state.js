import { ensurePlIdentity,parentRoomForLog } from './data-model.js';

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const safeBody=async request=>{try{return await request.json()}catch{return null}};
const cleanObject=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};

function roomState(value){
  const source=cleanObject(value),state={...source};
  // Per-template placement belongs to MATRIX_TEMPLATE / MATRIX_POINT.
  state.items={};
  return state;
}

export async function handleMatrixState(request,env,roomId,logId){
  const log=await parentRoomForLog(env.DB,logId);
  if(!log||log.room_id!==roomId)return json({error:'この自陣にないログです'},404);

  if(request.method==='GET'){
    const row=await env.DB.prepare('SELECT matrix_settings,updated_at FROM matrix_settings WHERE room_id=?').bind(roomId).first();
    let state={};try{state=row?JSON.parse(row.matrix_settings||'{}'): {}}catch{}
    return json({state:roomState(state),updatedAt:row?.updated_at||'',comments:[]});
  }

  if(request.method==='POST'){
    const body=await safeBody(request),authorId=String(body?.authorId||'').slice(0,120),authorName=String(body?.authorName||'').trim().slice(0,80);
    if(!authorId||!authorName)return json({error:'先に発言者を登録してください'},400);
    await ensurePlIdentity(env.DB,authorId,authorName);
    if(body?.state!==undefined){
      const state=roomState(body.state),serialized=JSON.stringify(state);
      if(serialized.length>500_000)return json({error:'MATRIXの表示設定が大きすぎます'},413);
      await env.DB.prepare(`INSERT INTO matrix_settings(room_id,matrix_settings,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(room_id) DO UPDATE SET matrix_settings=excluded.matrix_settings,updated_at=CURRENT_TIMESTAMP`).bind(roomId,serialized).run();
    }
    return json({ok:true});
  }

  return json({error:'Method not allowed'},405);
}
