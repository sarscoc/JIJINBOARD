import {test} from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import {readFileSync} from 'node:fs';
test('a denied transferred device shows a retry notice and blocks API mutations',async t=>{
 const dom=new JSDOM('<main>board</main>',{url:'https://test/board/?id=b',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;w.Request=Request;let writes=0;
 w.fetch=async path=>{if(String(path).endsWith('/session'))return {ok:false,status:409,json:async()=>({code:'DEVICE_IN_USE',error:'もう片方の端末を閉じてから、再読み込みしてください。'})};writes++;return {ok:true}};
 w.eval(readFileSync(new URL('../public/shared/device-session.js',import.meta.url),'utf8'));await assert.rejects(w.JijinDeviceSession.start('b','p','token'));
 assert.match(w.document.getElementById('jijinDeviceNotice').textContent,/もう片方の端末を閉じてから、再読み込みしてください。/);assert.equal(w.document.querySelector('#jijinDeviceNotice button').textContent,'再読み込み');
 await assert.rejects(w.fetch('/api/boards/b/spreadsheet/state',{method:'POST',body:'{}'}));assert.equal(writes,0);
});

test('entry is checked once and held by the existing socket, with no periodic checks',async t=>{
 const dom=new JSDOM('<main>board</main>',{url:'https://test/board/?id=b',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;w.Request=Request;w.AbortSignal=AbortSignal;let claims=0,writes=0;
 w.setInterval=()=>assert.fail('no periodic device timer');w.setTimeout=()=>assert.fail('no recurring device check');
 w.fetch=async path=>{if(String(path).endsWith('/session')){claims++;return {ok:true,json:async()=>({ticket:'ticket-'+claims})}}writes++;return {ok:true}};
 w.eval(readFileSync(new URL('../public/shared/device-session.js',import.meta.url),'utf8'));await w.JijinDeviceSession.start('b','p','token');assert.equal(claims,1);
 const address=await w.JijinDeviceSession.connectionUrl('wss://test/api/boards/b/realtime');assert.match(address,/sessionTicket=ticket-1/);assert.equal(claims,1);
 const socket=new w.EventTarget();socket.close=()=>{};w.JijinDeviceSession.attach(socket);
 const write=w.fetch('/api/boards/b/spreadsheet/state',{method:'POST'});await new Promise(setImmediate);assert.equal(writes,0);
 socket.dispatchEvent(new w.MessageEvent('message',{data:JSON.stringify({type:'device-session-ready'})}));await write;assert.equal(writes,1);await w.JijinDeviceSession.check();assert.equal(claims,1);
 socket.dispatchEvent(new w.Event('close'));await w.JijinDeviceSession.connectionUrl('wss://test/api/boards/b/realtime');assert.equal(claims,2,'only a reconnect triggers another admission');
});
