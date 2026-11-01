import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../public/matrix/board-integration.js',import.meta.url),'utf8');
const tick=async()=>{for(let i=0;i<12;i++)await new Promise(setImmediate)};
function fixture(){
  let state={items:{},display:{}},socket;const listeners=new Map(),events=[];
  const saved={items:{pc:{placed:true,x:73,y:21}},display:{color:'template-color'}};
  class Socket{static OPEN=1;static CONNECTING=0;readyState=0;listeners=new Map();constructor(){socket=this}addEventListener(n,f){this.listeners.set(n,f)}close(){}send(){}}
  const context={URL,crypto,console,queueMicrotask,CustomEvent,dispatchEvent:event=>events.push(event),WebSocket:Socket,location:{href:'https://test/matrix/?board=board&room=log',origin:'https://test',protocol:'https:',host:'test'},
    localStorage:{getItem:()=>null},fetch:async()=>({ok:true,json:async()=>({state:{items:{},display:{color:'room-default'}}})}),
    parent:{postMessage(){}},requestIdleCallback(){},requestAnimationFrame:fn=>fn(),setTimeout,clearTimeout,
    document:{querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}},addEventListener:(name,fn)=>listeners.set(name,fn),
    appState:()=>state,saveState:s=>{state=s},saveJSON:(key,s)=>{state=s},saveCurrentTemplateState:s=>Object.assign(saved,structuredClone(s)),STATE:'state',items:[],
    currentTemplateId:()=> 'tpl',templateStates:()=>({tpl:saved}),matrixTemplateSync:{isHydrated:()=>true},
    scheduleTemplateOverlaySync(){},renderLibrary(){},renderPlaced(){},restoreDisplay(){},restorePaneWidth(){},makeLocalItemState:()=>({})
  };
  context.window=context;vm.runInNewContext(source,context);
  return {context,events,setActive(active){listeners.get("message")({origin:"https://test",data:{type:"jijinboard-matrix-active",active}})},state:()=>state,saved,refreshPoint(point){socket.listeners.get('message')({data:JSON.stringify({type:'refresh',action:'matrix-point',data:point})})}};
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
