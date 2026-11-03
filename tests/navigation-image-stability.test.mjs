import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=p=>readFileSync(new URL('../public/'+p,import.meta.url),'utf8');
test('saved navigation paints immediately and unchanged refreshes preserve existing log buttons',t=>{
 const dom=new JSDOM(source('board/index.html'),{url:'https://test/board/?id=one',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;
 w.localStorage.setItem('jijin.dataset.generation.v1','g');w.localStorage.setItem('board:one:navigation',JSON.stringify({generation:'g',data:{id:'one',name:'Room',logs:[{roomId:'log',scenarioTitle:'Saved title'}]}}));
 const code=source('board/board2.js'),end=code.indexOf('\ndocument.querySelectorAll("[data-tool]").forEach(button=>button.onclick=');w.eval(code.slice(0,end)+';window.setBoard=data=>state.board=data;window.restoreNav=restoreNavigation;window.renderNav=renderLogs;');
 assert.equal(w.restoreNav(),true);const button=w.document.querySelector('#logList [data-room]');assert.equal(button.textContent,'Saved title');w.renderNav();assert.equal(w.document.querySelector('#logList [data-room]'),button);
 w.setBoard({id:'one',name:'Room',logs:[]});w.renderNav();assert.equal(w.document.querySelector('#logList [data-room]'),null);assert.equal(JSON.parse(w.localStorage.getItem('board:one:navigation')).data.logs.length,0);
});
test('cached presence keeps its order and avatar nodes when the same live roster arrives',async t=>{
 const dom=new JSDOM('<div id="presenceBar"></div>',{url:'https://test/board/?id=one',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;
 w.localStorage.setItem('jijin.dataset.generation.v1','g');w.localStorage.setItem('trpgMarkerProfile',JSON.stringify({id:'a',plName:'A'}));const people=[{author_id:'a',pl_name:'A',pl_icon:'/a.png'},{author_id:'b',pl_name:'B',pl_icon:'/b.png'}];w.localStorage.setItem('board:one:presence',JSON.stringify({generation:'g',people}));
 class Socket extends w.EventTarget{static OPEN=1;readyState=1;send(){}close(){}constructor(){super();w.socket=this}}w.WebSocket=Socket;w.eval('var boardId="one";function esc(value){return String(value)}');const code=source('board/board2.js'),start=code.indexOf('// Presence belongs'),end=code.indexOf('window.JIJINBOARD_LOG_TITLE',start);w.eval(code.slice(start,end));
 const avatar=w.document.querySelector('img');assert.ok(w.document.querySelector('[data-presence-cached]'));await new Promise(setImmediate);w.socket.dispatchEvent(new w.MessageEvent('message',{data:JSON.stringify({type:'presence',presence:[...people].reverse()})}));
 assert.equal(w.document.querySelector('img'),avatar);assert.equal(w.document.querySelector('[data-presence-cached]'),null);assert.deepEqual([...w.document.querySelectorAll('.presence-person')].map(node=>node.dataset.authorId),['a','b']);
});
test('image replacement retains the visible image until the new bytes finish decoding',async t=>{
 const dom=new JSDOM('<div data-image-host="part" data-image-char="pc"><div class="image-part-frame"><img src="blob:old"></div></div>',{runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window,d=w.document,pending=[];w.loadImageBlob=async()=>({});w.JijinSheetImageCache={url:()=> 'blob:new'};w.Image=function(){const img=d.createElement('img');pending.push(img);return img};
 const html=source('spreadsheet/index.html'),start=html.indexOf('async function hydrateImageParts('),end=html.indexOf('function bindImagePartControls(',start);w.eval(html.slice(start,end));const old=d.querySelector('img');await w.hydrateImageParts();assert.equal(d.querySelector('img'),old);pending[0].dispatchEvent(new w.Event('load'));assert.equal(d.querySelector('img').getAttribute('src'),'blob:new');
});
test('an in-progress upload remains visible across image invalidation without reading a missing remote copy',async t=>{
 const dom=new JSDOM('',{url:'https://test/spreadsheet/?board=one',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;let release,gets=0;
 w.saveImageBlob=async()=>{};w.loadImageBlob=async()=>null;w.deleteImageBlob=async()=>{};w.fetch=(url,options)=>options?.method==='PUT'?new Promise(resolve=>release=resolve):(gets++,Promise.resolve({ok:false,status:404}));
 w.eval(source('spreadsheet/sheet-image-sync.js'));await new Promise(setImmediate);const file=new w.Blob(['upload'],{type:'image/gif'}),saving=w.saveImageBlob('part','pc',file);await new Promise(setImmediate);
 w.dispatchEvent(new w.CustomEvent('jijinboard-spreadsheet-remote-change',{detail:{action:'spreadsheet-image'}}));assert.equal(await w.loadImageBlob('part','pc'),file);assert.equal(gets,0);release({ok:true});await saving;assert.equal(await w.loadImageBlob('part','pc'),file);
});
