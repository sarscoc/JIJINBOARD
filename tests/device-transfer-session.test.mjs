import {test} from 'node:test';import assert from 'node:assert/strict';import {roomFixture} from './helpers/room-db.mjs';import {handleRoomPlayers} from '../src/room-players.js';import {deviceSession} from '../src/device-session.js';
test('a redeemed device code shares the PL lock; unauthenticated session requests cannot claim or release it',async t=>{
 const f=roomFixture(t),values=new Map(),storage={transaction:fn=>fn({get:async k=>values.get(k),put:async(k,v)=>values.set(k,v),delete:async k=>values.delete(k)})};let notifications=0;
 f.env.ROOMS={idFromName:x=>x,get:()=>({fetch:async(url,init)=>{if(url.endsWith('/notify')){notifications++;return new Response('{}')}const r=await deviceSession(storage,JSON.parse(init.body));return new Response(JSON.stringify(r.body),{status:r.status})}})};
 const req=(method,data,token='')=>new Request('https://test/api',{method,headers:{'x-player-token':token},body:JSON.stringify(data)});
 const registered=await(await handleRoomPlayers(req('POST',{playerId:'p',plName:'PL'}),f.env,'one',[])).json();
 const code=await(await handleRoomPlayers(req('POST',{},registered.accessToken),f.env,'one',['p','code'])).json();
 const phone=await(await handleRoomPlayers(req('POST',{}),f.env,'one',['redeem',code.code])).json();assert.notEqual(phone.accessToken,registered.accessToken);
 const claim=(device,token,action='claim')=>handleRoomPlayers(req('POST',{deviceId:device,tabId:'tab',action},token),f.env,'one',['p','session']);
 const count=notifications;assert.equal((await claim('laptop',registered.accessToken)).status,200);assert.equal((await claim('phone',phone.accessToken)).status,409);
 assert.equal((await claim('laptop','bad','release')).status,403);assert.equal((await claim('phone',phone.accessToken)).status,409);
 await claim('laptop',registered.accessToken,'release');assert.equal((await claim('phone',phone.accessToken)).status,200);assert.equal(notifications,count,'session heartbeats must not trigger participant reloads');
});
