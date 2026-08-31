import { tokenHash } from './data-model.js';

const encoder=new TextEncoder();
const SESSION_COOKIE='jijinboard_top_session';
const SESSION_SECONDS=60*60*24*30;
const HASH_VERSION=1;
const HASH_CONTEXT=encoder.encode('JIJINBOARD-TOP-AUTH-v1\0');

const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
const base64url=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
const fromBase64url=value=>{const text=String(value||''),padded=text.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((text.length+3)%4),raw=atob(padded);return Uint8Array.from(raw,c=>c.charCodeAt(0))};
const randomToken=(bytes=32)=>base64url(crypto.getRandomValues(new Uint8Array(bytes)));
const sha256=async value=>new Uint8Array(await crypto.subtle.digest('SHA-256',typeof value==='string'?encoder.encode(value):value));
const equalBytes=(a,b)=>{if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0};
const safeBody=async request=>{try{return await request.json()}catch{return null}};

async function passwordHash(password,salt){
  const passwordBytes=encoder.encode(password),input=new Uint8Array(salt.length+HASH_CONTEXT.length+passwordBytes.length);
  input.set(salt,0);input.set(HASH_CONTEXT,salt.length);input.set(passwordBytes,salt.length+HASH_CONTEXT.length);
  return sha256(input);
}

function cookieValue(request,name){
  const raw=request.headers.get('cookie')||'';
  for(const part of raw.split(';')){
    const at=part.indexOf('=');if(at<0)continue;
    if(part.slice(0,at).trim()===name)return decodeURIComponent(part.slice(at+1).trim());
  }
  return '';
}
const sessionCookie=token=>`${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
const clearSessionCookie=()=>`${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;

async function createSession(db){
  await db.prepare('DELETE FROM top_session WHERE session_expires_at<=?').bind(new Date().toISOString()).run();
  const token=randomToken(32),sessionTokenHash=await tokenHash(token),expiresAt=new Date(Date.now()+SESSION_SECONDS*1000).toISOString();
  await db.prepare('INSERT INTO top_session(session_token_hash,session_expires_at) VALUES(?,?)').bind(sessionTokenHash,expiresAt).run();
  return {token,expiresAt};
}

export async function isTopAuthenticated(request,env){
  if(!env.DB)return false;
  const auth=await env.DB.prepare('SELECT password_hash_version FROM top_auth LIMIT 1').first();
  if(!auth||Number(auth.password_hash_version)!==HASH_VERSION)return false;
  const token=cookieValue(request,SESSION_COOKIE);if(!token)return false;
  const sessionTokenHash=await tokenHash(token),row=await env.DB.prepare('SELECT session_expires_at FROM top_session WHERE session_token_hash=?').bind(sessionTokenHash).first();
  if(!row)return false;
  if(Date.parse(row.session_expires_at)<=Date.now()){await env.DB.prepare('DELETE FROM top_session WHERE session_token_hash=?').bind(sessionTokenHash).run();return false}
  return true;
}

async function verifyOwnerProof(body,env){
  const roomId=String(body?.boardId||''),adminToken=String(body?.adminToken||'');
  if(!roomId||!adminToken)return false;
  const room=await env.DB.prepare('SELECT room_admin_token_hash FROM room WHERE room_id=?').bind(roomId).first();
  return !!room&&(await tokenHash(adminToken))===room.room_admin_token_hash;
}

async function setup(request,env){
  const body=await safeBody(request),password=String(body?.password||'');
  if(password.length<8||password.length>256)return json({error:'パスワードは8文字以上で設定してください'},400);
  if(!await verifyOwnerProof(body,env))return json({error:'部屋主の確認ができませんでした'},403);
  const existing=await env.DB.prepare('SELECT password_hash_version FROM top_auth LIMIT 1').first();
  if(existing&&Number(existing.password_hash_version)===HASH_VERSION)return json({error:'管理TOPのパスワードは設定済みです'},409);
  const salt=crypto.getRandomValues(new Uint8Array(32)),hash=await passwordHash(password,salt);
  await env.DB.prepare('DELETE FROM top_auth').run();
  await env.DB.prepare('INSERT INTO top_auth(password_hash,password_salt,password_hash_version) VALUES(?,?,?)').bind(base64url(hash),base64url(salt),HASH_VERSION).run();
  await env.DB.prepare('DELETE FROM top_session').run();
  const session=await createSession(env.DB);
  return json({ok:true},200,{'set-cookie':sessionCookie(session.token)});
}

async function login(request,env){
  const row=await env.DB.prepare('SELECT password_hash,password_salt,password_hash_version FROM top_auth LIMIT 1').first();
  if(!row||Number(row.password_hash_version)!==HASH_VERSION)return json({error:'管理TOPの認証設定を更新してください'},409);
  const body=await safeBody(request),password=String(body?.password||'');
  if(!password)return json({error:'パスワードを入力してください'},400);
  const actual=await passwordHash(password,fromBase64url(row.password_salt)),expected=fromBase64url(row.password_hash);
  if(!equalBytes(actual,expected))return json({error:'パスワードが違います'},403);
  const session=await createSession(env.DB);
  return json({ok:true},200,{'set-cookie':sessionCookie(session.token)});
}

async function logout(request,env){
  const token=cookieValue(request,SESSION_COOKIE);
  if(token)await env.DB.prepare('DELETE FROM top_session WHERE session_token_hash=?').bind(await tokenHash(token)).run();
  return json({ok:true},200,{'set-cookie':clearSessionCookie()});
}

export async function handleTopAuthApi(request,env,action){
  if(!env.DB)return json({error:'D1データベースが接続されていません'},503);
  try{
    if(request.method==='GET'&&action==='status'){
      const row=await env.DB.prepare('SELECT password_hash_version FROM top_auth LIMIT 1').first();
      const configured=!!row&&Number(row.password_hash_version)===HASH_VERSION;
      return json({configured,authenticated:configured?await isTopAuthenticated(request,env):false,needsReset:!!row&&!configured});
    }
    if(request.method==='POST'&&action==='setup')return setup(request,env);
    if(request.method==='POST'&&action==='login')return login(request,env);
    if(request.method==='POST'&&action==='logout')return logout(request,env);
    return json({error:'Not found'},404);
  }catch(error){
    console.error('TOP auth error',error);
    return json({error:'管理TOPの認証処理に失敗しました。デプロイ完了後にもう一度お試しください。'},500);
  }
}

export async function serveProtectedTop(request,env){
  if(!env.DB)return new Response('管理TOPを読み込めません。D1接続を確認してください。',{status:503,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'}});
  let authenticated=false;
  try{authenticated=await isTopAuthenticated(request,env)}catch(error){console.error('TOP auth page error',error)}
  const url=new URL(request.url),assetUrl=new URL(authenticated?'/index.html':'/top-login.html',url.origin);
  const assetRequest=new Request(assetUrl,{method:request.method,headers:request.headers});
  const response=await env.ASSETS.fetch(assetRequest),headers=new Headers(response.headers);
  headers.set('cache-control','no-store');headers.set('vary','Cookie');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
