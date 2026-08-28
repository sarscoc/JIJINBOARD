const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

const randomToken = (bytes = 18) => {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...data)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const safeBody = async request => {
  try { return await request.json(); } catch { return null; }
};

const ensurePresenceTable = async db => {
  await db.prepare(`CREATE TABLE IF NOT EXISTS presence (room_id TEXT NOT NULL,author_id TEXT NOT NULL,pl_name TEXT NOT NULL,pl_icon TEXT NOT NULL DEFAULT '',is_typing INTEGER NOT NULL DEFAULT 0,typing_name TEXT NOT NULL DEFAULT '',typing_icon TEXT NOT NULL DEFAULT '',typing_message_id TEXT NOT NULL DEFAULT '',last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY (room_id,author_id))`).run();
  const info=await db.prepare("PRAGMA table_info(presence)").all();
  const names=new Set((info.results||[]).map(column=>column.name));for(const [name,type] of [["is_typing","INTEGER NOT NULL DEFAULT 0"],["typing_name","TEXT NOT NULL DEFAULT ''"],["typing_icon","TEXT NOT NULL DEFAULT ''"],["typing_message_id","TEXT NOT NULL DEFAULT ''"]])if(!names.has(name)){try{await db.prepare(`ALTER TABLE presence ADD COLUMN ${name} ${type}`).run()}catch(error){if(!String(error).includes("duplicate column"))throw error}}
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_presence_room_seen ON presence(room_id,last_seen)").run();
};
const ensureAnnotationColumns = async db => {
  const info=await db.prepare("PRAGMA table_info(annotations)").all(),names=new Set((info.results||[]).map(column=>column.name));
  if(!names.has("persona_icon")){try{await db.prepare("ALTER TABLE annotations ADD COLUMN persona_icon TEXT NOT NULL DEFAULT ''").run()}catch(error){if(!String(error).includes("duplicate column"))throw error}}
  if(!names.has("end_message_id")){try{await db.prepare("ALTER TABLE annotations ADD COLUMN end_message_id TEXT NOT NULL DEFAULT ''").run()}catch(error){if(!String(error).includes("duplicate column"))throw error}}
  if(!names.has("parent_id")){try{await db.prepare("ALTER TABLE annotations ADD COLUMN parent_id TEXT NOT NULL DEFAULT ''").run()}catch(error){if(!String(error).includes("duplicate column"))throw error}}
  if(!names.has("image_data")){try{await db.prepare("ALTER TABLE annotations ADD COLUMN image_data TEXT NOT NULL DEFAULT ''").run()}catch(error){if(!String(error).includes("duplicate column"))throw error}}
};
const ensureAnnotationLikes = async db => {
  await db.prepare("CREATE TABLE IF NOT EXISTS annotation_likes (annotation_id TEXT NOT NULL,author_id TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(annotation_id,author_id))").run();
};
const ensureLogChunksTable = async db => {
  await db.prepare(`CREATE TABLE IF NOT EXISTS room_log_chunks (room_id TEXT NOT NULL,chunk_index INTEGER NOT NULL,messages_json TEXT NOT NULL,PRIMARY KEY (room_id,chunk_index),FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE)`).run();
};
const ensureRoomOwnerColumn = async db => {
  const info=await db.prepare("PRAGMA table_info(rooms)").all(),names=new Set((info.results||[]).map(column=>column.name));
  if(!names.has("owner_id")){try{await db.prepare("ALTER TABLE rooms ADD COLUMN owner_id TEXT NOT NULL DEFAULT ''").run()}catch(error){if(!String(error).includes("duplicate column"))throw error}}
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_rooms_owner ON rooms(owner_id)").run();
};
const ensureRoomRevisionColumn = async db => {
  const info=await db.prepare("PRAGMA table_info(rooms)").all(),names=new Set((info.results||[]).map(column=>column.name));
  if(!names.has("annotation_version")){try{await db.prepare("ALTER TABLE rooms ADD COLUMN annotation_version INTEGER NOT NULL DEFAULT 0").run()}catch(error){if(!String(error).includes("duplicate column"))throw error}}
};
const ensureProfileTransfers = async db => {await db.prepare("CREATE TABLE IF NOT EXISTS profile_transfers (code TEXT PRIMARY KEY,profile_json TEXT NOT NULL,expires_at TEXT NOT NULL,used_at TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run()};
const ensureBoardsSchema = async db => {
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS boards (id TEXT PRIMARY KEY,name TEXT NOT NULL,admin_token TEXT NOT NULL,owner_id TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS board_logs (board_id TEXT NOT NULL,room_id TEXT NOT NULL,sort_order INTEGER NOT NULL DEFAULT 0,spoiler INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(board_id,room_id),FOREIGN KEY(board_id) REFERENCES boards(id) ON DELETE CASCADE,FOREIGN KEY(room_id) REFERENCES rooms(id) ON DELETE CASCADE)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_board_logs_order ON board_logs(board_id,sort_order,created_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS board_log_participants (board_id TEXT NOT NULL,room_id TEXT NOT NULL,author_id TEXT NOT NULL,persona_id TEXT NOT NULL,pl_name TEXT NOT NULL DEFAULT '',persona_name TEXT NOT NULL,persona_icon TEXT NOT NULL DEFAULT '',matrix_icon TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(board_id,room_id,author_id,persona_id),FOREIGN KEY(board_id,room_id) REFERENCES board_logs(board_id,room_id) ON DELETE CASCADE)"),
    db.prepare("CREATE TABLE IF NOT EXISTS board_matrix_states (board_id TEXT NOT NULL,room_id TEXT NOT NULL,state_json TEXT NOT NULL DEFAULT '{}',updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(board_id,room_id),FOREIGN KEY(board_id,room_id) REFERENCES board_logs(board_id,room_id) ON DELETE CASCADE)"),
    db.prepare("CREATE TABLE IF NOT EXISTS board_matrix_comments (id TEXT PRIMARY KEY,board_id TEXT NOT NULL,room_id TEXT NOT NULL,author_id TEXT NOT NULL,author_name TEXT NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(board_id,room_id) REFERENCES board_logs(board_id,room_id) ON DELETE CASCADE)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_matrix_comments_room ON board_matrix_comments(board_id,room_id,created_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS board_matrix_icon_comments (id TEXT PRIMARY KEY,board_id TEXT NOT NULL,room_id TEXT NOT NULL,target_id TEXT NOT NULL,parent_id TEXT NOT NULL DEFAULT '',author_id TEXT NOT NULL,author_name TEXT NOT NULL,persona_name TEXT NOT NULL,persona_type TEXT NOT NULL,persona_icon TEXT NOT NULL DEFAULT '',body TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(board_id,room_id) REFERENCES board_logs(board_id,room_id) ON DELETE CASCADE)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_matrix_icon_comments_room ON board_matrix_icon_comments(board_id,room_id,created_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS board_matrix_icon_comment_likes (comment_id TEXT NOT NULL,author_id TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(comment_id,author_id))")
    ,db.prepare("CREATE TABLE IF NOT EXISTS board_sheet_comments (id TEXT PRIMARY KEY,board_id TEXT NOT NULL,cell_id TEXT NOT NULL,parent_id TEXT NOT NULL DEFAULT '',author_id TEXT NOT NULL,persona_name TEXT NOT NULL,persona_type TEXT NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(board_id) REFERENCES boards(id) ON DELETE CASCADE)"),db.prepare("CREATE INDEX IF NOT EXISTS idx_sheet_comments_board ON board_sheet_comments(board_id,created_at)"),db.prepare("CREATE TABLE IF NOT EXISTS board_sheet_comment_likes (comment_id TEXT NOT NULL,author_id TEXT NOT NULL,PRIMARY KEY(comment_id,author_id))")
    ,db.prepare("CREATE TABLE IF NOT EXISTS board_spreadsheet_states (board_id TEXT PRIMARY KEY,state_json TEXT NOT NULL DEFAULT '{}',updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(board_id) REFERENCES boards(id) ON DELETE CASCADE)")
  ]);
  const cols=await db.prepare("PRAGMA table_info(board_logs)").all();
  if(!(cols.results||[]).some(col=>col.name==="spoiler")){try{await db.prepare("ALTER TABLE board_logs ADD COLUMN spoiler INTEGER NOT NULL DEFAULT 0").run()}catch(error){if(!String(error).includes("duplicate column"))throw error}}
  const participantCols=await db.prepare("PRAGMA table_info(board_log_participants)").all();
  if(!(participantCols.results||[]).some(col=>col.name==="matrix_icon")){try{await db.prepare("ALTER TABLE board_log_participants ADD COLUMN matrix_icon TEXT NOT NULL DEFAULT ''").run()}catch(error){if(!String(error).includes("duplicate column"))throw error}}
};
const annotationSchemaReady=new WeakMap();
const ensureAnnotationSchema = db => {
  let task=annotationSchemaReady.get(db);
  if(!task){task=(async()=>{await ensureAnnotationColumns(db);await ensureAnnotationLikes(db);await ensureRoomRevisionColumn(db)})();annotationSchemaReady.set(db,task);task.catch(()=>annotationSchemaReady.delete(db))}
  return task;
};
const bumpAnnotationVersion = async (db,roomId) => {await ensureAnnotationSchema(db);await db.prepare("UPDATE rooms SET annotation_version=annotation_version+1 WHERE id=?").bind(roomId).run()};
const splitMessages = (messages,maxChars=300000) => {
  const chunks=[];let current=[],size=2;
  for(const message of messages){const text=JSON.stringify(message),next=size+text.length+(current.length?1:0);if(current.length&&next>maxChars){chunks.push(current);current=[];size=2}current.push(message);size+=text.length+(current.length>1?1:0)}
  if(current.length)chunks.push(current);return chunks;
};
const roomLogKey = roomId => `rooms/${roomId}/log.json`;
const putRoomLog = async (bucket,roomId,tabs,messages) => {
  const key=roomLogKey(roomId),payload=JSON.stringify({tabs:tabs||[],messages:messages||[]});
  await bucket.put(key,payload,{httpMetadata:{contentType:"application/json; charset=utf-8"},customMetadata:{roomId,messageCount:String(messages?.length||0)}});
  return {key,size:new TextEncoder().encode(payload).byteLength};
};
const iconKey = hash => `icons/${hash}`;
const iconReference = hash => `r2:${iconKey(hash)}`;
const iconHashFromValue = value => {
  const match=String(value||"").match(/^r2:icons\/([a-f0-9]{64})$/i);
  if(match)return match[1].toLowerCase();
  const urlMatch=String(value||"").match(/\/icons\/([a-f0-9]{64})(?:$|[?#])/i);
  return urlMatch?urlMatch[1].toLowerCase():"";
};
const dataImage = value => {
  const match=String(value||"").match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([a-zA-Z0-9+/=]+)$/);
  if(!match)return null;
  const binary=atob(match[2]),bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return {contentType:match[1],bytes};
};
const bytesHash = async bytes => [...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))].map(value=>value.toString(16).padStart(2,"0")).join("");
const storePersonaIcon = async (bucket,value) => {
  if(!value)return "";
  const knownHash=iconHashFromValue(value);if(knownHash)return iconReference(knownHash);
  const image=dataImage(value);if(!image)return "";
  const hash=await bytesHash(image.bytes),key=iconKey(hash);
  if(!await bucket.head(key))await bucket.put(key,image.bytes,{httpMetadata:{contentType:image.contentType,cacheControl:"private, max-age=31536000, immutable"},customMetadata:{sha256:hash}});
  return iconReference(hash);
};
const publicPersonaIcon = (roomId,value) => {
  const hash=iconHashFromValue(value);
  return hash?`/api/rooms/${encodeURIComponent(roomId)}/icons/${hash}`:String(value||"");
};
const roomHub = (env,roomId) => {
  if(!env.ROOMS)return null;
  const id=env.ROOMS.idFromName(roomId);
  return env.ROOMS.get(id);
};
const notifyRoom = (context,env,roomId,action,request) => {
  const hub=roomHub(env,roomId);if(!hub)return;
  const excludeClientId=String(request?.headers.get("x-realtime-client")||"").slice(0,100);
  const task=hub.fetch("https://room/notify",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action,excludeClientId})}).catch(()=>{});
  context.waitUntil(task);
};
const notifyRoomDeleted = (context,env,roomId) => {
  const hub=roomHub(env,roomId);if(!hub)return;
  context.waitUntil(hub.fetch("https://room/deleted",{method:"POST"}).catch(()=>{}));
};

export async function onRequest(context) {
  const { request, env, params } = context;
  if (!env.DB) return json({ error: "D1データベースが接続されていません" }, 500);
  const parts = Array.isArray(params.path) ? params.path : String(params.path || "").split("/").filter(Boolean);
  const method = request.method;

  if(parts[0]==="profile-transfers"){
    await ensureProfileTransfers(env.DB);
    if(method==="POST"&&parts.length===1){const body=await safeBody(request),profile=body?.profile;if(!profile?.id||!profile?.plName)return json({error:"PL情報が足りません"},400);const code=randomToken(9).toUpperCase(),expires=new Date(Date.now()+30*60*1000).toISOString();await env.DB.prepare("INSERT INTO profile_transfers(code,profile_json,expires_at) VALUES(?,?,?)").bind(code,JSON.stringify(profile),expires).run();return json({code,expiresAt:expires})}
    if(method==="POST"&&parts[1]){const code=String(parts[1]).toUpperCase(),row=await env.DB.prepare("SELECT profile_json,expires_at,used_at FROM profile_transfers WHERE code=?").bind(code).first();if(!row||row.used_at)return json({error:"コードが無効、または使用済みです"},404);if(Date.parse(row.expires_at)<=Date.now())return json({error:"コードの有効期限（30分）が切れています"},410);await env.DB.prepare("UPDATE profile_transfers SET used_at=CURRENT_TIMESTAMP WHERE code=? AND used_at='' ").bind(code).run();return json({profile:JSON.parse(row.profile_json)})}
  }

  if (parts[0] === "boards") {
    await ensureBoardsSchema(env.DB);
    if (method === "POST" && parts.length === 1) {
      const body=await safeBody(request),name=String(body?.name||"").trim().slice(0,120),ownerId=String(body?.ownerId||"").slice(0,100);
      if(!name)return json({error:"自陣の名前を入力してください"},400);
      if(!ownerId)return json({error:"作成者情報がありません"},400);
      const id=randomToken(20),adminToken=randomToken(24);
      await env.DB.prepare("INSERT INTO boards(id,name,admin_token,owner_id) VALUES(?,?,?,?)").bind(id,name,adminToken,ownerId).run();
      return json({id,adminToken,name},201);
    }
    if (parts[1]) {
      const board=await env.DB.prepare("SELECT id,name,created_at FROM boards WHERE id=?").bind(parts[1]).first();
      if(!board)return json({error:"自陣の部屋が見つかりません"},404);
      if(method==="GET"&&parts.length===2){
        const [result,participantResult]=await Promise.all([env.DB.prepare("SELECT room_id,sort_order,spoiler,created_at FROM board_logs WHERE board_id=? ORDER BY sort_order,created_at").bind(parts[1]).all(),env.DB.prepare("SELECT room_id,author_id,persona_id,pl_name,persona_name,persona_icon,matrix_icon FROM board_log_participants WHERE board_id=? ORDER BY updated_at,persona_name").bind(parts[1]).all()]);
        const participants=new Map();for(const item of participantResult.results||[]){const list=participants.get(item.room_id)||[];list.push({authorId:item.author_id,personaId:item.persona_id,plName:item.pl_name,name:item.persona_name,icon:publicPersonaIcon(item.room_id,item.matrix_icon||item.persona_icon),baseIcon:publicPersonaIcon(item.room_id,item.persona_icon),matrixIcon:publicPersonaIcon(item.room_id,item.matrix_icon)});participants.set(item.room_id,list)}
        return json({id:board.id,name:board.name,createdAt:board.created_at,logs:(result.results||[]).map((item,index)=>({roomId:item.room_id,order:Number(item.sort_order)||index,spoiler:!!item.spoiler,createdAt:item.created_at,participants:participants.get(item.room_id)||[]}))});
      }
      if(parts[2]==="spreadsheet"&&parts[3]==="comments"){
        const viewer=new URL(request.url).searchParams.get("authorId")||"",id=parts[4]||"",action=parts[5]||"";
        if(method==="GET"&&!id){const r=await env.DB.prepare("SELECT c.id,c.cell_id,c.parent_id,c.author_id,c.persona_name,c.persona_type,c.body,c.created_at,(SELECT COUNT(*) FROM board_sheet_comment_likes l WHERE l.comment_id=c.id) like_count,EXISTS(SELECT 1 FROM board_sheet_comment_likes l WHERE l.comment_id=c.id AND l.author_id=?) liked_by_me FROM board_sheet_comments c WHERE c.board_id=? ORDER BY c.created_at,c.id").bind(viewer,parts[1]).all();return json({comments:r.results||[]})}
        if(method==="POST"&&!id){const b=await safeBody(request),authorId=String(b?.authorId||"").slice(0,100),cellId=String(b?.cellId||"").slice(0,240),body=String(b?.body||"").trim().slice(0,4000),name=String(b?.personaName||"").slice(0,80),type=String(b?.personaType||"PL").slice(0,20),parent=String(b?.parentId||"").slice(0,100);if(!authorId||!cellId||!body||!name)return json({error:"コメント情報が足りません"},400);const commentId=randomToken(16);await env.DB.prepare("INSERT INTO board_sheet_comments(id,board_id,cell_id,parent_id,author_id,persona_name,persona_type,body) VALUES(?,?,?,?,?,?,?,?)").bind(commentId,parts[1],cellId,parent,authorId,name,type,body).run();return json({id:commentId},201)}
        if(method==="POST"&&id&&action==="like"){const b=await safeBody(request),authorId=String(b?.authorId||"").slice(0,100),old=await env.DB.prepare("SELECT 1 FROM board_sheet_comment_likes WHERE comment_id=? AND author_id=?").bind(id,authorId).first();if(old)await env.DB.prepare("DELETE FROM board_sheet_comment_likes WHERE comment_id=? AND author_id=?").bind(id,authorId).run();else await env.DB.prepare("INSERT INTO board_sheet_comment_likes(comment_id,author_id) VALUES(?,?)").bind(id,authorId).run();return json({liked:!old})}
        if(method==="PATCH"&&id){const b=await safeBody(request),row=await env.DB.prepare("SELECT author_id FROM board_sheet_comments WHERE id=? AND board_id=?").bind(id,parts[1]).first(),body=String(b?.body||"").trim().slice(0,4000);if(!row||row.author_id!==String(b?.authorId||""))return json({error:"自分のコメントだけ編集できます"},403);if(!body)return json({error:"感想を入力してください"},400);await env.DB.prepare("UPDATE board_sheet_comments SET body=? WHERE id=?").bind(body,id).run();return json({ok:true})}
        if(method==="DELETE"&&id){const b=await safeBody(request),row=await env.DB.prepare("SELECT author_id FROM board_sheet_comments WHERE id=? AND board_id=?").bind(id,parts[1]).first();if(!row||row.author_id!==String(b?.authorId||""))return json({error:"自分のコメントだけ削除できます"},403);await env.DB.prepare("DELETE FROM board_sheet_comment_likes WHERE comment_id=?").bind(id).run();await env.DB.prepare("DELETE FROM board_sheet_comments WHERE id=?").bind(id).run();return json({ok:true})}
      }
      if(parts[2]==="spreadsheet"&&parts[3]==="state"&&parts.length===4){
        if(method==="GET"){const row=await env.DB.prepare("SELECT state_json,updated_at FROM board_spreadsheet_states WHERE board_id=?").bind(parts[1]).first();return json({state:row?JSON.parse(row.state_json||"{}"):null,updatedAt:row?.updated_at||""})}
        if(method==="POST"){const body=await safeBody(request),sheetState=body?.state;if(!sheetState||JSON.stringify(sheetState).length>1_500_000)return json({error:"Spreadsheetの保存データが大きすぎます"},413);await env.DB.prepare("INSERT INTO board_spreadsheet_states(board_id,state_json,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(board_id) DO UPDATE SET state_json=excluded.state_json,updated_at=CURRENT_TIMESTAMP").bind(parts[1],JSON.stringify(sheetState)).run();return json({ok:true})}
      }
      if(parts[2]==="matrix"&&parts[3]&&parts[4]==="comments"){
        const roomId=parts[3],linked=await env.DB.prepare("SELECT 1 FROM board_logs WHERE board_id=? AND room_id=?").bind(parts[1],roomId).first();if(!linked)return json({error:"この自陣にないログです"},404);
        const viewer=new URL(request.url).searchParams.get("authorId")||"",commentId=parts[5]||"",action=parts[6]||"";
        if(method==="GET"&&!commentId){const result=await env.DB.prepare("SELECT c.id,c.target_id,c.parent_id,c.author_id,c.author_name,c.persona_name,c.persona_type,c.persona_icon,c.body,c.created_at,c.updated_at,(SELECT COUNT(*) FROM board_matrix_icon_comment_likes l WHERE l.comment_id=c.id) AS like_count,EXISTS(SELECT 1 FROM board_matrix_icon_comment_likes l WHERE l.comment_id=c.id AND l.author_id=?) AS liked_by_me FROM board_matrix_icon_comments c WHERE c.board_id=? AND c.room_id=? ORDER BY c.created_at,c.id").bind(viewer,parts[1],roomId).all();const rows=result.results||[];rows.forEach(row=>row.persona_icon=publicPersonaIcon(roomId,row.persona_icon));return json({comments:rows})}
        if(method==="POST"&&!commentId){const body=await safeBody(request),authorId=String(body?.authorId||"").slice(0,100),authorName=String(body?.authorName||"").trim().slice(0,80),personaName=String(body?.personaName||"").trim().slice(0,80),personaType=String(body?.personaType||"PL").slice(0,20),targetId=String(body?.targetId||"").slice(0,180),parentId=String(body?.parentId||"").slice(0,100),text=String(body?.body||"").trim().slice(0,4000);if(!authorId||!authorName||!personaName||!targetId||!text)return json({error:"コメント情報が足りません"},400);if(parentId){const parent=await env.DB.prepare("SELECT id FROM board_matrix_icon_comments WHERE id=? AND board_id=? AND room_id=?").bind(parentId,parts[1],roomId).first();if(!parent)return json({error:"返信先コメントが見つかりません"},404)}const icon=env.LOGS?await storePersonaIcon(env.LOGS,String(body?.personaIcon||"")):"",id=randomToken(16);await env.DB.prepare("INSERT INTO board_matrix_icon_comments(id,board_id,room_id,target_id,parent_id,author_id,author_name,persona_name,persona_type,persona_icon,body) VALUES(?,?,?,?,?,?,?,?,?,?,?)").bind(id,parts[1],roomId,targetId,parentId,authorId,authorName,personaName,personaType,icon,text).run();notifyRoom(context,env,roomId,"matrix-comment",request);return json({id},201)}
        if(method==="POST"&&commentId&&action==="like"){const body=await safeBody(request),authorId=String(body?.authorId||"").slice(0,100);if(!authorId)return json({error:"参加者情報が必要です"},400);const comment=await env.DB.prepare("SELECT id FROM board_matrix_icon_comments WHERE id=? AND board_id=? AND room_id=?").bind(commentId,parts[1],roomId).first();if(!comment)return json({error:"コメントが見つかりません"},404);const liked=await env.DB.prepare("SELECT 1 FROM board_matrix_icon_comment_likes WHERE comment_id=? AND author_id=?").bind(commentId,authorId).first();if(liked)await env.DB.prepare("DELETE FROM board_matrix_icon_comment_likes WHERE comment_id=? AND author_id=?").bind(commentId,authorId).run();else await env.DB.prepare("INSERT INTO board_matrix_icon_comment_likes(comment_id,author_id) VALUES(?,?)").bind(commentId,authorId).run();notifyRoom(context,env,roomId,"matrix-like",request);return json({liked:!liked})}
        if(method==="PATCH"&&commentId){const body=await safeBody(request),authorId=String(body?.authorId||"").slice(0,100),row=await env.DB.prepare("SELECT author_id FROM board_matrix_icon_comments WHERE id=? AND board_id=? AND room_id=?").bind(commentId,parts[1],roomId).first();if(!row)return json({error:"コメントが見つかりません"},404);if(row.author_id!==authorId)return json({error:"自分のコメントだけ編集できます"},403);const text=String(body?.body||"").trim().slice(0,4000);if(!text)return json({error:"感想を入力してください"},400);await env.DB.prepare("UPDATE board_matrix_icon_comments SET body=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(text,commentId).run();notifyRoom(context,env,roomId,"matrix-edit",request);return json({ok:true})}
        if(method==="DELETE"&&commentId){const body=await safeBody(request),authorId=String(body?.authorId||"").slice(0,100),row=await env.DB.prepare("SELECT author_id FROM board_matrix_icon_comments WHERE id=? AND board_id=? AND room_id=?").bind(commentId,parts[1],roomId).first();if(!row)return json({error:"コメントが見つかりません"},404);if(row.author_id!==authorId)return json({error:"自分のコメントだけ削除できます"},403);await env.DB.prepare("DELETE FROM board_matrix_icon_comment_likes WHERE comment_id IN (WITH RECURSIVE d(id) AS (SELECT id FROM board_matrix_icon_comments WHERE id=? UNION ALL SELECT c.id FROM board_matrix_icon_comments c JOIN d ON c.parent_id=d.id) SELECT id FROM d)").bind(commentId).run();await env.DB.prepare("WITH RECURSIVE d(id) AS (SELECT id FROM board_matrix_icon_comments WHERE id=? UNION ALL SELECT c.id FROM board_matrix_icon_comments c JOIN d ON c.parent_id=d.id) DELETE FROM board_matrix_icon_comments WHERE id IN (SELECT id FROM d)").bind(commentId).run();notifyRoom(context,env,roomId,"matrix-delete",request);return json({ok:true})}
      }
      if(parts[2]==="matrix"&&parts[3]&&parts.length===4){
        const roomId=parts[3],linked=await env.DB.prepare("SELECT 1 FROM board_logs WHERE board_id=? AND room_id=?").bind(parts[1],roomId).first();if(!linked)return json({error:"この自陣にないログです"},404);
        if(method==="GET"){const [stateRow,comments]=await Promise.all([env.DB.prepare("SELECT state_json,updated_at FROM board_matrix_states WHERE board_id=? AND room_id=?").bind(parts[1],roomId).first(),env.DB.prepare("SELECT id,author_id,author_name,body,created_at FROM board_matrix_comments WHERE board_id=? AND room_id=? ORDER BY created_at,id").bind(parts[1],roomId).all()]);return json({state:stateRow?JSON.parse(stateRow.state_json||"{}"):null,updatedAt:stateRow?.updated_at||"",comments:comments.results||[]})}
        if(method==="POST"){const body=await safeBody(request),authorId=String(body?.authorId||"").slice(0,100),authorName=String(body?.authorName||"").trim().slice(0,80),matrixState=body?.state;if(!authorId||!authorName)return json({error:"先に発言者を登録してください"},400);if(matrixState&&JSON.stringify(matrixState).length>1_500_000)return json({error:"MATRIXの保存データが大きすぎます"},413);if(matrixState!==undefined)await env.DB.prepare("INSERT INTO board_matrix_states(board_id,room_id,state_json,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(board_id,room_id) DO UPDATE SET state_json=excluded.state_json,updated_at=CURRENT_TIMESTAMP").bind(parts[1],roomId,JSON.stringify(matrixState||{})).run();const comment=String(body?.comment||"").trim().slice(0,2000);if(comment)await env.DB.prepare("INSERT INTO board_matrix_comments(id,board_id,room_id,author_id,author_name,body) VALUES(?,?,?,?,?,?)").bind(randomToken(16),parts[1],roomId,authorId,authorName,comment).run();return json({ok:true})}
      }
      if(method==="POST"&&parts[2]==="logs"&&parts[3]&&parts[4]==="participants"&&parts.length===5){
        const body=await safeBody(request),authorId=String(body?.authorId||"").slice(0,100),plName=String(body?.plName||"").slice(0,80),personas=Array.isArray(body?.personas)?body.personas.slice(0,12):[];
        if(!authorId||!plName)return json({error:"先に発言者を登録してください"},400);
        const linked=await env.DB.prepare("SELECT 1 FROM board_logs WHERE board_id=? AND room_id=?").bind(parts[1],parts[3]).first();if(!linked)return json({error:"この自陣にないログです"},404);
        const normalized=[];for(let index=0;index<personas.length;index++){const persona=personas[index];normalized.push({id:String(persona?.id||`persona-${index}`).slice(0,100),name:String(persona?.name||"").slice(0,80),icon:env.LOGS?await storePersonaIcon(env.LOGS,String(persona?.icon||"")):""})}
        const old=await env.DB.prepare("SELECT persona_id,matrix_icon FROM board_log_participants WHERE board_id=? AND room_id=? AND author_id=?").bind(parts[1],parts[3],authorId).all(),oldIcons=new Map((old.results||[]).map(row=>[row.persona_id,row.matrix_icon]));
        await env.DB.prepare("DELETE FROM board_log_participants WHERE board_id=? AND room_id=? AND author_id=?").bind(parts[1],parts[3],authorId).run();
        const inserts=normalized.map(persona=>env.DB.prepare("INSERT INTO board_log_participants(board_id,room_id,author_id,persona_id,pl_name,persona_name,persona_icon,matrix_icon) VALUES(?,?,?,?,?,?,?,?)").bind(parts[1],parts[3],authorId,persona.id,plName,persona.name,persona.icon,oldIcons.get(persona.id)||""));
        if(inserts.length)await env.DB.batch(inserts);return json({ok:true});
      }
      if(method==="POST"&&parts[2]==="logs"&&parts[3]&&parts[4]==="participants"&&parts[5]&&parts[6]==="matrix-icon"&&parts.length===7){
        const body=await safeBody(request),authorId=String(body?.authorId||"").slice(0,100),icon=env.LOGS?await storePersonaIcon(env.LOGS,String(body?.icon||"")):"";if(!authorId||!icon)return json({error:"画像を選択してください"},400);
        const changed=await env.DB.prepare("UPDATE board_log_participants SET matrix_icon=?,updated_at=CURRENT_TIMESTAMP WHERE board_id=? AND room_id=? AND author_id=? AND persona_id=?").bind(icon,parts[1],parts[3],authorId,parts[5]).run();if(!changed.meta?.changes)return json({error:"自分の参加PCだけ変更できます"},403);return json({ok:true});
      }
      const token=request.headers.get("x-board-admin-token")||"",admin=await env.DB.prepare("SELECT admin_token FROM boards WHERE id=?").bind(parts[1]).first();
      if(!admin||token!==admin.admin_token)return json({error:"この自陣を編集できるのは部屋主だけです"},403);
      if(method==="PATCH"&&parts.length===2){
        const body=await safeBody(request),name=String(body?.name||"").trim().slice(0,120);if(!name)return json({error:"自陣の名前を入力してください"},400);
        await env.DB.prepare("UPDATE boards SET name=? WHERE id=?").bind(name,parts[1]).run();return json({ok:true,name});
      }
      if(method==="POST"&&parts[2]==="logs"&&parts.length===3){
        const body=await safeBody(request),roomId=String(body?.roomId||""),roomAdminToken=String(body?.roomAdminToken||""),spoiler=body?.spoiler?1:0;
        const room=await env.DB.prepare("SELECT id,admin_token FROM rooms WHERE id=?").bind(roomId).first();
        if(!room)return json({error:"追加するログが見つかりません"},404);
        if(!roomAdminToken||roomAdminToken!==room.admin_token)return json({error:"自分が作成したログだけ追加できます"},403);
        const last=await env.DB.prepare("SELECT COALESCE(MAX(sort_order),-1) AS value FROM board_logs WHERE board_id=?").bind(parts[1]).first();
        await env.DB.prepare("INSERT OR IGNORE INTO board_logs(board_id,room_id,sort_order,spoiler) VALUES(?,?,?,?)").bind(parts[1],roomId,Number(last?.value)+1,spoiler).run();
        return json({ok:true,roomId},201);
      }
      if(method==="DELETE"&&parts[2]==="logs"&&parts[3]&&parts.length===4){
        await env.DB.prepare("DELETE FROM board_logs WHERE board_id=? AND room_id=?").bind(parts[1],parts[3]).run();return json({ok:true});
      }
    }
  }

  if (method === "POST" && parts[0] === "rooms" && parts.length === 1) {
    if(!env.LOGS)return json({error:"R2ログストレージが接続されていません（Binding名: LOGS）"},500);
    const body = await safeBody(request);
    if (!body || !Array.isArray(body.messages) || !body.messages.length) return json({ error: "ログが空です" }, 400);
    const ownerId=String(body.creatorId||"").slice(0,100);if(!ownerId)return json({error:"作成者情報がありません"},400);
    await ensureRoomOwnerColumn(env.DB);
    if (JSON.stringify(body.messages).length > 25_000_000) return json({ error: "ログが大きすぎます（25MBまで）" }, 413);
    const id = randomToken(20);
    const adminToken = randomToken(24);
    const logKey=roomLogKey(id);
    try{
      const stored=await putRoomLog(env.LOGS,id,body.tabs,body.messages);
      await env.DB.prepare("INSERT INTO rooms (id,title,log_json,admin_token,owner_id) VALUES (?,?,?,?,?)").bind(id,String(body.title||"TRPG LOG").slice(0,200),JSON.stringify({tabs:body.tabs||[],storage:"r2",key:stored.key,size:stored.size,messageCount:body.messages.length}),adminToken,ownerId).run();
      return json({id,adminToken},201);
    }catch(error){try{await env.LOGS.delete(logKey);await env.DB.prepare("DELETE FROM rooms WHERE id=?").bind(id).run()}catch{}return json({error:`ログの保存に失敗しました: ${String(error?.message||error).slice(0,180)}`},500)}
  }

  if (method === "GET" && parts[0] === "rooms" && parts[1] && parts.length === 2) {
    const room = await env.DB.prepare("SELECT id,title,log_json,created_at FROM rooms WHERE id=?").bind(parts[1]).first();
    if (!room) return json({ error: "部屋が見つかりません" }, 404);
    if(new URL(request.url).searchParams.get("summary")==="1")return json({id:room.id,title:room.title,createdAt:room.created_at});
    const log = JSON.parse(room.log_json);
    if(log.storage==="r2"){if(!env.LOGS)return json({error:"R2ログストレージが接続されていません"},500);const object=await env.LOGS.get(log.key||roomLogKey(parts[1]));if(!object)return json({error:"R2にログ本文が見つかりません"},404);const stored=JSON.parse(await object.text());log.tabs=stored.tabs||log.tabs||[];log.messages=stored.messages||[]}
    else{if(log.chunked){await ensureLogChunksTable(env.DB);const indexRows=await env.DB.prepare("SELECT chunk_index FROM room_log_chunks WHERE room_id=? ORDER BY chunk_index").bind(parts[1]).all();log.messages=[];for(const item of indexRows.results||[]){const row=await env.DB.prepare("SELECT messages_json FROM room_log_chunks WHERE room_id=? AND chunk_index=?").bind(parts[1],item.chunk_index).first();if(row?.messages_json)log.messages.push(...JSON.parse(row.messages_json))}}if(env.LOGS&&Array.isArray(log.messages)){try{const stored=await putRoomLog(env.LOGS,parts[1],log.tabs,log.messages);await env.DB.prepare("UPDATE rooms SET log_json=? WHERE id=?").bind(JSON.stringify({tabs:log.tabs||[],storage:"r2",key:stored.key,size:stored.size,messageCount:log.messages.length}),parts[1]).run();await ensureLogChunksTable(env.DB);await env.DB.prepare("DELETE FROM room_log_chunks WHERE room_id=?").bind(parts[1]).run()}catch{}}}
    return json({ id: room.id, title: room.title, createdAt: room.created_at, ...log });
  }

  if(method==="DELETE"&&parts[0]==="rooms"&&parts[1]&&parts.length===2){const room=await env.DB.prepare("SELECT admin_token,log_json FROM rooms WHERE id=?").bind(parts[1]).first();if(!room)return json({error:"部屋が見つかりません"},404);if(!request.headers.get("x-admin-token")||request.headers.get("x-admin-token")!==room.admin_token)return json({error:"部屋主だけが削除できます"},403);const log=JSON.parse(room.log_json||"{}");if(log.storage==="r2"){if(!env.LOGS)return json({error:"R2ログストレージが接続されていません"},500);await env.LOGS.delete(log.key||roomLogKey(parts[1]))}await ensureLogChunksTable(env.DB);await ensurePresenceTable(env.DB);await ensureBoardsSchema(env.DB);await env.DB.batch([env.DB.prepare("DELETE FROM board_logs WHERE room_id=?").bind(parts[1]),env.DB.prepare("DELETE FROM annotations WHERE room_id=?").bind(parts[1]),env.DB.prepare("DELETE FROM presence WHERE room_id=?").bind(parts[1]),env.DB.prepare("DELETE FROM room_log_chunks WHERE room_id=?").bind(parts[1]),env.DB.prepare("DELETE FROM rooms WHERE id=?").bind(parts[1])]);notifyRoomDeleted(context,env,parts[1]);return json({ok:true})}

  if(method==="GET"&&parts[0]==="rooms"&&parts[1]&&parts[2]==="realtime"&&parts.length===3){
    if(request.headers.get("Upgrade")?.toLowerCase()!=="websocket")return json({error:"WebSocket接続が必要です"},426);
    const room=await env.DB.prepare("SELECT id FROM rooms WHERE id=?").bind(parts[1]).first();if(!room)return json({error:"部屋が見つかりません"},404);
    const hub=roomHub(env,parts[1]);if(!hub)return json({error:"リアルタイム機能が接続されていません（Binding名: ROOMS）"},503);
    return hub.fetch(request);
  }

  if(method==="GET"&&parts[0]==="rooms"&&parts[1]&&parts[2]==="icons"&&parts[3]&&parts.length===4){
    if(!env.LOGS)return new Response("R2 is not connected",{status:500});
    if(!/^[a-f0-9]{64}$/i.test(parts[3]))return new Response("Not found",{status:404});
    const room=await env.DB.prepare("SELECT id FROM rooms WHERE id=?").bind(parts[1]).first();if(!room)return new Response("Not found",{status:404});
    const object=await env.LOGS.get(iconKey(parts[3].toLowerCase()));if(!object)return new Response("Not found",{status:404});
    return new Response(object.body,{headers:{"content-type":object.httpMetadata?.contentType||"image/webp","cache-control":"private, max-age=31536000, immutable","etag":object.httpEtag||parts[3]}});
  }

  if (parts[0] === "rooms" && parts[1] && parts[2] === "annotations") {
    await ensureAnnotationSchema(env.DB);
    const roomId = parts[1];
    if(method==="GET"&&parts[3]&&parts[4]==="image"){
      const row=await env.DB.prepare("SELECT image_data FROM annotations WHERE room_id=? AND id=?").bind(roomId,parts[3]).first();
      if(!row?.image_data)return new Response("Not found",{status:404});
      const match=String(row.image_data).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      if(!match)return new Response("Invalid image",{status:415});
      const binary=atob(match[2]),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
      return new Response(bytes,{headers:{"content-type":match[1],"cache-control":"private, max-age=31536000, immutable"}});
    }
    if(method==="GET"&&parts[3]==="version"){
      const room=await env.DB.prepare("SELECT annotation_version FROM rooms WHERE id=?").bind(roomId).first();
      return room?json({version:Number(room.annotation_version)||0}):json({error:"部屋が見つかりません"},404);
    }
    if (method === "GET") {
      const viewer=new URL(request.url).searchParams.get("authorId")||"";
      const result = await env.DB.prepare("SELECT a.id,a.room_id,a.message_id,a.end_message_id,a.parent_id,a.start_offset,a.end_offset,a.quote,a.color,a.author_id,a.author_name,a.persona_name,a.persona_type,a.persona_icon,a.body,a.created_at,CASE WHEN a.image_data<>'' THEN 1 ELSE 0 END AS has_image,(SELECT COUNT(*) FROM annotation_likes l WHERE l.annotation_id=a.id) AS like_count,EXISTS(SELECT 1 FROM annotation_likes l WHERE l.annotation_id=a.id AND l.author_id=?) AS liked_by_me FROM annotations a WHERE a.room_id=? ORDER BY a.created_at,a.id").bind(viewer,roomId).all();
      const annotations=result.results||[];
      if(env.LOGS){
        const legacy=[...new Set(annotations.map(item=>item.persona_icon).filter(value=>String(value||"").startsWith("data:image/")))];
        for(const oldValue of legacy){try{const reference=await storePersonaIcon(env.LOGS,oldValue);if(reference){await env.DB.prepare("UPDATE annotations SET persona_icon=? WHERE room_id=? AND persona_icon=?").bind(reference,roomId,oldValue).run();annotations.forEach(item=>{if(item.persona_icon===oldValue)item.persona_icon=reference})}}catch{}}
      }
      annotations.forEach(item=>{item.persona_icon=publicPersonaIcon(roomId,item.persona_icon)});
      const room=await env.DB.prepare("SELECT annotation_version FROM rooms WHERE id=?").bind(roomId).first();
      return json({ annotations,version:Number(room?.annotation_version)||0 });
    }
    if (method === "POST" && parts.length === 3) {
      const body = await safeBody(request);
      const required = ["messageId", "quote", "authorName", "personaName", "personaType"];
      const missing = !body ? required : required.filter(key => body[key] == null || String(body[key]).trim() === "");
      if (missing.length) return json({ error: `入力が足りません（${missing.join(", ")}）` }, 400);
      if(!String(body.body||"").trim())return json({error:"感想を入力してください"},400);
      const exists = await env.DB.prepare("SELECT id FROM rooms WHERE id=?").bind(roomId).first();
      if (!exists) return json({ error: "部屋が見つかりません" }, 404);
      const id = randomToken(16);
      const personaIcon=env.LOGS?await storePersonaIcon(env.LOGS,String(body.personaIcon||"")):String(body.personaIcon||"").slice(0,100_000);
      await env.DB.prepare(`INSERT INTO annotations
        (id,room_id,message_id,end_message_id,parent_id,start_offset,end_offset,quote,color,author_id,author_name,persona_name,persona_type,persona_icon,body,image_data)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
          id, roomId, String(body.messageId), String(body.endMessageId || body.messageId), String(body.parentId||""), Number(body.startOffset) || 0, Number(body.endOffset) || 0,
          String(body.quote).slice(0, 2000), String(body.color || "yellow"), String(body.authorId || randomToken(12)).slice(0, 100),
          String(body.authorName).slice(0, 80), String(body.personaName).slice(0, 80), String(body.personaType).slice(0, 20), personaIcon,
          String(body.body||"").slice(0, 4000),""
        ).run();
      await bumpAnnotationVersion(env.DB,roomId);
      notifyRoom(context,env,roomId,"comment",request);
      const row = await env.DB.prepare("SELECT * FROM annotations WHERE id=?").bind(id).first();
      return json(row, 201);
    }
    if(method==="POST"&&parts[3]&&parts[4]==="like"){const body=await safeBody(request),authorId=String(body?.authorId||"").slice(0,100);if(!authorId)return json({error:"参加者情報が必要です"},400);const exists=await env.DB.prepare("SELECT id FROM annotations WHERE room_id=? AND id=?").bind(roomId,parts[3]).first();if(!exists)return json({error:"コメントが見つかりません"},404);const liked=await env.DB.prepare("SELECT 1 FROM annotation_likes WHERE annotation_id=? AND author_id=?").bind(parts[3],authorId).first();if(liked)await env.DB.prepare("DELETE FROM annotation_likes WHERE annotation_id=? AND author_id=?").bind(parts[3],authorId).run();else await env.DB.prepare("INSERT INTO annotation_likes(annotation_id,author_id) VALUES(?,?)").bind(parts[3],authorId).run();await bumpAnnotationVersion(env.DB,roomId);notifyRoom(context,env,roomId,"like",request);return json({liked:!liked})}
    if(method==="DELETE"&&parts[3]){const body=await safeBody(request),annotation=await env.DB.prepare("SELECT author_id FROM annotations WHERE room_id=? AND id=?").bind(roomId,parts[3]).first();if(!annotation)return json({error:"コメントが見つかりません"},404);const room=await env.DB.prepare("SELECT admin_token FROM rooms WHERE id=?").bind(roomId).first(),isAdmin=room&&request.headers.get("x-admin-token")===room.admin_token;if(!isAdmin&&(!body?.authorId||String(body.authorId)!==annotation.author_id))return json({error:"自分のコメントだけ削除できます"},403);await env.DB.prepare("DELETE FROM annotation_likes WHERE annotation_id IN (WITH RECURSIVE descendants(id) AS (SELECT id FROM annotations WHERE room_id=? AND id=? UNION ALL SELECT a.id FROM annotations a JOIN descendants d ON a.parent_id=d.id WHERE a.room_id=?) SELECT id FROM descendants)").bind(roomId,parts[3],roomId).run();await env.DB.prepare(`WITH RECURSIVE descendants(id) AS (SELECT id FROM annotations WHERE room_id=? AND id=? UNION ALL SELECT a.id FROM annotations a JOIN descendants d ON a.parent_id=d.id WHERE a.room_id=?) DELETE FROM annotations WHERE room_id=? AND id IN (SELECT id FROM descendants)`).bind(roomId,parts[3],roomId,roomId).run();await bumpAnnotationVersion(env.DB,roomId);notifyRoom(context,env,roomId,"delete",request);return json({ok:true})}
    if(method==="PATCH"&&parts[3]&&parts[3]!=="color"){
      const body=await safeBody(request),annotation=await env.DB.prepare("SELECT author_id,image_data FROM annotations WHERE room_id=? AND id=?").bind(roomId,parts[3]).first();if(!annotation)return json({error:"コメントが見つかりません"},404);if(!body?.authorId||String(body.authorId)!==annotation.author_id)return json({error:"自分のコメントだけ編集できます"},403);
      const imageData=body.imageData===null?annotation.image_data:String(body.imageData||"").slice(0,700000),text=String(body.body||"").trim();if(!text&&!imageData)return json({error:"感想または画像を入力してください"},400);
      const personaIcon=env.LOGS?await storePersonaIcon(env.LOGS,String(body.personaIcon||"")):String(body.personaIcon||"").slice(0,100000);
      await env.DB.prepare("UPDATE annotations SET body=?,color=?,persona_name=?,persona_type=?,persona_icon=?,image_data=? WHERE room_id=? AND id=?").bind(text.slice(0,4000),String(body.color||"yellow").slice(0,40),String(body.personaName||"").slice(0,80),String(body.personaType||"").slice(0,20),personaIcon,imageData,roomId,parts[3]).run();await bumpAnnotationVersion(env.DB,roomId);notifyRoom(context,env,roomId,"edit",request);return json({ok:true});
    }
    if(method==="PATCH"&&parts[3]==="color"){
      const body=await safeBody(request),color=String(body?.color||"");
      if(!body?.authorId||!body?.personaName||!body?.personaType||!color)return json({error:"色の更新情報が足りません"},400);
      await env.DB.prepare("UPDATE annotations SET color=? WHERE room_id=? AND author_id=? AND persona_name=? AND persona_type=?").bind(color.slice(0,40),roomId,String(body.authorId).slice(0,100),String(body.personaName).slice(0,80),String(body.personaType).slice(0,20)).run();
      await bumpAnnotationVersion(env.DB,roomId);
      notifyRoom(context,env,roomId,"color",request);
      return json({ok:true});
    }
  }
  if (parts[0] === "rooms" && parts[1] && parts[2] === "presence") {
    const roomId=parts[1];
    await ensurePresenceTable(env.DB);
    if(method==="GET"){const result=await env.DB.prepare("SELECT pl_name,pl_icon,is_typing,typing_name,typing_icon,typing_message_id,last_seen FROM presence WHERE room_id=? AND last_seen >= datetime('now','-70 seconds') ORDER BY last_seen DESC").bind(roomId).all();return json({presence:result.results||[]})}
    if(method==="POST"){
      const body=await safeBody(request);if(!body?.authorId||!String(body.plName||"").trim())return json({error:"PL名が必要です"},400);
      await env.DB.prepare(`INSERT INTO presence (room_id,author_id,pl_name,pl_icon,is_typing,typing_name,typing_icon,typing_message_id,last_seen) VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(room_id,author_id) DO UPDATE SET pl_name=excluded.pl_name,pl_icon=excluded.pl_icon,is_typing=excluded.is_typing,typing_name=excluded.typing_name,typing_icon=excluded.typing_icon,typing_message_id=excluded.typing_message_id,last_seen=CURRENT_TIMESTAMP`).bind(roomId,String(body.authorId).slice(0,100),String(body.plName).slice(0,80),String(body.plIcon||"").slice(0,100000),body.isTyping?1:0,String(body.typingName||"").slice(0,80),String(body.typingIcon||"").slice(0,100000),String(body.typingMessageId||"").slice(0,100)).run();
      const result=await env.DB.prepare("SELECT pl_name,pl_icon,is_typing,typing_name,typing_icon,typing_message_id,last_seen FROM presence WHERE room_id=? AND last_seen >= datetime('now','-70 seconds') ORDER BY last_seen DESC").bind(roomId).all();return json({presence:result.results||[]})
    }
  }
  return json({ error: "Not found" }, 404);
}
