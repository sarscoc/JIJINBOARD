const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});

const ensureTable=async db=>{
  await db.prepare(`CREATE TABLE IF NOT EXISTS board_log_tab_settings (
    board_id TEXT NOT NULL,
    room_id TEXT NOT NULL,
    tab_order_json TEXT NOT NULL DEFAULT '[]',
    hidden_tabs_json TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(board_id,room_id)
  )`).run();
};

const parseArray=value=>{try{const parsed=JSON.parse(value||"[]");return Array.isArray(parsed)?parsed.map(String):[]}catch{return[]}};
const unique=list=>[...new Set((list||[]).map(value=>String(value||"").trim()).filter(Boolean))];
const normalize=(sourceTabs,order,hidden)=>{
  const source=unique(sourceTabs),allowed=new Set(source);
  const normalizedOrder=unique(order).filter(tab=>allowed.has(tab));
  source.forEach(tab=>{if(!normalizedOrder.includes(tab))normalizedOrder.push(tab)});
  const normalizedHidden=unique(hidden).filter(tab=>allowed.has(tab));
  if(source.length&&normalizedHidden.length>=source.length)normalizedHidden.pop();
  return {sourceTabs:source,order:normalizedOrder,hidden:normalizedHidden};
};

async function broadcastChange(env,roomId){
  try{
    const id=env.ROOMS.idFromName(roomId),hub=env.ROOMS.get(id);
    await hub.fetch("https://room/notify",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"tab-settings"})});
  }catch{}
}

export async function handleLogTabSettings(request,env,boardId,roomId){
  await ensureTable(env.DB);
  const linked=await env.DB.prepare(`SELECT b.admin_token,r.log_json
    FROM board_logs bl
    JOIN boards b ON b.id=bl.board_id
    JOIN rooms r ON r.id=bl.room_id
    WHERE bl.board_id=? AND bl.room_id=?`).bind(boardId,roomId).first();
  if(!linked)return json({error:"この自陣にないログです"},404);
  let sourceTabs=[];try{sourceTabs=unique(JSON.parse(linked.log_json||"{}").tabs||[])}catch{}
  const row=await env.DB.prepare("SELECT tab_order_json,hidden_tabs_json,updated_at FROM board_log_tab_settings WHERE board_id=? AND room_id=?").bind(boardId,roomId).first();
  const current=normalize(sourceTabs,parseArray(row?.tab_order_json),parseArray(row?.hidden_tabs_json));
  if(request.method==="GET")return json({...current,updatedAt:row?.updated_at||""});
  if(request.method!=="PATCH")return json({error:"Method not allowed"},405);
  const token=request.headers.get("x-board-admin-token")||"";
  if(!token||token!==linked.admin_token)return json({error:"この自陣を編集できるのは部屋主だけです"},403);
  let body=null;try{body=await request.json()}catch{}
  const next=normalize(sourceTabs,Array.isArray(body?.order)?body.order:current.order,Array.isArray(body?.hidden)?body.hidden:current.hidden);
  if(next.sourceTabs.length&&!next.sourceTabs.some(tab=>!next.hidden.includes(tab)))return json({error:"少なくとも1つのタブを表示してください"},400);
  await env.DB.prepare(`INSERT INTO board_log_tab_settings(board_id,room_id,tab_order_json,hidden_tabs_json,updated_at)
    VALUES(?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(board_id,room_id) DO UPDATE SET tab_order_json=excluded.tab_order_json,hidden_tabs_json=excluded.hidden_tabs_json,updated_at=CURRENT_TIMESTAMP`)
    .bind(boardId,roomId,JSON.stringify(next.order),JSON.stringify(next.hidden)).run();
  await broadcastChange(env,roomId);
  return json({...next,ok:true});
}
