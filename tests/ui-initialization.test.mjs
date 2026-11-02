import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM,VirtualConsole,requestInterceptor} from 'jsdom';
import {serveAsset} from '../src/assets.js';

const root=new URL('../public',import.meta.url).pathname;
const text=file=>fs.readFileSync(root+'/'+file,'utf8');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function idb(w){
  const stores=new Map();
  const db={objectStoreNames:{contains:()=>true},close(){},transaction(name){
    const data=stores.get(name)||new Map();stores.set(name,data);
    const tx={objectStore(){const request=result=>{const r={result};w.setTimeout(()=>{r.onsuccess?.();tx.oncomplete?.()},0);return r};return {
      get:key=>request(data.get(key)),getAll:()=>request([...data.values()]),getAllKeys:()=>request([...data.keys()]),
      put(value,key){data.set(key??value.id,value);return request(key??value.id)},delete(key){data.delete(key);return request(undefined)}
    }}};return tx;
  }};
  w.indexedDB={open(){const r={result:db,addEventListener(){}};w.setTimeout(()=>r.onsuccess?.(),0);return r}};
}

function duplicateKeys(elements,key){
  const counts=new Map();for(const element of elements){const value=key(element);counts.set(value,(counts.get(value)||0)+1)}
  return [...counts].filter(([value,count])=>value&&count>1);
}

for(const tool of ['board','log','matrix','spreadsheet'])test(`${tool}: static and Worker delivery have one dependency list`,async()=>{
  const original=text(tool+'/index.html'),url=`http://127.0.0.1:8765/${tool}/?id=test&board=test&room=log`;
  const response=await serveAsset(new Request(url),{ASSETS:{fetch:async()=>new Response(original,{headers:{'content-type':'text/html'}})}});
  const delivered=await response.text(),raw=new JSDOM(original),served=new JSDOM(delivered);
  const dependencies=d=>[...d.window.document.querySelectorAll('script[src],link[rel=stylesheet]')].map(e=>e.getAttribute('src')||e.getAttribute('href'));
  assert.deepEqual(dependencies(served),dependencies(raw));
  const keys=dependencies(served).map(path=>new URL(path,url).pathname);
  assert.equal(new Set(keys).size,keys.length);
  assert.ok(!delivered.includes('sheet-blank-layout.js'));assert.ok(!delivered.includes('src="sheet-comments.js'));
  raw.window.close();served.window.close();
});

for(const tool of ['board','log','matrix','spreadsheet'])test(`${tool}: executing the complete page does not duplicate UI or controllers`,async t=>{
  const errors=[],vc=new VirtualConsole();vc.on('jsdomError',error=>errors.push(error.message));
  const dom=new JSDOM(text(tool+'/index.html'),{url:`http://127.0.0.1:8765/${tool}/?id=test&board=test&room=log`,runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,
    resources:{interceptors:[requestInterceptor(request=>{try{return new Response(fs.readFileSync(root+new URL(request.url).pathname),{headers:{'content-type':request.url.includes('.css')?'text/css':'application/javascript'}})}catch{return new Response('')}})]},
    beforeParse(w){
      w.Request=Request;w.Headers=Headers;w.localStorage.setItem('jijin.dataset.generation.v1','test');w.CSS={escape:String};w.structuredClone=structuredClone;w.TextEncoder=TextEncoder;idb(w);
      w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
      w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};w.scrollTo=()=>{};w.alert=()=>{};
      w.requestIdleCallback=fn=>w.setTimeout(fn,0);
      w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLElement.prototype.scrollTo=function(){};
      w.HTMLDialogElement.prototype.show=function(){this.open=true};w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
      class Socket{static OPEN=1;static CONNECTING=0;readyState=0;addEventListener(){}close(){}send(){}}w.WebSocket=Socket;
      w.localStorage.setItem('trpgMarkerProfile',JSON.stringify({id:'pl',plName:'PL',personas:[]}));
      w.fetch=async(input,options={})=>({ok:true,json:async()=>({generation:'test',id:'test',name:'test',logs:[],state:{},annotations:[],comments:[],templates:[],tabs:[],messages:[],participants:[],characters:[],images:[]})});
    }
  });t.after(()=>dom.window.close());
  const w=dom.window;
  for(let i=0;i<100&&w.document.readyState!=='complete';i++)await sleep(10);
  await sleep(250);
  if(tool==='board'){
    // jsdom does not download/decode images. Finish the explicit screenshot stage.
    const image=w.document.querySelector('#boardHomeImage');
    assert.ok(image.src.includes('/home-image'));
    assert.equal(w.document.querySelector('#boardProfileDialog').open,false);
    image.dispatchEvent(new w.Event('error'));
    await sleep(80);
  }
  if(tool==='matrix'){
    w.toggleDisplayPanel(true);
    const trigger=w.document.getElementById('iconShapeTrigger');trigger.click();
    const option=w.document.querySelector('#iconShapeMenu [role=option]:last-child');
    option.dispatchEvent(new w.Event('pointerdown',{bubbles:true}));option.click();
    assert.equal(w.document.getElementById('iconShape').value,'sharp');
    assert.equal(w.document.getElementById('settings').classList.contains('floating-closed'),false);
    trigger.click();trigger.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
    assert.equal(w.document.getElementById('iconShapeMenu').hidden,true);
    assert.equal(w.document.getElementById('settings').classList.contains('floating-closed'),false);
    w.eval("(()=>{const s=appState();s.display.iconShape='original';saveState(s);restoreDisplay()})()");
    assert.equal(trigger.textContent,'アイコン切らずに表示');
  }
  if(tool==='spreadsheet'){
    w.document.getElementById('sheetLayoutBtn').click();
    assert.equal(w.document.querySelectorAll('.sheet-layout-workspace').length,1);
    assert.equal(w.document.querySelectorAll('.sheet-layout-unplaced').length,1);
    assert.equal(w.document.querySelectorAll('.sheet-layout-command-area').length,1);
    const render=w.renderSheetLayoutEditor;
    w.eval(text('spreadsheet/sheet-layout-six-grid.js'));assert.equal(w.renderSheetLayoutEditor,render);
    w.renderSheetLayoutEditor();assert.equal(w.document.querySelectorAll('.sheet-layout-unplaced').length,1);
  }
  const d=w.document;
  if(tool==='board')assert.equal(d.querySelector('#boardProfileDialog').open,true,'first visit in a room must ask for PL registration');
  assert.deepEqual(duplicateKeys(d.querySelectorAll('script[src]'),e=>new URL(e.src).pathname),[]);
  assert.deepEqual(duplicateKeys(d.querySelectorAll('link[rel=stylesheet]'),e=>new URL(e.href).pathname),[]);
  assert.deepEqual(duplicateKeys(d.querySelectorAll('[id]'),e=>e.id),[]);
  if(tool==='log'){
    const master=w.JIJINPlayerMaster;assert.ok(master);w.eval(text('shared/player-master.js'));assert.equal(w.JIJINPlayerMaster,master);
    w.document.elementFromPoint=()=>null;
    w.eval("state.room={id:'log',tabs:['main','info'],messages:[{id:'a',tab:'main',time:'21:00',speaker:'PL',text:'short'},{id:'b',tab:'info',time:'21:01',speaker:'PC',text:'long '.repeat(200)}]};state.hiddenTabs=new Set();state.viewMode='timeline';state.activeTabIndex=0;state.carouselPosition=1;renderLog();");
    await sleep(60);
    assert.ok(w.JijinTimelineLayout);
    assert.equal(w.eval("(()=>{const panels=[...state.virtualPanels.values()];return panels.length>1&&panels.every(p=>p.heights===panels[0].heights)})()"),true);
    const timelineRows=w.document.querySelector('.log-page[data-track-index="1"]').querySelectorAll('.timeline-slot');
    assert.equal(timelineRows.length,2);assert.ok(timelineRows[1].classList.contains('empty-slot'));
    assert.ok(parseFloat(timelineRows[1].style.height)>110,'long messages in another tab need their full shared blank height');
  }
  assert.deepEqual(errors,[]);
});

test('MATRIX page filters accept the new comment addresses and still accept old targets',async t=>{
  const dom=new JSDOM('<div id="matrixIconComments"><div class="matrix-comment-head"><b id="matrixIconCommentCount"></b></div><section id="matrixIconCommentList"><div class="matrix-comment-thread"><article class="matrix-comment-card" data-comment-target="/boards/board/matrix/template/points/pc"></article></div><div class="matrix-comment-thread"><article class="matrix-comment-card" data-comment-target="other@@matrix-template@@pc"></article></div><div class="matrix-comment-thread"><article class="matrix-comment-card" data-comment-target="template@@matrix-template@@old"></article></div></section></div>',{url:'http://127.0.0.1:8765/matrix/',runScripts:'outside-only'});
  t.after(()=>dom.window.close());const w=dom.window;
  w.matrixBoardContext={boardId:'board'};w.currentTemplateId=()=> 'template';
  w.eval(text('shared/comment-target.js'));w.eval(text('matrix/matrix-icon-interactions.js'));
  w.filterMatrixCommentsToCurrentPage();
  assert.deepEqual([...w.document.querySelectorAll('.matrix-comment-thread')].map(e=>e.hidden),[false,true,false]);
  assert.equal(w.document.getElementById('matrixIconCommentCount').textContent,'2');
  w.currentTemplateId=()=> 'empty-template';w.filterMatrixCommentsToCurrentPage();
  assert.equal(w.document.getElementById('matrixIconCommentCount').textContent,'0');
  assert.equal(w.document.getElementById('matrixIconCommentList').textContent.includes('このシートの感想'),false);
  assert.equal(w.document.querySelector('.matrix-comment-head').title,'');
  const filter=w.filterMatrixCommentsToCurrentPage;w.eval(text('matrix/matrix-icon-interactions.js'));assert.equal(w.filterMatrixCommentsToCurrentPage,filter);
});

