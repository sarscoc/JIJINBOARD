import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
test('a comment in another log tab navigates on the first request without waiting on a slide',()=>{
 const source=readFileSync('public/log/virtual-log.js','utf8'),start=source.indexOf('  jumpToMessage = function('),end=source.indexOf('\n  queueMicrotask(mountAllPanels)',start);
 const state={room:{messages:[{id:'target',tab:'B',time:'12:00'}],tabs:['A','B']},annotations:[],hiddenTabs:new Set(),activeTabIndex:0,carouselPosition:1,viewMode:'timeline',isSliding:true};let rendered=0,pulsed=0;
 const element={style:{setProperty(){}},querySelector:()=>null,classList:{remove(){}}},panel={querySelector:()=>element};
 const context={state,CSS:{escape:s=>s},document:{querySelector:()=>panel},metaFor:()=>null,markerColor:s=>s,pulseLogMarker:()=>pulsed++,renderLog(){rendered++;state.carouselPosition=2},goToTab(){throw Error('must not depend on unfinished slide')},localStorage:{setItem(){}}};
 vm.runInNewContext(source.slice(start,end),context);context.jumpToMessage('target');assert.equal(state.activeTabIndex,1);assert.equal(state.isSliding,false);assert.equal(rendered,1);assert.equal(pulsed,1);
});
