import { DurableObject } from 'cloudflare:workers';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const clean=(value,max=100)=>String(value||'').slice(0,max);
const cleanData=value=>{if(value==null)return null;try{const text=JSON.stringify(value);return text.length>6000?null:JSON.parse(text)}catch{return null}};
const PRESENCE_TTL=70_000;
export class RoomHub extends DurableObject{
  constructor(ctx,env){super(ctx,env);this.httpPresence=new Map()}
  async fetch(request){
    const url=new URL(request.url);
    if(url.pathname.endsWith('/realtime')){if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket required',{status:426});const pair=new WebSocketPair(),client=pair[0],server=pair[1];this.ctx.acceptWebSocket(server);server.serializeAttachment({client_id:'',author_id:'',pl_name:'',pl_icon:'',is_typing:false,typing_name:'',typing_icon:'',typing_message_id:''});return new Response(null,{status:101,webSocket:client})}
    if(url.pathname==='/notify'&&request.method==='POST'){try{const message=await request.json();const action=clean(message?.action,40);if(action==='matrix-point')return json({ok:true,ignored:true});this.broadcast({type:'refresh',action,data:cleanData(message?.data)},clean(message?.excludeClientId,100));return json({ok:true})}catch{return json({error:'Invalid message'},400)}}
    if(url.pathname==='/deleted'&&request.method==='POST'){this.broadcast({type:'room-deleted'});this.httpPresence.clear();return json({ok:true})}
    if(url.pathname==='/presence'){
      if(request.method==='POST'){let body={};try{body=await request.json()}catch{};const authorId=clean(body?.authorId,120),plName=clean(body?.plName,80);if(authorId&&plName)this.httpPresence.set(authorId,{author_id:authorId,pl_name:plName,pl_icon:clean(body?.plIcon,100000),is_typing:!!body?.isTyping,typing_name:body?.isTyping?clean(body?.typingName,80):'',typing_icon:body?.isTyping?clean(body?.typingIcon,100000):'',typing_message_id:body?.isTyping?clean(body?.typingMessageId,100):'',last_seen:new Date().toISOString(),seen_at:Date.now()});return json({presence:this.participants()})}
      if(request.method==='GET')return json({presence:this.participants()});
      return json({error:'Method not allowed'},405);
    }
    return new Response('Not found',{status:404});
  }
  webSocketMessage(socket,message){if(typeof message!=='string'||message.length>180000)return;let data;try{data=JSON.parse(message)}catch{return}if(data?.type==='change'){const action=clean(data.action,40);if(action&&action!=='matrix-point')this.broadcast({type:'refresh',action,data:cleanData(data.data)},'',socket);return}if(data?.type!=='join'&&data?.type!=='presence')return;const prev=socket.deserializeAttachment()||{},next={client_id:clean(data.clientId||prev.client_id,100),author_id:clean(data.authorId||prev.author_id,120),pl_name:clean(data.plName||prev.pl_name,80),pl_icon:clean(data.plIcon||prev.pl_icon,100000),is_typing:!!data.isTyping,typing_name:data.isTyping?clean(data.typingName,80):'',typing_icon:data.isTyping?clean(data.typingIcon,100000):'',typing_message_id:data.isTyping?clean(data.typingMessageId,100):'',last_seen:new Date().toISOString()};socket.serializeAttachment(next);if(next.author_id)this.httpPresence.delete(next.author_id);this.broadcastPresence()}
  webSocketClose(socket){this.broadcastPresence(socket)}
  webSocketError(socket){this.broadcastPresence(socket)}
  participants(excludedSocket=null){const now=Date.now();for(const [id,p] of this.httpPresence)if(now-Number(p.seen_at||0)>PRESENCE_TTL)this.httpPresence.delete(id);const people=new Map();for(const p of this.httpPresence.values())people.set(p.author_id,p);for(const socket of this.ctx.getWebSockets()){if(socket===excludedSocket)continue;const p=socket.deserializeAttachment()||{};if(!p.author_id||!p.pl_name)continue;const current=people.get(p.author_id);if(!current||p.is_typing)people.set(p.author_id,p)}return[...people.values()].map(({seen_at,...p})=>p)}
  broadcastPresence(excludedSocket=null){this.broadcast({type:'presence',presence:this.participants(excludedSocket)},'',excludedSocket)}
  broadcast(payload,excludeClientId='',excludedSocket=null){const text=JSON.stringify(payload);for(const socket of this.ctx.getWebSockets()){if(socket===excludedSocket)continue;const p=socket.deserializeAttachment()||{};if(excludeClientId&&p.client_id===excludeClientId)continue;try{socket.send(text)}catch{}}}
}
export default{fetch(request){const url=new URL(request.url);if(url.pathname==='/health')return json({ok:true,service:'JIJINBOARD ROOM_HUB'});return new Response('This Worker is used through the ROOM_HUB binding.',{status:404})}};
