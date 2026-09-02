import { verifyRoomAdmin } from './data-model.js';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const defaults={color1:'#171a20',alternateCells:false,alternateCellColor:'#f7f7f8',gradientColor1:'#67a3ff',gradientColor2:'#9f71ff'};
const color=value=>/^#[0-9a-f]{6}$/i.test(String(value||''))?String(value):null;
const normalize=input=>!input||typeof input!=='object'?null:{color1:color(input.color1)||defaults.color1,alternateCells:!!input.alternateCells,alternateCellColor:color(input.alternateCellColor)||defaults.alternateCellColor,gradientColor1:color(input.gradientColor1)||defaults.gradientColor1,gradientColor2:color(input.gradientColor2)||defaults.gradientColor2};
const homeImageKey=roomId=>`rooms/${roomId}/home/cover.webp`;

async function homeImage(request,env,roomId){
  const key=homeImageKey(roomId);
  if(request.method==='GET'){
    const object=await env.LOGS.get(key);
    if(!object)return new Response(null,{status:404,headers:{'cache-control':'no-store'}});
    const headers=new Headers();headers.set('content-type',object.httpMetadata?.contentType||'image/webp');headers.set('cache-control','private, max-age=300');if(object.httpEtag)headers.set('etag',object.httpEtag);
    return new Response(object.body,{headers});
  }
  if(!await verifyRoomAdmin(env.DB,roomId,request.headers.get('x-board-admin-token')||''))return json({error:'デザインを変更できるのは部屋主だけです'},403);
  if(request.method==='DELETE'){await env.LOGS.delete(key);return json({ok:true})}
  if(request.method!=='PUT')return json({error:'Method not allowed'},405);
  if(String(request.headers.get('content-type')||'').toLowerCase()!=='image/webp')return json({error:'TOP画像はWebPで送信してください'},415);
  const bytes=await request.arrayBuffer();if(!bytes.byteLength)return json({error:'画像が空です'},400);if(bytes.byteLength>1500000)return json({error:'TOP画像が大きすぎます'},413);
  await env.LOGS.put(key,bytes,{httpMetadata:{contentType:'image/webp'}});return json({ok:true,size:bytes.byteLength});
}

export async function handleBoardTheme(request,env,roomId){
  const room=await env.DB.prepare('SELECT room_id FROM room WHERE room_id=?').bind(roomId).first();if(!room)return json({error:'自陣が見つかりません'},404);
  const url=new URL(request.url);if(url.searchParams.get('asset')==='home-image')return homeImage(request,env,roomId);
  if(request.method==='GET'){const row=await env.DB.prepare('SELECT base_color,alternate_cells_enabled,alternate_cell_color,gradient_start_color,gradient_end_color,updated_at FROM room_theme WHERE room_id=?').bind(roomId).first();return json({theme:row?{color1:row.base_color,alternateCells:!!row.alternate_cells_enabled,alternateCellColor:row.alternate_cell_color,gradientColor1:row.gradient_start_color,gradientColor2:row.gradient_end_color}:null,updatedAt:row?.updated_at||''})}
  if(!await verifyRoomAdmin(env.DB,roomId,request.headers.get('x-board-admin-token')||''))return json({error:'デザインを変更できるのは部屋主だけです'},403);
  if(request.method==='DELETE'){await env.DB.prepare('DELETE FROM room_theme WHERE room_id=?').bind(roomId).run();return json({ok:true,theme:null})}
  if(request.method!=='POST')return json({error:'Method not allowed'},405);let body=null;try{body=await request.json()}catch{}const theme=normalize(body?.theme);if(!theme)return json({error:'デザイン設定が正しくありません'},400);
  await env.DB.prepare(`INSERT INTO room_theme(room_id,base_color,alternate_cells_enabled,alternate_cell_color,gradient_start_color,gradient_end_color,updated_at) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(room_id) DO UPDATE SET base_color=excluded.base_color,alternate_cells_enabled=excluded.alternate_cells_enabled,alternate_cell_color=excluded.alternate_cell_color,gradient_start_color=excluded.gradient_start_color,gradient_end_color=excluded.gradient_end_color,updated_at=CURRENT_TIMESTAMP`).bind(roomId,theme.color1,theme.alternateCells?1:0,theme.alternateCellColor,theme.gradientColor1,theme.gradientColor2).run();return json({ok:true,theme});
}
