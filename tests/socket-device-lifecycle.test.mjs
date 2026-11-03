import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';import {deviceSession,consumeDeviceTicket,activeDeviceSessions} from '../src/device-session.js';
test('the notification socket retains authenticated ownership through join and releases it on close',async()=>{
 const values=new Map(),tx={get:async k=>structuredClone(values.get(k)),put:async(k,v)=>values.set(k,structuredClone(v)),delete:async k=>values.delete(k)},storage={transaction:fn=>fn(tx)},sockets=[];
 class Socket{readyState=1;messages=[];serializeAttachment(value){this.data=structuredClone(value)}deserializeAttachment(){return this.data}send(text){this.messages.push(JSON.parse(text))}close(){this.readyState=3}}
 class Pair{constructor(){this[0]={};this[1]=new Socket()}}
 class Reply{constructor(body,options={}){this.body=body;this.status=options.status||200}}
 const code=readFileSync(new URL('../realtime-worker/src/index.js',import.meta.url),'utf8').replace(/^import .*\n/gm,'').replace('export class RoomHub','class RoomHub').replace('export default','const worker=');
 const context={deviceSession,consumeDeviceTicket,activeDeviceSessions,Date,WebSocketPair:Pair,Response:Reply,URL,console,DurableObject:class{constructor(ctx){this.ctx=ctx}}};vm.runInNewContext(code+';globalThis.Hub=RoomHub',context);
 const hub=new context.Hub({storage,getWebSockets:()=>sockets,acceptWebSocket:s=>sockets.push(s)}),identity={playerId:'board/pl',deviceId:'first',tabId:'tab'};
 const admitted=await deviceSession(storage,identity);const response=await hub.fetch(new Request('https://room/realtime?sessionTicket='+admitted.body.ticket,{headers:{Upgrade:'websocket'}}));assert.equal(response.status,101);
 const socket=sockets[0];assert.equal(socket.messages[0].type,'device-session-ready');hub.webSocketMessage(socket,JSON.stringify({type:'join',authorId:'pl',plName:'PL',clientId:'client'}));assert.equal(socket.deserializeAttachment().session_player_id,'board/pl');
 assert.equal((await deviceSession(storage,{...identity,deviceId:'second'},Date.now()+3600000,activeDeviceSessions(sockets))).status,409);
 assert.equal(hub.participants()[0].session_device_id,undefined);
 socket.close();await hub.webSocketClose(socket);assert.equal((await deviceSession(storage,{...identity,deviceId:'second'},Date.now(),activeDeviceSessions(sockets))).status,200);
});
