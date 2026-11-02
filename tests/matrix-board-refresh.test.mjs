import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../public/matrix/board-integration.js',import.meta.url),'utf8');
const tick=async()=>{for(let i=0;i<12;i++)await new Promise(setImmediate)};
function fixture(options={}){
  let state={items:{},display:{}},socket;const listeners=new Map(),events=[],requests=[];
  const saved={items:{pc:{placed:true,x:73,y:21}},display:{color:'template-color'}};
  class Socket{static OPEN=1;static CONNECTING=0;readyState=0;listeners=new Map();constructor(){socket=this}addEventListener(n,f){this.listeners.set(n,f)}close(){}send(){}}
  const context={URL,crypto,console,queueMicrotask,CustomEvent,dispatchEvent:event=>events.push(event),WebSocket:Socket,location:{href:options.url||'https://test/matrix/?board=board&room=log',origin:'https://test',protocol:'https:',host:'test'},
    localStorage:{getItem:()=>options.profile?JSON.stringify(options.profile):null},fetch:async(path,init={})=>{requests.push({path,...init});if(options.fetch){const response=await options.fetch(path,init);if(response)return response}return {ok:true,json:async()=>({state:{items:{},display:{color:'room-default'}}})}},
    parent:{postMessage(){}},requestIdleCallback(){},requestAnimationFrame:fn=>fn(),setTimeout,clearTimeout,
    document:{querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}},addEventListener:(name,fn)=>listeners.set(name,fn),
    mutate:fn=>fn(state),appState:()=>state,saveState:s=>{state=s},saveJSON:(key,s)=>{state=s},saveCurrentTemplateState:s=>Object.assign(saved,structuredClone(s)),STATE:'state',items:[],
    currentTemplateId:()=> 'tpl',templateStates:()=>({tpl:saved}),matrixTemplateSync:{isHydrated:()=>options.hydrated!==false},
    scheduleTemplateOverlaySync(){},renderLibrary(){},renderPlaced(){},restoreDisplay(){},restorePaneWidth(){},makeLocalItemState:()=>({})
  };
  context.window=context;vm.runInNewContext(source,context);
  return {context,events,requests,setActive(active){listeners.get("message")({origin:"https://test",data:{type:"jijinboard-matrix-active",active}})},state:()=>state,saved,refreshPoint(point){socket.listeners.get('message')({data:JSON.stringify({type:'refresh',action:'matrix-point',data:point})})}};
}

test('room refresh keeps the active template display and placement',async()=>{
  const f=fixture();await tick();assert.equal(f.state().display.color,'template-color');assert.equal(f.state().items.pc.x,73);
});

test('point updates for another template cannot change the current template',async()=>{
  const f=fixture();await tick();f.refreshPoint({templateId:'other',itemId:'pc',placed:true,x:1});assert.equal(f.state().items.pc.x,73);
});

test('remote token comments are applied to live and saved state',async()=>{
 const f=fixture();await tick();f.refreshPoint({templateId:'tpl',itemId:'pc',comment:'other player',commentPosition:'bottom'});
 assert.equal(f.state().items.pc.comment,'other player');assert.equal(f.saved.items.pc.comment,'other player');assert.equal(f.state().items.pc.x,73);
});
test('comments received while MATRIX is hidden refresh shared templates on return',async()=>{
 const f=fixture();await tick();f.setActive(false);
 f.refreshPoint({templateId:'tpl',itemId:'pc',comment:'other player'});
 assert.equal(f.events.filter(e=>e.type==='matrix-board-comments-changed').length,0);
 f.setActive(true);
 assert.ok(f.events.some(e=>e.type==='matrix-board-comments-changed'&&e.detail.action==='matrix-change'));
});


test('MATRIX opened without a selected log reads and saves using the board ID',async()=>{
 const f=fixture({url:'https://test/matrix/?board=board',profile:{id:'pl',plName:'PL'}});await tick();
 assert.ok(f.requests.some(r=>r.path==='/api/boards/board/matrix/board'));
 await f.context.matrixBoardContext.savePoint('pc',{placed:true,x:12,y:25});
 const patch=f.requests.find(r=>r.method==='PATCH');assert.equal(patch.path,'/api/boards/board/matrix/board/points/pc');assert.equal(JSON.parse(patch.body).templateId,'tpl');
});

test('rapid placements for the same token save in order',async()=>{
 let release,count=0;
 const f=fixture({profile:{id:'pl',plName:'PL'},fetch:async(path,init)=>{
  if(init.method!=='PATCH')return;
  count++;if(count===1)await new Promise(r=>release=r);
  return {ok:true,json:async()=>({ok:true})};
 }});await tick();
 const first=f.context.matrixBoardContext.savePoint('pc',{placed:true,x:1,y:2});
 const last=f.context.matrixBoardContext.savePoint('pc',{placed:true,x:40,y:50});await tick();assert.equal(count,1);
 release();await Promise.all([first,last]);assert.equal(count,2);
 const patches=f.requests.filter(r=>r.method==='PATCH');assert.equal(JSON.parse(patches[1].body).x,40);
});

test('first placement persists coordinates even when it also initializes comment display settings',async()=>{
 const f=fixture({profile:{id:'pl',plName:'PL'}});await tick();
 f.state().items.pc={placed:false,x:50,y:50,commentPosition:null,crop:{x:0,y:0,zoom:1}};
 f.context.mutate(s=>{s.items.pc.placed=true;s.items.pc.x=24;s.items.pc.y=37;s.items.pc.commentPosition='top'});await tick();
 const patch=f.requests.find(r=>r.method==='PATCH');assert.ok(patch,'mixed coordinate/metadata mutation must PATCH its point');
 const data=JSON.parse(patch.body);assert.equal(data.placed,true);assert.equal(data.x,24);assert.equal(data.y,37);
});

test('a delayed room settings response cannot erase template placements before template hydration finishes',async()=>{
 const f=fixture({hydrated:false});await tick();assert.equal(f.state().items.pc.placed,true);assert.equal(f.state().items.pc.x,73);
});
