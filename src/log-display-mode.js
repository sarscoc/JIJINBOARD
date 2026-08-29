const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});

const normalize=value=>value==="dark"?"dark":"light";

async function ensureTable(db){
  await db.prepare(`CREATE TABLE IF NOT EXISTS board_log_display_modes (
    board_id TEXT NOT NULL,
    room_id TEXT NOT NULL,
    display_mode TEXT NOT NULL DEFAULT 'light',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(board_id,room_id),
    FOREIGN KEY(board_id) REFERENCES boards(id) ON DELETE CASCADE
  )`).run();
}

export async function handleLogDisplayMode(request,env,boardId,roomId){
  await ensureTable(env.DB);
  const board=await env.DB.prepare("SELECT admin_token FROM boards WHERE id=?").bind(boardId).first();
  if(!board)return json({error:"自陣が見つかりません"},404);

  if(request.method==="GET"){
    const row=await env.DB.prepare("SELECT display_mode,updated_at FROM board_log_display_modes WHERE board_id=? AND room_id=?").bind(boardId,roomId).first();
    return json({displayMode:normalize(row?.display_mode),updatedAt:row?.updated_at||""});
  }

  const token=request.headers.get("x-board-admin-token")||"";
  if(!token||token!==board.admin_token)return json({error:"ログの表示設定を変更できるのは部屋主だけです"},403);
  if(request.method!=="POST"&&request.method!=="PATCH")return json({error:"Method not allowed"},405);

  let body=null;try{body=await request.json()}catch{}
  const displayMode=normalize(body?.displayMode);
  await env.DB.prepare(`INSERT INTO board_log_display_modes(board_id,room_id,display_mode,updated_at)
    VALUES(?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(board_id,room_id) DO UPDATE SET display_mode=excluded.display_mode,updated_at=CURRENT_TIMESTAMP`)
    .bind(boardId,roomId,displayMode).run();
  return json({ok:true,displayMode});
}
