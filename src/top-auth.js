const encoder=new TextEncoder();
const SESSION_COOKIE="jijinboard_top_session";
const SESSION_SECONDS=60*60*24*30;
const PBKDF2_ITERATIONS=120000;

const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...headers}});
const base64url=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
const fromBase64url=value=>{const text=String(value||""),padded=text.replace(/-/g,"+").replace(/_/g,"/")+"===".slice((text.length+3)%4),raw=atob(padded);return Uint8Array.from(raw,c=>c.charCodeAt(0))};
const randomToken=(bytes=32)=>base64url(crypto.getRandomValues(new Uint8Array(bytes)));
const sha256=async value=>new Uint8Array(await crypto.subtle.digest("SHA-256",typeof value==="string"?encoder.encode(value):value));
const equalBytes=(a,b)=>{if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0};
const equalText=(a,b)=>{a=String(a||"");b=String(b||"");if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0};
const safeBody=async request=>{try{return await request.json()}catch{return null}};

async function ensureTopAuthSchema(db){
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS top_auth (id INTEGER PRIMARY KEY CHECK(id=1),salt TEXT NOT NULL,password_hash TEXT NOT NULL,iterations INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS top_sessions (token_hash TEXT PRIMARY KEY,expires_at TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_top_sessions_expires ON top_sessions(expires_at)")
  ]);
}

async function passwordHash(password,salt,iterations){
  const key=await crypto.subtle.importKey("raw",encoder.encode(password),"PBKDF2",false,["deriveBits"]);
  const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt,iterations,hash:"SHA-256"},key,256);
  return new Uint8Array(bits);
}

function cookieValue(request,name){
  const raw=request.headers.get("cookie")||"";
  for(const part of raw.split(";")){
    const at=part.indexOf("=");if(at<0)continue;
    if(part.slice(0,at).trim()===name)return decodeURIComponent(part.slice(at+1).trim());
  }
  return "";
}

const sessionCookie=token=>`${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
const clearSessionCookie=()=>`${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;

async function createSession(db){
  await db.prepare("DELETE FROM top_sessions WHERE expires_at<=?").bind(new Date().toISOString()).run();
  const token=randomToken(32),tokenHash=base64url(await sha256(token)),expiresAt=new Date(Date.now()+SESSION_SECONDS*1000).toISOString();
  await db.prepare("INSERT INTO top_sessions(token_hash,expires_at) VALUES(?,?)").bind(tokenHash,expiresAt).run();
  return {token,expiresAt};
}

export async function isTopAuthenticated(request,env){
  if(!env.DB)return false;
  await ensureTopAuthSchema(env.DB);
  const token=cookieValue(request,SESSION_COOKIE);if(!token)return false;
  const tokenHash=base64url(await sha256(token)),row=await env.DB.prepare("SELECT expires_at FROM top_sessions WHERE token_hash=?").bind(tokenHash).first();
  if(!row)return false;
  if(Date.parse(row.expires_at)<=Date.now()){await env.DB.prepare("DELETE FROM top_sessions WHERE token_hash=?").bind(tokenHash).run();return false}
  return true;
}

async function setup(request,env){
  await ensureTopAuthSchema(env.DB);
  if(await env.DB.prepare("SELECT id FROM top_auth WHERE id=1").first())return json({error:"管理TOPのパスワードは設定済みです"},409);
  const body=await safeBody(request),password=String(body?.password||""),boardId=String(body?.boardId||""),adminToken=String(body?.adminToken||"");
  if(password.length<8||password.length>256)return json({error:"パスワードは8文字以上で設定してください"},400);
  if(!boardId||!adminToken)return json({error:"このブラウザの部屋主管理情報が見つかりません"},403);
  let board=null;try{board=await env.DB.prepare("SELECT admin_token FROM boards WHERE id=?").bind(boardId).first()}catch{}
  if(!board||!equalText(adminToken,board.admin_token))return json({error:"部屋主の確認ができませんでした"},403);
  const salt=crypto.getRandomValues(new Uint8Array(16)),hash=await passwordHash(password,salt,PBKDF2_ITERATIONS);
  try{await env.DB.prepare("INSERT INTO top_auth(id,salt,password_hash,iterations) VALUES(1,?,?,?)").bind(base64url(salt),base64url(hash),PBKDF2_ITERATIONS).run()}catch{return json({error:"管理TOPのパスワードは設定済みです"},409)}
  const session=await createSession(env.DB);
  return json({ok:true},200,{"set-cookie":sessionCookie(session.token)});
}

async function login(request,env){
  await ensureTopAuthSchema(env.DB);
  const row=await env.DB.prepare("SELECT salt,password_hash,iterations FROM top_auth WHERE id=1").first();
  if(!row)return json({error:"先に管理TOPのパスワードを設定してください"},409);
  const body=await safeBody(request),password=String(body?.password||"");
  if(!password)return json({error:"パスワードを入力してください"},400);
  const actual=await passwordHash(password,fromBase64url(row.salt),Number(row.iterations)||PBKDF2_ITERATIONS),expected=fromBase64url(row.password_hash);
  if(!equalBytes(actual,expected))return json({error:"パスワードが違います"},403);
  const session=await createSession(env.DB);
  return json({ok:true},200,{"set-cookie":sessionCookie(session.token)});
}

async function logout(request,env){
  await ensureTopAuthSchema(env.DB);
  const token=cookieValue(request,SESSION_COOKIE);
  if(token){const tokenHash=base64url(await sha256(token));await env.DB.prepare("DELETE FROM top_sessions WHERE token_hash=?").bind(tokenHash).run()}
  return json({ok:true},200,{"set-cookie":clearSessionCookie()});
}

export async function handleTopAuthApi(request,env,action){
  if(!env.DB)return json({error:"D1データベースが接続されていません"},503);
  await ensureTopAuthSchema(env.DB);
  if(request.method==="GET"&&action==="status"){
    const configured=!!await env.DB.prepare("SELECT id FROM top_auth WHERE id=1").first();
    return json({configured,authenticated:configured?await isTopAuthenticated(request,env):false});
  }
  if(request.method==="POST"&&action==="setup")return setup(request,env);
  if(request.method==="POST"&&action==="login")return login(request,env);
  if(request.method==="POST"&&action==="logout")return logout(request,env);
  return json({error:"Not found"},404);
}

export async function serveProtectedTop(request,env){
  if(!env.DB)return new Response("管理TOPを読み込めません。D1接続を確認してください。",{status:503,headers:{"content-type":"text/plain; charset=utf-8","cache-control":"no-store"}});
  const authenticated=await isTopAuthenticated(request,env),url=new URL(request.url),assetUrl=new URL(authenticated?"/index.html":"/top-login.html",url.origin);
  const assetRequest=new Request(assetUrl,{method:request.method,headers:request.headers});
  const response=await env.ASSETS.fetch(assetRequest),headers=new Headers(response.headers);
  headers.set("cache-control","no-store");headers.set("vary","Cookie");
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
