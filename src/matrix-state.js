import { ensurePlIdentity,parentRoomForLog } from './data-model.js';

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const safeBody=async request=>{try{return await request.json()}catch{return null}};
const stateId=roomId=>`__matrix_state__:${roomId}`;
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
  const id=stateId(roomId);

  if(request.method==='GET'){
    const row=await env.DB.prepare('SELECT template_definition,updated_at FROM matrix_template WHERE room_id=? AND template_id=?').bind(roomId,id).first();
    let state={};try{state=row?JSON.parse(row.template_definition||'{}'): {}}catch{}
    return json({state:roomState(state),updatedAt:row?.updated_at||'',comments:[]});
  }

  if(request.method==='POST'){
    const body=await safeBody(request),authorId=String(body?.authorId||'').slice(0,120),authorName=String(body?.authorName||'').trim().slice(0,80);
    if(!authorId||!authorName)return json({error:'先に発言者を登録してください'},400);
    await ensurePlIdentity(env.DB,authorId,authorName);
    if(body?.state!==undefined){
      const state=roomState(body.state),serialized=JSON.stringify(state);
      if(serialized.length>500_000)return json({error:'MATRIXの表示設定が大きすぎます'},413);
      await env.DB.prepare(`INSERT INTO matrix_template(room_id,template_id,template_name,template_image_key,template_definition,updated_at) VALUES(?,?,?,'',?,CURRENT_TIMESTAMP) ON CONFLICT(room_id,template_id) DO UPDATE SET template_definition=excluded.template_definition,updated_at=CURRENT_TIMESTAMP`).bind(roomId,id,'__STATE__',serialized).run();
    }
    return json({ok:true});
  }

  return json({error:'Method not allowed'},405);
}
