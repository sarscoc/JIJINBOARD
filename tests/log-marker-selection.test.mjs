import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../public/log/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/log/index.html',import.meta.url),'utf8');

test('LOG selection is finalized locally, not on every selectionchange',()=>{
  assert.doesNotMatch(source,/addEventListener\(["']selectionchange["'],showSelection\)/);
  assert.match(source,/addEventListener\(["']pointerup["'],finishLogSelection\)/);
  assert.match(source,/if\(first<0\|\|last<first/);
});

test('double-clicking a LOG tab retains the PL-local visibility toggle',()=>{
  const handler=source.match(/document\.addEventListener\("dblclick",e=>\{[^\n]+\}\);/);
  assert.ok(handler,'expected LOG tab double-click handler');
  assert.match(handler[0],/toggleTabVisibility\(/);
  assert.doesNotMatch(handler[0],/goToTab\(/);
});

test('LOG marker rendering ignores missing or reversed endpoints',()=>{
  const start=source.indexOf('function markedText(message, anns) {');
  const end=source.indexOf('\nfunction markerColor(',start);
  assert.ok(start>=0&&end>start);
  const rendered=[];
  const context={
    state:{room:{messages:[{id:'a',text:'hello'},{id:'b',text:'world'}]},annotations:[],activeMarkerId:null},
    JijinLogFormat:{render:(text,segments)=>{rendered.push(segments);return text}},
    annotationMarkerColor:()=> '#abc',
    window:{JijinDesktop:false}
  };
  vm.runInNewContext(source.slice(start,end)+'\nthis.markedText=markedText;',context);
  const output=context.markedText(context.state.room.messages[0],[{id:'x',message_id:'missing',end_message_id:'b',start_offset:0,end_offset:4}]);
  assert.equal(output,'hello');
  assert.ok(rendered[0].every(segment=>!segment.winner));
});

test('LOG HTML loads the updated marker-selection code',()=>{
  assert.match(html,/app\.js\?v=20261115-phone-marker/);
});

test('cross-tab marker navigation uses local message metadata and reveals destination',()=>{
  const virtual=readFileSync(new URL('../public/log/virtual-log.js',import.meta.url),'utf8');
  const start=virtual.indexOf('  jumpToMessage = function(id, annotationId) {');
  const end=virtual.indexOf('\n  queueMicrotask(mountAllPanels)',start);
  assert.ok(start>=0&&end>start);
  const calls=[],stored=[],search={value:'unrelated'};
  const message={id:'target',tab:'B',time:'10:42',text:'remote marker'};
  const state={roomId:'room',room:{tabs:['A','B'],messages:[message]},activeTabIndex:0,hiddenTabs:new Set(['B']),isSliding:true,slideQueue:1,carouselPosition:1,annotations:[]};
  const element={style:{setProperty:(...args)=>calls.push(['style',...args])},querySelector:()=>null,classList:{remove:()=>{}}};
  const panel={querySelector:()=>element};
  const context={
    state,
    document:{getElementById:()=>search},
    localStorage:{setItem:(...args)=>stored.push(args)},
    renderLog:time=>{calls.push(['render',time]);state.carouselPosition=2},
    hydratePanel:position=>{calls.push(['hydrate',position]);return panel},
    metaFor:()=>({mode:'compact',items:[message]}),
    revealIndex:(p,index)=>calls.push(['reveal',index]),
    CSS:{escape:id=>id},
    markerColor:()=> '#ffe66b',
    pulseLogMarker:()=>calls.push(['pulse'])
  };
  vm.runInNewContext(virtual.slice(start,end),context);
  context.jumpToMessage('target','annotation');
  assert.equal(search.value,'');
  assert.equal(state.activeTabIndex,1);
  assert.equal(state.hiddenTabs.has('B'),false);
  assert.equal(state.isSliding,false);
  assert.deepEqual(calls.filter(call=>call[0]==='render'),[['render','10:42']]);
  assert.deepEqual(calls.filter(call=>call[0]==='reveal'),[['reveal',0]]);
  assert.equal(calls.some(call=>call[0]==='pulse'),true);
  assert.equal(stored.length,1);
  assert.equal(stored[0][0],'hiddenTabs:room');
});

test('cross-tab marker navigation requires no remote fetch and updates script cache',()=>{
  const virtual=readFileSync(new URL('../public/log/virtual-log.js',import.meta.url),'utf8');
  const start=virtual.indexOf('  jumpToMessage = function(id, annotationId) {');
  const end=virtual.indexOf('\n  queueMicrotask(mountAllPanels)',start);
  const body=virtual.slice(start,end);
  assert.match(body,/state\.room\?\.messages\.find/);
  assert.doesNotMatch(body,/fetch\(|\bapi\(/);
  assert.match(html,/virtual-log\.js\?v=20261115-local-tab-jump/);
});

test('a phone notification succeeds when its marker is shown and the comment card is offscreen',async()=>{
  const start=source.indexOf('window.jijinOpenActivity=');
  const end=source.indexOf('\nfunction jumpToComment',start);
  const context={
    window:{},
    state:{roomId:'log',room:{},annotations:[{id:'comment'}]},
    jumpToMessage:async (id,comment)=>{
      assert.equal(id,'message');
      assert.equal(comment,'comment');
      return true;
    },
    jumpToComment:()=>assert.fail('phone notification should not scroll a second pane')
  };
  vm.runInNewContext(source.slice(start,end),context);
  const row={id:'comment',target:{logId:'log',messageId:'message'}};
  assert.equal(await context.window.jijinOpenActivity(row),true);
  context.jumpToMessage=async()=>false;
  assert.equal(await context.window.jijinOpenActivity(row),'not-found');
});

test('phone tab changes render the destination directly',()=>{
  const start=source.indexOf('function showPhoneLogTab(');
  const end=source.indexOf('function switchLogPage(',start);
  const state={activeTabIndex:0};
  const rendered=[];
  const context={state,document:{documentElement:{dataset:{mobileWorkspace:'log'}}},
    matchMedia:()=>({matches:true}),renderLog:time=>rendered.push([state.activeTabIndex,time])};
  vm.runInNewContext(source.slice(start,end),context);
  assert.equal(context.showPhoneLogTab(2,'12:30'),true);
  assert.deepEqual(rendered,[[2,'12:30']]);
  context.matchMedia=()=>({matches:false});
  assert.equal(context.showPhoneLogTab(1,'12:31'),false);
  assert.equal(state.activeTabIndex,2);
});

test('phone marker jump centers the marker in its log pane without a second scroll',()=>{
  const start=source.indexOf('let markerNavigation=');
  const end=source.indexOf('\nfunction jumpToMessage(',start);
  const calls=[];
  const scroll={clientHeight:200,scrollTop:400,getBoundingClientRect:()=>({top:20}),scrollTo:options=>calls.push({...options})};
  const marker={getBoundingClientRect:()=>({top:170,height:20})};
  const element={closest:()=>scroll,querySelector:()=>marker,scrollIntoView:()=>assert.fail('must scroll only the log pane')};
  const context={state:{annotations:[{id:'comment'}]},CSS:{escape:id=>id},groupAnnotations:()=>({}),focusCommentChain:()=>{},
    document:{documentElement:{dataset:{mobileWorkspace:'log'}},querySelectorAll:()=>[],getElementById:()=>null},matchMedia:()=>({matches:true})};
  vm.runInNewContext(source.slice(start,end),context);
  context.pulseLogMarker(element,'comment');
  assert.deepEqual(calls,[{top:460,behavior:'instant'}]);
  assert.equal(context.state.activeMarkerId,'comment');
});
