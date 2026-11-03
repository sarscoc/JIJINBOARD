import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';

test('presence excludes unregistered and legacy visitor connections, without hiding a real PL named ゲスト',()=>{
 const code=readFileSync(new URL('../realtime-worker/src/index.js',import.meta.url),'utf8').replace("import {deviceSession} from '../../src/device-session.js';",'').replace("import { DurableObject } from 'cloudflare:workers';",'class DurableObject{constructor(ctx){this.ctx=ctx}}').replace('export class RoomHub','class RoomHub').replace('export default','const worker=');
 const sandbox={Response,console};vm.runInNewContext(code+';globalThis.Hub=RoomHub',sandbox);
 const socket=p=>({deserializeAttachment:()=>({...p,last_seen:new Date().toISOString()})});
 const hub=new sandbox.Hub({getWebSockets:()=>[
  socket({author_id:'visitor:old',pl_name:'ゲスト'}),socket({author_id:'blank',pl_name:'  '}),socket({author_id:'real',pl_name:'sars'}),socket({author_id:'named',pl_name:'ゲスト'})
 ]});
 hub.httpPresence.set('old-http',{author_id:'visitor:http',pl_name:'ゲスト',seen_at:Date.now()});
 assert.deepEqual(Array.from(hub.participants(),p=>p.author_id),['real','named']);
});

test('board never publishes a placeholder guest and starts publishing after PL registration',async t=>{
 const dom=new JSDOM('<div id="presenceBar"></div><dialog id="boardProfileDialog"></dialog>',{url:'https://test/board/?id=one',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window,sent=[];
 class Socket extends w.EventTarget{static OPEN=1;readyState=1;send(value){sent.push(JSON.parse(value))}close(){}constructor(){super();w.socket=this}}
 w.WebSocket=Socket;w.eval('var boardId="one";function esc(value){return String(value)}');
 const code=readFileSync(new URL('../public/board/board2.js',import.meta.url),'utf8'),start=code.indexOf('// Presence belongs'),end=code.indexOf('window.JIJINBOARD_LOG_TITLE',start);
 w.eval(code.slice(start,end));await Promise.resolve();
 w.socket.dispatchEvent(new w.Event('open'));assert.deepEqual(sent,[]);
 w.localStorage.setItem('trpgMarkerProfile',JSON.stringify({id:'pl',plName:'sars'}));w.document.querySelector('dialog').dispatchEvent(new w.Event('close'));
 assert.equal(sent.length,1);assert.equal(sent[0].plName,'sars');assert.equal(sent[0].authorId,'pl');
 w.socket.dispatchEvent(new w.MessageEvent('message',{data:JSON.stringify({type:'presence',presence:[{author_id:'visitor:old',pl_name:'ゲスト'},{author_id:'pl',pl_name:'sars'}]})}));
 assert.equal(w.document.querySelector('#presenceBar').textContent,'ssars');
});
