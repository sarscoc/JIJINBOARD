import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
test('room and logs render even when registered PL synchronization never finishes',async t=>{
 const dom=new JSDOM(source('board/index.html'),{url:'https://test/board/?id=one',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;
 const data={id:'one',name:'Room',logs:[{roomId:'log',title:'Saved log'}]};
 w.JijinBoardReady={title:Promise.resolve({id:'one',name:'Room'}),image:Promise.resolve(true),profile:new Promise(()=>{}),boardData:Promise.resolve(data)};
 w.localStorage.setItem('trpgMarkerProfile',JSON.stringify({id:'p',plName:'PL'}));
 const code=source('board/board2.js'),end=code.indexOf('\ndocument.querySelectorAll("[data-tool]").forEach(button=>button.onclick=');assert.ok(end>0);
 w.eval(code.slice(0,end)+';window.boot=init;');await w.boot();
 assert.equal(w.document.getElementById('boardName').textContent,'Room');assert.equal(w.document.querySelectorAll('#logList [data-room]').length,1);
});
test('dataset verification retries a stalled connection and releases waiting reads',async t=>{
 const dom=new JSDOM('',{url:'https://test/board/?id=one',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;w.Request=Request;w.Headers=Headers;w.localStorage.setItem('jijin.dataset.generation.v1','current');
 const timeout=w.setTimeout.bind(w);w.setTimeout=(fn,ms)=>timeout(fn,ms===10000?5:ms);let calls=0;
 w.fetch=async(path,options)=>{calls++;if(calls===1)return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Error('aborted'))));return {ok:true,status:200,json:async()=>({generation:'current'})}};
 w.eval(source('shared/dataset-guard.js'));await w.JijinDataset.ready;assert.equal(calls,2);assert.equal(w.JijinDataset.blocked,false);
});
test('dataset verification times out a stalled response body as well as stalled headers',async t=>{
 const dom=new JSDOM('',{url:'https://test/board/?id=one',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;w.Request=Request;w.Headers=Headers;w.localStorage.setItem('jijin.dataset.generation.v1','current');
 const timeout=w.setTimeout.bind(w);w.setTimeout=(fn,ms)=>timeout(fn,ms===10000?5:ms);let calls=0;
 w.fetch=async()=>{calls++;return {ok:true,status:200,json:()=>calls===1?new Promise(()=>{}):Promise.resolve({generation:'current'})}};
 w.eval(source('shared/dataset-guard.js'));await w.JijinDataset.ready;assert.equal(calls,2);assert.equal(w.JijinDataset.blocked,false);
});
test('stalled cache cleanup cannot prevent generation isolation and startup recovery',async t=>{
 const dom=new JSDOM('',{url:'https://test/board/?id=one',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;w.Request=Request;w.Headers=Headers;w.localStorage.setItem('jijin.dataset.generation.v1','old');
 const timeout=w.setTimeout.bind(w);w.setTimeout=(fn,ms)=>timeout(fn,ms===1000?5:ms);w.caches={keys:()=>new Promise(()=>{})};w.fetch=async()=>({ok:true,status:200,json:async()=>({generation:'new'})});
 w.eval(source('shared/dataset-guard.js'));await assert.rejects(w.JijinDataset.ready,/読み直し/);assert.equal(w.localStorage.getItem('jijin.dataset.generation.v1'),'new');assert.equal(w.JijinDataset.blocked,true);
});

test('desktop failed startup refresh keeps the room shell and locally rendered logs',async t=>{
 const dom=new JSDOM(source('board/index.html'),{url:'https://test/board/?id=one',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;w.JijinDesktop={};
 const data={id:'one',name:'Room',logs:[{roomId:'log',title:'Saved log'}]};
 w.JijinBoardReady={title:Promise.resolve(data),image:Promise.resolve(true),boardData:Promise.resolve(data)};
 const code=source('board/board2.js'),end=code.indexOf('\ndocument.querySelectorAll("[data-tool]").forEach(button=>button.onclick=');
 w.eval(code.slice(0,end)+';window.boot=init;window.failRefresh=()=>{loadBoard=async()=>{throw Error("timeout")}};');await w.boot();const shell=w.document.getElementById('logList');
 w.failRefresh();await w.boot();assert.equal(w.document.getElementById('logList'),shell);assert.equal(shell.querySelectorAll('[data-room]').length,1);assert.ok(w.document.getElementById('boardConnectionIssue'));assert.equal(w.document.getElementById('boardStartupReload'),null);
});
