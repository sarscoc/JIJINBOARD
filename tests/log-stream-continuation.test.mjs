import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const code=readFileSync(new URL('../public/log/log-room-cache-preload.js',import.meta.url),'utf8');
const tick=async()=>{for(let i=0;i<35;i++)await new Promise(setImmediate)};
async function fixture(t,{fail=false}={}){
 const dom=new JSDOM('<select id="viewMode"><option value="compact">通常</option><option value="timeline">時間軸</option></select><input id="searchInput"><div class="log-page" data-track-index="1" data-real-index="0"><div class="page-scroll"></div></div>',{url:'https://test/log/?room=log',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;w.Request=Request;w.Response=Response;w.requestAnimationFrame=fn=>w.setTimeout(fn,0);
 const requests=[];let failure=fail;
 w.state={roomId:'log',room:null,carouselPosition:1,activeTabIndex:0,viewMode:'compact'};w.currentReadingTime=()=>'';w.renderLog=()=>{};
 w.fetch=async path=>{
  const u=new URL(path,'https://test');requests.push(u.pathname+u.search);
  if(u.pathname.endsWith('/meta'))return new Response(JSON.stringify({id:'log',tabs:['メイン','情報'],tabStreams:[{tabName:'メイン',chunkCount:3},{tabName:'情報',chunkCount:1}]}));
  const index=Number(u.pathname.split('/').at(-1)),tab=u.searchParams.get('tab');
  if(failure&&index===2)return new Response('{}',{status:503});
  return new Response(JSON.stringify({messages:[{id:tab+index,tab,sourceIndex:index,text:'text'}]}));
 };
 w.eval(code);const response=await w.fetch('/api/rooms/log');w.state.room=await response.json();w.dispatchEvent(new w.Event('DOMContentLoaded'));w.renderLog();await tick();
 return {w,requests,recover(){failure=false}};
}
test('active log tab reaches its final chunk without another scroll or an image load event',async t=>{
 const {w}=await fixture(t);assert.equal(w.state.room.messages.length,3);assert.deepEqual([...w.state.room.stream.loadedByTab['メイン']],[0,1,2]);
});
test('failed continuation presents a retry action and continues to the end when retried',async t=>{
 const f=await fixture(t,{fail:true}),w=f.w;assert.equal(w.state.room.messages.length,2);const button=w.document.querySelector('.log-stream-retry');assert.ok(button);f.recover();button.click();await tick();assert.equal(w.state.room.messages.length,3);assert.equal(w.document.querySelector('.log-stream-retry'),null);
});
test('timeline mode loads other tabs so the shared timeline contains every saved message',async t=>{
 const {w}=await fixture(t);w.state.viewMode='timeline';w.document.getElementById('viewMode').dispatchEvent(new w.Event('change'));await tick();assert.equal(w.state.room.messages.length,4);assert.deepEqual([...w.state.room.stream.loadedByTab['情報']],[0]);
});
