// D1 keys and R2 prefixes carry the board address, never just a shared PL/PC ID.
const part=value=>{const text=String(value||'');if(!text||text.length>120)throw Error('部屋・人物IDが不正です');return encodeURIComponent(text)};
export const playerPrefix=board=>`/boards/${part(board)}/players/`;
export const playerKey=(board,id)=>playerPrefix(board)+part(id);
export const characterKey=(board,player,id)=>playerKey(board,player)+'/characters/'+part(id);
export const localId=key=>{const match=String(key||'').match(/^\/boards\/[^/]+\/players\/([^/]+)(?:\/characters\/([^/]+))?$/);return match?decodeURIComponent(match[2]||match[1]):String(key||'')};
export const boardOf=key=>{const m=String(key||'').match(/^\/boards\/([^/]+)\/players\/[^/]+(?:\/characters\/[^/]+)?$/);return m?decodeURIComponent(m[1]):''};
export const iconPrefix=(board,kind)=>`rooms/${part(board)}/${kind}`;
export function playerIconUrl(board,key){
 if(!key)return '';
 const raw=String(key).replace(/^r2:/,''),kind=['pl-icons','character-icons','matrix-icons'].find(kind=>raw.startsWith(iconPrefix(board,kind)+'/'));
 if(!kind)return '';
 return `/api/boards/${part(board)}/player-icons/${kind}/${encodeURIComponent(raw.split('/').pop())}`;
}
export async function servePlayerIcon(request,env,board,kind,hash){
 if(request.method!=='GET'||!['pl-icons','character-icons','matrix-icons'].includes(kind)||! /^[A-Za-z0-9_-]{20,80}$/.test(hash))return new Response('Not found',{status:404});
 if(!await env.DB.prepare('SELECT 1 FROM room WHERE room_id=?').bind(board).first())return new Response('Not found',{status:404});
 const object=await env.LOGS.get(iconPrefix(board,kind)+'/'+hash);
 return object?new Response(object.body,{headers:{'content-type':object.httpMetadata?.contentType||'image/webp','cache-control':'private, max-age=31536000, immutable'}}):new Response('Not found',{status:404});
}

