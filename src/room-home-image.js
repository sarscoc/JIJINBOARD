import { verifyRoomAdmin } from './data-model.js';

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const keyFor=roomId=>`rooms/${roomId}/home/cover.webp`;

export async function handleRoomHomeImage(request,env,roomId){
  const room=await env.DB.prepare('SELECT room_id FROM room WHERE room_id=?').bind(roomId).first();
  if(!room)return json({error:'自陣が見つかりません'},404);
  const key=keyFor(roomId);

  if(request.method==='GET'){
    const object=await env.LOGS.get(key);
    if(!object)return new Response(null,{status:404,headers:{'cache-control':'no-store'}});
    const headers=new Headers();
    headers.set('content-type',object.httpMetadata?.contentType||'image/webp');
    headers.set('cache-control','private, max-age=300');
    if(object.httpEtag)headers.set('etag',object.httpEtag);
    return new Response(object.body,{headers});
  }

  if(request.method==='PUT'){
    if(!await verifyRoomAdmin(env.DB,roomId,request.headers.get('x-board-admin-token')||''))return json({error:'この自陣を編集できるのは部屋主だけです'},403);
    const type=String(request.headers.get('content-type')||'').toLowerCase();
    if(type!=='image/webp')return json({error:'TOP画像はWebPで送信してください'},415);
    const bytes=await request.arrayBuffer();
    if(!bytes.byteLength)return json({error:'画像が空です'},400);
    if(bytes.byteLength>1500000)return json({error:'TOP画像が大きすぎます'},413);
    await env.LOGS.put(key,bytes,{httpMetadata:{contentType:'image/webp'}});
    return json({ok:true,size:bytes.byteLength});
  }

  if(request.method==='DELETE'){
    if(!await verifyRoomAdmin(env.DB,roomId,request.headers.get('x-board-admin-token')||''))return json({error:'この自陣を編集できるのは部屋主だけです'},403);
    await env.LOGS.delete(key);
    return json({ok:true});
  }

  return new Response('Method not allowed',{status:405});
}
