const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const safeBody=async request=>{try{return await request.json()}catch{return null}};
const randomToken=(bytes=16)=>{const data=crypto.getRandomValues(new Uint8Array(bytes));return btoa(String.fromCharCode(...data)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")};

let schemaReady=null;
async function ensureSchema(db){
  if(schemaReady)return schemaReady;
  schemaReady=(async()=>{
    await db.batch([
      db.prepare("CREATE TABLE IF NOT EXISTS board_sheet_comments (id TEXT PRIMARY KEY,board_id TEXT NOT NULL,cell_id TEXT NOT NULL,parent_id TEXT NOT NULL DEFAULT '',author_id TEXT NOT NULL,persona_name TEXT NOT NULL,persona_type TEXT NOT NULL,persona_icon TEXT NOT NULL DEFAULT '',body TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_sheet_comments_board ON board_sheet_comments(board_id,created_at)"),
      db.prepare("CREATE TABLE IF NOT EXISTS board_sheet_comment_likes (comment_id TEXT NOT NULL,author_id TEXT NOT NULL,PRIMARY KEY(comment_id,author_id))")
    ]);
    const info=await db.prepare("PRAGMA table_info(board_sheet_comments)").all();
    if(!(info.results||[]).some(col=>col.name==="persona_icon")){
      try{await db.prepare("ALTER TABLE board_sheet_comments ADD COLUMN persona_icon TEXT NOT NULL DEFAULT ''").run()}
      catch(error){if(!String(error).includes("duplicate column"))throw error}
    }
  })();
  try{await schemaReady}catch(error){schemaReady=null;throw error}
}

async function descendantIds(db,boardId,rootId){
  const rows=await db.prepare("SELECT id,parent_id FROM board_sheet_comments WHERE board_id=?").bind(boardId).all();
  const children=new Map();
  for(const row of rows.results||[]){const list=children.get(row.parent_id)||[];list.push(row.id);children.set(row.parent_id,list)}
  const result=[],stack=[rootId];
  while(stack.length){const id=stack.pop();if(result.includes(id))continue;result.push(id);for(const child of children.get(id)||[])stack.push(child)}
  return result;
}

export async function handleSpreadsheetComments(request,env,boardId,commentId="",action=""){
  await ensureSchema(env.DB);
  const board=await env.DB.prepare("SELECT id FROM boards WHERE id=?").bind(boardId).first();
  if(!board)return json({error:"自陣が見つかりません"},404);
  const method=request.method;

  if(method==="GET"&&!commentId){
    const viewer=new URL(request.url).searchParams.get("authorId")||"";
    const result=await env.DB.prepare(`SELECT c.id,c.cell_id,c.parent_id,c.author_id,c.persona_name,c.persona_type,c.persona_icon,c.body,c.created_at,
      (SELECT COUNT(*) FROM board_sheet_comment_likes l WHERE l.comment_id=c.id) like_count,
      EXISTS(SELECT 1 FROM board_sheet_comment_likes l WHERE l.comment_id=c.id AND l.author_id=?) liked_by_me
      FROM board_sheet_comments c WHERE c.board_id=? ORDER BY c.created_at,c.id`).bind(viewer,boardId).all();
    return json({comments:result.results||[]});
  }

  if(method==="POST"&&!commentId){
    const body=await safeBody(request),authorId=String(body?.authorId||"").slice(0,100),cellId=String(body?.cellId||"").slice(0,240),text=String(body?.body||"").trim().slice(0,4000),name=String(body?.personaName||"").slice(0,80),type=String(body?.personaType||"PL").slice(0,20),icon=String(body?.personaIcon||"").slice(0,220000),parentId=String(body?.parentId||"").slice(0,100);
    if(!authorId||!cellId||!text||!name)return json({error:"コメント情報が足りません"},400);
    if(parentId){const parent=await env.DB.prepare("SELECT cell_id FROM board_sheet_comments WHERE id=? AND board_id=?").bind(parentId,boardId).first();if(!parent)return json({error:"返信先が見つかりません"},404);}
    const id=randomToken();
    await env.DB.prepare("INSERT INTO board_sheet_comments(id,board_id,cell_id,parent_id,author_id,persona_name,persona_type,persona_icon,body) VALUES(?,?,?,?,?,?,?,?,?)").bind(id,boardId,cellId,parentId,authorId,name,type,icon,text).run();
    return json({id},201);
  }

  if(method==="POST"&&commentId&&action==="like"){
    const body=await safeBody(request),authorId=String(body?.authorId||"").slice(0,100);
    if(!authorId)return json({error:"発言者情報がありません"},400);
    const exists=await env.DB.prepare("SELECT 1 FROM board_sheet_comments WHERE id=? AND board_id=?").bind(commentId,boardId).first();
    if(!exists)return json({error:"コメントが見つかりません"},404);
    const old=await env.DB.prepare("SELECT 1 FROM board_sheet_comment_likes WHERE comment_id=? AND author_id=?").bind(commentId,authorId).first();
    if(old)await env.DB.prepare("DELETE FROM board_sheet_comment_likes WHERE comment_id=? AND author_id=?").bind(commentId,authorId).run();
    else await env.DB.prepare("INSERT INTO board_sheet_comment_likes(comment_id,author_id) VALUES(?,?)").bind(commentId,authorId).run();
    return json({liked:!old});
  }

  if(method==="PATCH"&&commentId){
    const body=await safeBody(request),row=await env.DB.prepare("SELECT author_id FROM board_sheet_comments WHERE id=? AND board_id=?").bind(commentId,boardId).first(),text=String(body?.body||"").trim().slice(0,4000);
    if(!row||row.author_id!==String(body?.authorId||""))return json({error:"自分のコメントだけ編集できます"},403);
    if(!text)return json({error:"感想を入力してください"},400);
    await env.DB.prepare("UPDATE board_sheet_comments SET body=? WHERE id=?").bind(text,commentId).run();
    return json({ok:true});
  }

  if(method==="DELETE"&&commentId){
    const body=await safeBody(request),row=await env.DB.prepare("SELECT author_id FROM board_sheet_comments WHERE id=? AND board_id=?").bind(commentId,boardId).first();
    if(!row||row.author_id!==String(body?.authorId||""))return json({error:"自分のコメントだけ削除できます"},403);
    const ids=await descendantIds(env.DB,boardId,commentId);
    for(const id of ids){await env.DB.prepare("DELETE FROM board_sheet_comment_likes WHERE comment_id=?").bind(id).run()}
    for(const id of ids.reverse()){await env.DB.prepare("DELETE FROM board_sheet_comments WHERE id=? AND board_id=?").bind(id,boardId).run()}
    return json({ok:true});
  }

  return json({error:"Method not allowed"},405);
}
