const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const safeBody=async request=>{try{return await request.json()}catch{return null}};
const imageKey=boardId=>`boards/${boardId}/home-image`;
const dataImage=value=>{
  const match=String(value||"").match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([a-zA-Z0-9+/=]+)$/);
  if(!match)return null;
  const binary=atob(match[2]),bytes=new Uint8Array(binary.length);
  for(let index=0;index<binary.length;index++)bytes[index]=binary.charCodeAt(index);
  return {contentType:match[1],bytes};
};
async function boardExists(env,boardId){return env.DB?.prepare("SELECT id FROM boards WHERE id=?").bind(boardId).first()}
async function isOwner(request,env,boardId){const row=await env.DB?.prepare("SELECT admin_token FROM boards WHERE id=?").bind(boardId).first();return !!row&&request.headers.get("x-board-admin-token")===row.admin_token}

export async function onRequestGet({env,params}){
  const boardId=String(params.boardId||"");
  if(!env.DB)return json({error:"D1データベースが接続されていません"},500);
  if(!env.LOGS)return json({error:"R2ストレージが接続されていません"},500);
  if(!await boardExists(env,boardId))return new Response("Not found",{status:404});
  const object=await env.LOGS.get(imageKey(boardId));
  if(!object)return new Response("Not found",{status:404,headers:{"cache-control":"no-store"}});
  return new Response(object.body,{headers:{"content-type":object.httpMetadata?.contentType||"image/webp","cache-control":"no-store","etag":object.httpEtag||""}});
}

export async function onRequestPost({request,env,params}){
  const boardId=String(params.boardId||"");
  if(!env.DB)return json({error:"D1データベースが接続されていません"},500);
  if(!env.LOGS)return json({error:"R2ストレージが接続されていません"},500);
  if(!await isOwner(request,env,boardId))return json({error:"トップ画像を変更できるのは部屋主だけです"},403);
  const body=await safeBody(request),image=dataImage(body?.imageData);
  if(!image)return json({error:"画像を選択してください"},400);
  if(image.bytes.byteLength>6_000_000)return json({error:"トップ画像が大きすぎます（6MBまで）"},413);
  await env.LOGS.put(imageKey(boardId),image.bytes,{httpMetadata:{contentType:image.contentType},customMetadata:{boardId}});
  return json({ok:true});
}

export async function onRequestDelete({request,env,params}){
  const boardId=String(params.boardId||"");
  if(!env.DB)return json({error:"D1データベースが接続されていません"},500);
  if(!env.LOGS)return json({error:"R2ストレージが接続されていません"},500);
  if(!await isOwner(request,env,boardId))return json({error:"トップ画像を変更できるのは部屋主だけです"},403);
  await env.LOGS.delete(imageKey(boardId));
  return json({ok:true});
}
