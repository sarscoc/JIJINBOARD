import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

function fixture(t){
  const dom=new JSDOM('',{url:'https://test/',runScripts:'outside-only'});t.after(()=>dom.window.close());
  const sockets=[],w=dom.window;
  class Socket{static OPEN=1;static CONNECTING=0;readyState=0;listeners=new Map();sent=[];constructor(url){this.url=url;sockets.push(this)}addEventListener(n,f){this.listeners.set(n,f)}send(data){this.sent.push(JSON.parse(data))}close(){this.readyState=3;this.fire('close')}fire(n,data={}){if(n==='open')this.readyState=1;this.listeners.get(n)?.(data)}}
  w.WebSocket=Socket;
  for(const name of ['comment-target.js','comments.js'])w.eval(readFileSync(new URL('../public/shared/'+name,import.meta.url),'utf8'));
  return {w,sockets,core:w.JijinComments};
}
const tick=()=>new Promise(setImmediate);

test('notifications during an older GET are replayed and all callers await the fresh result',async t=>{
  const {core}=fixture(t);const reads=[],applied=[];
  const load=core.loader(()=>new Promise(resolve=>reads.push(resolve)),data=>applied.push(data));
  const a=load(),b=load();assert.equal(a,b);reads[0]('old');await tick();assert.deepEqual(applied,[]);
  assert.equal(reads.length,2);reads[1]('new');await Promise.all([a,b]);assert.deepEqual(applied,['new']);
});
test('a failed GET can retry; a failed write does not block later serialized edits',async t=>{
  const {core}=fixture(t);let tries=0;const load=core.loader(()=>{if(!tries++)throw Error('offline');return 'ok'},()=>{});
  await assert.rejects(load());await load();assert.equal(tries,2);
  const write=core.serialize(),order=[];
  const first=write('target',async()=>{order.push(1);throw Error('conflict')});
  const second=write('target',async()=>order.push(2));await assert.rejects(first);await second;assert.deepEqual(order,[1,2]);
});
test('all views catch up on reconnect, visibility return, and hidden-tab activation',async t=>{
  const {core,sockets,w}=fixture(t);let reads=0;
  const channel=core.live({board:'board',refresh:()=>{reads++}});channel.setActive(true);await tick();
  sockets[0].fire('open');await tick();assert.ok(reads>=2);
  const before=reads;sockets[0].fire('message',{data:JSON.stringify({type:'comment-change',action:'comment:create',data:{target:'/boards/board/sheets/main/cells/x'}})});await tick();assert.equal(reads,before+1);
  channel.setActive(false);channel.setActive(true);sockets[1].fire('open');await tick();assert.ok(reads>before+1);
  sockets[1].close();w.dispatchEvent(new w.Event('online'));assert.equal(sockets.length,3);
  sockets[2].fire('open');await tick();assert.equal(sockets[2].sent[0].type,'join');
  channel.setActive(false);
});
test('every view sends canonical targets through the same endpoint and bypasses caches',async t=>{
  const {core,w}=fixture(t),sent=[];
  w.fetch=async(url,options)=>{sent.push({url,options});return {ok:true,json:async()=>({comments:[]})}};
  const request=core.adapter('board',()=>assert.fail('unexpected legacy request'));
  for(const [url,body] of [
    ['/api/rooms/log/annotations',{messageId:'m',startOffset:0,endOffset:2}],
    ['/api/boards/board/matrix/log/comments',{targetId:'template@@matrix-template@@pc'}],
    ['/api/boards/board/spreadsheet/comments',{cellId:'cell'}]
  ])await request(url,{method:'POST',body:JSON.stringify(body)});
  assert.equal(sent.length,3);
  for(const {url,options} of sent){assert.ok(url.startsWith('/api/boards/board/comments?'));assert.ok(JSON.parse(options.body).target.startsWith('/boards/board/'));assert.equal(options.cache,'no-store');assert.equal(options.headers['x-realtime-client'],core.clientId)}
});

test('LOG uses the shared loader and catches up after its integrated tab returns',async t=>{
  const {w}=fixture(t);w.history.replaceState(null,'','/?board=board&room=log');
  w.state={roomId:'log',room:{messages:[]},annotations:[],annotationVersion:-1,profile:{id:'viewer'},realtime:null};
  let reads=0,rendered=0;
  w.api=async()=>assert.fail('LOG comments should use the common endpoint');
  w.fetch=async()=>{reads++;return {ok:true,json:async()=>({comments:[{id:'other-player',body:'remote',message_id:'m'}],version:2})}};
  w.refreshAnnotations=()=>{};w.connectRealtime=()=>{};
  w.renderComments=()=>rendered++;w.renderLog=()=>{};
  w.postComment=()=>{};w.deleteComment=()=>{};w.toggleLike=()=>{};
  w.eval(readFileSync(new URL('../public/log/comment-incremental-sync.js',import.meta.url),'utf8'));
  const active=value=>w.dispatchEvent(new w.MessageEvent('message',{origin:w.location.origin,data:{type:'jijinboard-log-active',active:value}}));
  active(false);await w.refreshAnnotations();assert.equal(reads,0);
  active(true);await tick();await tick();assert.ok(reads>=1);assert.ok(rendered>=1);assert.equal(w.state.annotations[0].id,'other-player');
  active(false);
});
