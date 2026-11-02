import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {JSDOM} from 'jsdom';
const source=file=>readFileSync(new URL('../public/'+file,import.meta.url),'utf8');
const tick=()=>new Promise(setImmediate);

for(const callerNoStore of [false,true])test(`browser cache respects no-store (${callerNoStore?'caller':'server'} directive)`,async t=>{
  const dom=new JSDOM('',{url:'http://127.0.0.1:8765/board/',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;
  w.Request=class extends Request{constructor(input,options){super(new URL(input,w.location.href),options)}};
  w.TextEncoder=TextEncoder;Object.defineProperty(w.crypto,'subtle',{value:webcrypto.subtle});
  let opens=0,puts=0,network=0,deletes=0;
  w.caches={async open(){opens++;return {match:async()=>new Response('old',{headers:{'cache-control':'no-store'}}),delete:async()=>{deletes++},put:async()=>{puts++}}}};
  w.fetch=async()=>{network++;return new Response('new',{headers:{'cache-control':'no-store'}})};
  w.eval(source('shared/browser-cache.js'));
  const result=await w.fetch('/api/boards/board',callerNoStore?{cache:'no-store'}:{});
  assert.equal(await result.text(),'new');assert.equal(network,1);assert.equal(puts,0);
  if(callerNoStore)assert.equal(opens,0);else assert.ok(deletes>=1);
});

for(const saved of ['empty','missing','invalid'])test(`saved ${saved} spreadsheet state does not resurrect old local data`,async t=>{
  const dom=new JSDOM('',{url:'http://127.0.0.1:8765/spreadsheet/?board=board',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;
  const old=[{id:'old-character',name:'old',local:true,sources:[]}];
  w.localStorage.setItem('charaHub.characters',JSON.stringify(old));w.localStorage.setItem('charaHub.sources','[]');w.localStorage.setItem('charaHub.layoutV1','{}');
  w.state={characters:old,sources:[],layout:{}};w.sheetDisplaySettings={isEditing:()=>false};w.requestAnimationFrame=fn=>w.setTimeout(fn,0);w.setMainView=()=>{};
  const writes=[];
  const remote=saved==='empty'?{'charaHub.characters':[],'charaHub.sources':[],'charaHub.layoutV1':{}}:saved==='missing'?null:undefined;
  w.fetch=async(path,options={})=>{if(options.method==='POST')writes.push(JSON.parse(options.body));return {ok:true,json:async()=>({state:remote})}};
  w.eval(source('spreadsheet/sheet-sync.js'));await tick();await tick();
  if(saved==='empty'){
    assert.equal(writes.length,0);assert.equal(w.state.characters.length,0);assert.deepEqual(JSON.parse(w.localStorage.getItem('charaHub.characters')),[]);
  }else if(saved==='missing'){
    assert.equal(writes.length,1);assert.equal(writes[0].state['charaHub.characters'][0].id,'old-character');
  }else assert.equal(writes.length,0);
});
