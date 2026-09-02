const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const imageKey=boardId=>`boards/${boardId}/home-image`;
const allowedTypes=new Set(["image/webp","image/png","image/jpeg","image/gif"]);

export async function handleBoardHomeImage(request,env,boardId){
  if(!env.DB||!env.LOGS)return json({error:"保存先が接続されていません"},503);
  const board=await env.DB.prepare("SELECT id FROM boards WHERE id=?").bind(boardId).first();
  if(!board)return new Response("Not found",{status:404,headers:{"cache-control":"no-store"}});

  if(request.method==="GET"||request.method==="HEAD"){
    const object=await env.LOGS.get(imageKey(boardId));
    if(!object)return new Response("Not found",{status:404,headers:{"cache-control":"no-store"}});
    const headers=new Headers();
    object.writeHttpMetadata(headers);
    headers.set("content-type",headers.get("content-type")||"image/webp");
    headers.set("cache-control","private, no-cache");
    headers.set("etag",object.httpEtag||"");
    return new Response(request.method==="HEAD"?null:object.body,{status:200,headers});
  }

  if(request.method==="POST"){
    const contentType=String(request.headers.get("content-type")||"").split(";",1)[0].trim().toLowerCase();
    if(!allowedTypes.has(contentType))return json({error:"PNG / JPEG / WebP / GIF画像を選択してください"},415);
    const bytes=await request.arrayBuffer();
    if(!bytes.byteLength)return json({error:"画像が空です"},400);
    if(bytes.byteLength>6_000_000)return json({error:"トップ画像が大きすぎます（6MBまで）"},413);
    await env.LOGS.put(imageKey(boardId),bytes,{httpMetadata:{contentType,cacheControl:"private, no-cache"},customMetadata:{boardId}});
    return json({ok:true});
  }

  return new Response("Method not allowed",{status:405,headers:{allow:"GET, HEAD, POST"}});
}
