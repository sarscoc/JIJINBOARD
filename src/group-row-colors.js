const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const color=value=>/^#[0-9a-f]{6}$/i.test(String(value||""))?String(value):null;
function normalize(input){
  const out={};
  if(!input||typeof input!=="object"||Array.isArray(input))return out;
  for(const [key,value] of Object.entries(input).slice(0,100)){
    const id=String(key||"").slice(0,160);
    const c=color(value);
    if(id&&c)out[id]=c;
  }
  return out;
}
async function ensureTable(db){
  await db.prepare(`CREATE TABLE IF NOT EXISTS board_group_row_colors (
    board_id TEXT PRIMARY KEY,
    colors_json TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
}
export async function handleGroupRowColors(request,env,boardId){
  await ensureTable(env.DB);
  const board=await env.DB.prepare("SELECT admin_token FROM boards WHERE id=?").bind(boardId).first();
  if(!board)return json({error:"自陣が見つかりません"},404);
  if(request.method==="GET"){
    const row=await env.DB.prepare("SELECT colors_json,updated_at FROM board_group_row_colors WHERE board_id=?").bind(boardId).first();
    let colors={};try{colors=row?normalize(JSON.parse(row.colors_json||"{}")):{} }catch{}
    return json({colors,updatedAt:row?.updated_at||""});
  }
  const token=request.headers.get("x-board-admin-token")||"";
  if(!token||token!==board.admin_token)return json({error:"デザインを変更できるのは部屋主だけです"},403);
  if(request.method==="DELETE"){
    await env.DB.prepare("DELETE FROM board_group_row_colors WHERE board_id=?").bind(boardId).run();
    return json({ok:true,colors:{}});
  }
  if(request.method!=="POST")return json({error:"Method not allowed"},405);
  let body=null;try{body=await request.json()}catch{}
  const colors=normalize(body?.colors);
  const packed=JSON.stringify(colors);
  await env.DB.prepare(`INSERT INTO board_group_row_colors(board_id,colors_json,updated_at)
    VALUES(?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(board_id) DO UPDATE SET colors_json=excluded.colors_json,updated_at=CURRENT_TIMESTAMP`)
    .bind(boardId,packed).run();
  return json({ok:true,colors});
}
