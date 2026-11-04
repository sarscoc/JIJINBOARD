import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {parse} from 'css-tree';
const source=name=>readFileSync(new URL('../public/board/'+name,import.meta.url),'utf8');
const tick=()=>new Promise(setImmediate);
function fixture(t,tool='log',mobile=true){
  const dom=new JSDOM(`<iframe src="https://test/${tool}/?embedded=1&board=one"></iframe>`,{url:'https://test/board/?id=one',runScripts:'outside-only'});
  t.after(()=>dom.window.close());
  const w=dom.window.document.querySelector('iframe').contentWindow,d=w.document;
  const panel=tool==='matrix'?'matrixIconComments':'commentsPane';
  d.open();d.write(`<body><main><section id="roomView"><aside class="room-tools"><div class="filters"></div></aside><div id="logPane"><p class="log-message" data-message="m1"><span class="message-text">Test passage</span></p></div></section></main><div class="app"><div class="placed" data-id="pc1"></div></div><aside id="${panel}"><div class="comments-head"></div><section class="comments-list"><div class="comment-thread"><div class="comment-card" data-target="m1"></div></div><div class="comment-thread"><div class="comment-card" data-target="m2"></div></div></section></aside><dialog id="commentDialog"><form><textarea></textarea></form></dialog></body>`);d.close();
  const callbacks=[];const mq={matches:mobile,addEventListener(type,fn){callbacks.push(fn)}};w.matchMedia=()=>mq;
  w.state={mainTab:'main',room:{messages:[{id:'m1',tab:'main'},{id:'m2',tab:'other'}]}};
  let holds=[];const realTimeout=w.setTimeout.bind(w),realClear=w.clearTimeout.bind(w);
  w.setTimeout=(fn,ms)=>{if(ms===500){const token={fn};holds.push(token);return token}return realTimeout(fn,ms)};
  w.clearTimeout=id=>{if(typeof id==='object')holds=holds.filter(x=>x!==id);else realClear(id)};
  w.PointerEvent=w.MouseEvent;
  const pointer=(el,type,x=50,y=50)=>el.dispatchEvent(new w.MouseEvent(type,{bubbles:true,clientX:x,clientY:y,button:0}));
  w.eval(source('mobile-workspace.js'));
  return {w,d,mq,pointer,fireHold(){const pending=holds;holds=[];pending.forEach(x=>x.fn())},desktop(){mq.matches=false;callbacks.forEach(fn=>fn())}};
}
test('phone log comments stay together across tabs and remote renders, with no count or filter',async t=>{
  const f=fixture(t),rows=f.d.querySelectorAll('.comment-thread');
  assert.equal(rows[0].hidden,false);assert.equal(rows[1].hidden,false);
  assert.equal(f.d.querySelector('.phone-dock-head select'),null);
  f.w.state.mainTab='other';f.d.dispatchEvent(new f.w.Event('click'));
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(rows[0].hidden,false);assert.equal(rows[1].hidden,false);
  const row=rows[1].cloneNode(true);f.d.querySelector('.comments-list').append(row);await tick();
  assert.equal(row.hidden,false);
  assert.equal(f.d.querySelector('.phone-dock-grip span').textContent,'コメント');
  f.desktop();await tick();assert.equal(rows[1].hidden,false);
});
test('a stationary long press opens the original log composer and retains its selection',t=>{
  const f=fixture(t);let opens=0;
  f.d.querySelector('.message-text').innerHTML='First <b>formatted</b> sentence.<br>Second sentence.';
  f.w.selectionInfo=()=>({messageId:'m1',quote:f.w.getSelection().toString()});f.w.openCommentDialog=()=>opens++;
  f.pointer(f.d.querySelector('.log-message'),'pointerdown');f.fireHold();
  assert.equal(opens,1);assert.equal(f.w.state.selection.messageId,'m1');
  assert.equal(f.w.state.selection.quote,'First formatted sentence.Second sentence.');
  let native=0;f.d.addEventListener('touchend',()=>native++);
  f.d.querySelector('.message-text').dispatchEvent(new f.w.Event('touchend',{bubbles:true}));assert.equal(native,0);
  f.desktop();f.d.querySelector('.message-text').dispatchEvent(new f.w.Event('touchend',{bubbles:true}));assert.equal(native,1);
  assert.equal(f.d.querySelector('.phone-dock-head select'),null);
});
test('scroll movement and pointer cancellation never open a composer',t=>{
  const f=fixture(t);let opens=0;f.w.openCommentDialog=()=>opens++;
  const el=f.d.querySelector('.log-message');f.pointer(el,'pointerdown');f.pointer(el,'pointermove',50,85);f.fireHold();assert.equal(opens,0);
  f.pointer(el,'pointerdown');f.pointer(el,'pointercancel');f.fireHold();assert.equal(opens,0);
});
test('matrix long press cancels the legacy gesture and opens the shared composer once',t=>{
  const f=fixture(t,'matrix');let cancels=0,opens=0;
  const el=f.d.querySelector('.placed');el.addEventListener('pointercancel',()=>cancels++);f.w.openMatrixIconComment=id=>{assert.equal(id,'pc1');opens++};
  f.pointer(el,'pointerdown');f.fireHold();assert.equal(cancels,1);assert.equal(opens,1);
});
test('the comment handle follows a drag and snaps through all four sizes',t=>{
  const f=fixture(t),grip=f.d.querySelector('.phone-dock-grip'),root=f.d.documentElement;
  assert.equal(root.dataset.phoneDock,'1');
  const drag=(from,to)=>{f.pointer(grip,'pointerdown',50,from);f.pointer(grip,'pointermove',50,to);f.pointer(grip,'pointerup',50,to)};
  f.pointer(grip,'pointerdown',50,650);f.pointer(grip,'pointermove',50,450);
  assert.equal(root.style.getPropertyValue('--phone-dock-size'),'340px');
  f.pointer(grip,'pointerup',50,450);assert.equal(root.dataset.phoneDock,'2');
  drag(400,0);assert.equal(root.dataset.phoneDock,'3');assert.equal(grip.getAttribute('aria-valuetext'),'全面');
  drag(0,400);assert.equal(root.dataset.phoneDock,'2');
  drag(400,650);assert.equal(root.dataset.phoneDock,'1');
  drag(650,780);assert.equal(root.dataset.phoneDock,'0');assert.equal(grip.getAttribute('aria-expanded'),'false');
  assert.equal(f.d.querySelector('.comments-list').inert,true);
  drag(760,650);assert.equal(root.dataset.phoneDock,'1');assert.equal(f.d.querySelector('.comments-list').inert,false);
});
test('cancelled dock gestures restore the settled size and keyboard controls cover every size',t=>{
  const f=fixture(t),grip=f.d.querySelector('.phone-dock-grip'),root=f.d.documentElement;
  f.pointer(grip,'pointerdown',50,600);f.pointer(grip,'pointermove',50,100);f.pointer(grip,'pointercancel',50,100);
  assert.equal(root.dataset.phoneDock,'1');
  for(const [key,level] of [['End','3'],['ArrowDown','2'],['Home','0'],['ArrowUp','1']]){
    grip.dispatchEvent(new f.w.KeyboardEvent('keydown',{key,bubbles:true}));assert.equal(root.dataset.phoneDock,level);
  }
  f.desktop();assert.equal(root.style.getPropertyValue('--phone-dock-size'),'');assert.equal(f.d.querySelector('.comments-list').inert,false);
});
test('mobile send submits the existing form, preserving its save controller',async t=>{
  const f=fixture(t),dialog=f.d.getElementById('commentDialog');let submits=0;
  dialog.querySelector('form').addEventListener('submit',event=>{event.preventDefault();submits++});
  dialog.setAttribute('open','');await tick();
  assert.equal(f.d.documentElement.classList.contains('phone-composing'),true);
  dialog.querySelector('.phone-composer-actions button:last-child').click();assert.equal(submits,1);
  dialog.removeAttribute('open');await tick();assert.equal(f.d.documentElement.classList.contains('phone-composing'),false);
});
test('mobile styles parse and remain bounded to the phone breakpoint',()=>{
  for(const file of ['mobile.css','mobile-workspace.css']){
    assert.doesNotThrow(()=>parse(source(file)));
    assert.match(source(file),/@media\(max-width:760px\)/);
  }
});
function shell(t){
  const dom=new JSDOM(source('index.html'),{url:'https://test/board/?id=one',runScripts:'outside-only'});t.after(()=>dom.window.close());
  const w=dom.window,d=w.document,mq={matches:true,addEventListener(){}};
  w.matchMedia=()=>mq;
  const menu=d.getElementById('mobileMenu');menu.showModal=()=>menu.setAttribute('open','');menu.close=()=>menu.removeAttribute('open');
  const frame=d.getElementById('logFrame');frame.classList.remove('hidden');
  w.eval(source('mobile.js'));return {w,d,menu,frame,mq};
}
test('the bottom menu opens the existing PL/PC editor and isolates the log drawer',t=>{
  const f=shell(t);let opens=0;
  const settings=f.d.createElement('button');settings.id='boardSettingsButton';settings.onclick=()=>opens++;f.d.body.append(settings);
  f.d.getElementById('mobileMenuButton').click();assert.equal(f.menu.open,true);
  f.d.getElementById('mobileMenuPeople').click();assert.equal(f.menu.open,false);assert.equal(opens,1);
  f.d.getElementById('mobileMenuLogs').click();assert.equal(f.d.body.classList.contains('mobile-logs-open'),true);assert.equal(f.d.querySelector('.tool-stage').inert,true);
  assert.equal(f.d.getElementById('mobileLogsBackdrop').parentElement,f.d.getElementById('logSidebar').parentElement);
  f.d.getElementById('mobileLogsBackdrop').click();assert.equal(f.d.body.classList.contains('mobile-logs-open'),false);assert.equal(f.d.querySelector('.tool-stage').inert,false);
});
test('only the active same-origin frame can open the mobile menu',t=>{
  const f=shell(t);
  const send=(origin,source)=>f.w.dispatchEvent(new f.w.MessageEvent('message',{origin,source,data:{type:'jijin-phone-menu'}}));
  send('https://untrusted.test',f.frame.contentWindow);assert.equal(f.menu.open,false);
  send(f.w.location.origin,f.d.getElementById('matrixFrame').contentWindow);assert.equal(f.menu.open,false);
  send(f.w.location.origin,f.frame.contentWindow);assert.equal(f.menu.open,true);
});
test('phone long press blocks the legacy context menu editor without changing desktop behavior',t=>{
  const f=fixture(t,'matrix');let legacyOpens=0;
  f.d.addEventListener('contextmenu',()=>legacyOpens++);
  const el=f.d.querySelector('.placed');
  el.dispatchEvent(new f.w.MouseEvent('contextmenu',{bubbles:true,cancelable:true}));assert.equal(legacyOpens,0);
  f.desktop();el.dispatchEvent(new f.w.MouseEvent('contextmenu',{bubbles:true,cancelable:true}));assert.equal(legacyOpens,1);
});

test('desktop comment controls are hidden before the phone stylesheet loads',t=>{
 const f=fixture(t,'log',false);
 assert.equal(f.d.querySelector('.phone-dock-head').hidden,true);
 assert.equal(f.d.querySelector('.phone-composer-actions').hidden,true);
 assert.equal(f.d.querySelectorAll('.comment-thread[hidden]').length,0);
});
test('leaving the phone breakpoint hides the injected dock and composer controls',t=>{
 const f=fixture(t);
 assert.equal(f.d.querySelector('.phone-dock-head').hidden,false);
 f.desktop();
 assert.equal(f.d.querySelector('.phone-dock-head').hidden,true);
 assert.equal(f.d.querySelector('.phone-composer-actions').hidden,true);
});

test('MATRIX horizontal swipes work over an icon and leave the comments pane alone',t=>{
 const f=fixture(t,'matrix'),views=[];f.w.setMobileMainView=view=>views.push(view);
 let cancelled=0;const icon=f.d.querySelector('.placed');icon.addEventListener('pointercancel',()=>cancelled++);
 f.pointer(icon,'pointerdown',80,100);f.pointer(icon,'pointermove',180,105);f.pointer(icon,'pointerup',180,105);
 assert.deepEqual(views,['icons']);assert.equal(cancelled,1);
 const comments=f.d.getElementById('matrixIconComments');f.pointer(comments,'pointerdown',80,300);f.pointer(comments,'pointermove',180,300);f.pointer(comments,'pointerup',180,300);
 assert.deepEqual(views,['icons']);
});
test('a template selection switches to its content after the existing loader announces success',t=>{
 const dom=new JSDOM('<iframe src="https://test/matrix/?embedded=1"></iframe>',{url:'https://test/board/',runScripts:'outside-only'});t.after(()=>dom.window.close());
 const w=dom.window.document.querySelector('iframe').contentWindow,d=w.document;
 d.open();d.write('<body><div id="templateTabs"><button class="template-tab">one</button></div><aside id="matrixIconComments"><section></section></aside></body>');d.close();
 w.matchMedia=()=>({matches:true,addEventListener(){}});w.requestAnimationFrame=fn=>fn();
 const views=[];w.setMobileMainView=view=>views.push(view);w.eval(source('mobile-workspace.js'));views.length=0;
 d.querySelector('.template-tab').onclick=event=>event.stopPropagation();
 d.querySelector('.template-tab').click();assert.deepEqual(views,[]);
 w.dispatchEvent(new w.CustomEvent('matrix-template-selected',{detail:{templateId:'one'}}));assert.deepEqual(views,['stage']);
});
test('swiping the initial screenshot opens the log list without navigating or saving',t=>{
 const f=shell(t),home=f.d.getElementById('welcome');
 const pointer=(type,x)=>home.dispatchEvent(new f.w.MouseEvent(type,{bubbles:true,clientX:x,clientY:100}));
 pointer('pointerdown',240);pointer('pointerup',100);
 assert.equal(f.d.body.classList.contains('mobile-logs-open'),true);
 assert.equal(f.d.querySelector('.tool-stage').inert,true);
});
test('horizontal page gestures never start the placement writer; vertical drags reuse it once',t=>{
 const f=fixture(t,'matrix'),icon=f.d.querySelector('.placed');let starts=0,legacyDowns=0;
 f.w.startPlacedDrag=()=>starts++;icon.addEventListener('pointerdown',()=>legacyDowns++);
 f.pointer(icon,'pointerdown',40,100);f.pointer(icon,'pointermove',48,101);f.pointer(icon,'pointermove',130,102);f.pointer(icon,'pointerup',130,102);
 assert.equal(starts,0);assert.equal(legacyDowns,0);
 f.pointer(icon,'pointerdown',40,100);f.pointer(icon,'pointermove',41,130);f.pointer(icon,'pointermove',41,150);
 assert.equal(starts,1);
});
test('Sheets initializes its phone controls when the comments panel arrives after the page',async t=>{
 const dom=new JSDOM('<iframe src="https://test/spreadsheet/?embedded=1&board=one"></iframe>',{url:'https://test/board/',runScripts:'outside-only'});t.after(()=>dom.window.close());
 const w=dom.window.document.querySelector('iframe').contentWindow,d=w.document;
 d.open();d.write('<body><div class="app"><section id="tablePanel"></section></div></body>');d.close();
 w.matchMedia=()=>({matches:true,addEventListener(){}});w.eval(source('mobile-workspace.js'));
 assert.equal(d.querySelector('.phone-dock-head'),null);
 const panel=d.createElement('aside');panel.id='sheetComments';panel.innerHTML='<section class="comments-list"></section>';d.body.append(panel);await tick();
 assert.equal(d.querySelectorAll('.phone-dock-head').length,1);
 d.body.append(d.createElement('p'));await tick();assert.equal(d.querySelectorAll('.phone-dock-head').length,1);
});
test('the compact comment heading follows the room theme as it changes',async t=>{
 const f=fixture(t),parentRoot=f.w.parent.document.documentElement;
 parentRoot.style.setProperty('--jijin-pre-color1','#e76bc0');await tick();
 assert.equal(f.d.documentElement.style.getPropertyValue('--phone-theme'),'#e76bc0');
 parentRoot.style.setProperty('--jijin-pre-color1','#171a20');await tick();
 assert.equal(f.d.documentElement.style.getPropertyValue('--phone-theme'),'#171a20');
});

function zoomFixture(t){
 const dom=new JSDOM('<iframe src="https://test/matrix/?embedded=1"></iframe>',{url:'https://test/board/',runScripts:'outside-only'});t.after(()=>dom.window.close());
 const w=dom.window.document.querySelector('iframe').contentWindow,d=w.document;
 d.open();d.write('<body><div class="app"><div id="stage"><div id="canvas"><div class="placed" data-id="pc1"></div></div></div></div><aside id="matrixIconComments"><section></section></aside></body>');d.close();
 const viewport=d.getElementById('stage');Object.defineProperty(viewport,'clientWidth',{value:300});Object.defineProperty(viewport,'clientHeight',{value:400});
 w.matchMedia=()=>({matches:true,addEventListener(){}});w.PointerEvent=w.MouseEvent;
 const views=[];let starts=0,saves=0;w.setMobileMainView=view=>views.push(view);w.startPlacedDrag=()=>starts++;w.mutate=()=>saves++;w.saveState=()=>saves++;
 w.eval(source('mobile-workspace.js'));views.length=0;
 const pointer=(target,type,id,x,y)=>{const event=new w.MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y});Object.defineProperties(event,{pointerId:{value:id},pointerType:{value:'touch'}});target.dispatchEvent(event)};
 return {w,d,canvas:d.getElementById('canvas'),icon:d.querySelector('.placed'),pointer,views,counts:()=>({starts,saves})};
}
test('MATRIX pinch scales the view around the fingers, clamps it, and never starts a placement save',t=>{
 const f=zoomFixture(t),c=f.canvas;
 f.pointer(f.icon,'pointerdown',1,100,150);f.pointer(c,'pointerdown',2,200,150);
 f.pointer(c,'pointermove',2,300,150);
 assert.equal(c.style.getPropertyValue('--phone-canvas-width'),'600px');assert.equal(c.style.getPropertyValue('--phone-canvas-x'),'-100px');
 f.pointer(c,'pointermove',2,800,150);assert.equal(c.style.getPropertyValue('--phone-canvas-width'),'1200px');
 f.pointer(c,'pointerup',2,800,150);f.pointer(c,'pointermove',1,250,350);f.pointer(c,'pointerup',1,250,350);
 assert.deepEqual(f.counts(),{starts:0,saves:0});assert.deepEqual(f.views,[]);
 f.w.dispatchEvent(new f.w.Event('matrix-template-selected'));assert.equal(c.style.getPropertyValue('--phone-canvas-width'),'');assert.equal(c.style.getPropertyValue('--phone-canvas-x'),'');
});
test('a zoomed MATRIX pans on empty canvas and a cancelled pinch leaves no stuck page gesture',t=>{
 const f=zoomFixture(t),c=f.canvas;
 f.pointer(c,'pointerdown',1,100,150);f.pointer(c,'pointerdown',2,200,150);f.pointer(c,'pointermove',2,300,150);
 f.pointer(c,'pointercancel',2,300,150);f.pointer(c,'pointerup',1,100,150);
 f.pointer(c,'pointerdown',3,100,150);f.pointer(c,'pointermove',3,50,100);f.pointer(c,'pointerup',3,50,100);
 assert.equal(c.style.getPropertyValue('--phone-canvas-x'),'-150px');assert.equal(c.style.getPropertyValue('--phone-canvas-y'),'-200px');
 assert.deepEqual(f.counts(),{starts:0,saves:0});assert.deepEqual(f.views,[]);
});

test('typing and unrelated comment-list renders do not remeasure an unchanged first card',async t=>{
 const f=fixture(t,'matrix'),list=f.d.querySelector('.comments-list'),first=list.firstElementChild;
 let measures=0;first.getBoundingClientRect=()=>{measures++;return {height:90}};
 const typing=f.d.createElement('div');typing.className='matrix-typing-stack';list.prepend(typing);await tick();
 typing.textContent='入力中';await tick();assert.equal(measures,0);
 const replacement=first.cloneNode(true);replacement.getBoundingClientRect=()=>({height:90});first.replaceWith(replacement);await tick();
 assert.equal(f.d.documentElement.style.getPropertyValue('--phone-dock-size'),'134px');
});

function sheetsZoomFixture(t){
 const dom=new JSDOM('<iframe src="https://test/spreadsheet/?embedded=1&board=one"></iframe>',{url:'https://test/board/',runScripts:'outside-only'});t.after(()=>dom.window.close());
 const w=dom.window.document.querySelector('iframe').contentWindow,d=w.document;
 d.open();d.write('<body><div class="app"><div id="sheetWrap"><div id="dataTableRoot"><div data-sheet-cell="c1">value</div></div></div><div id="fullCharacterPages"><article class="full-character-page"><textarea>draft</textarea></article></div></div><aside id="sheetComments"><section><div class="comment-card">comment</div></section></aside></body>');d.close();
 const callbacks=[],mq={matches:true,addEventListener(type,fn){callbacks.push(fn)}};w.matchMedia=()=>mq;
 w.localStorage.setItem('sheetLocalZoom','1.2');w.eval(source('mobile-workspace.js'));
 const touch=(target,type,points)=>{const event=new w.Event(type,{bubbles:true,cancelable:true});Object.defineProperty(event,'touches',{value:points.map(([x,y])=>({clientX:x,clientY:y,target}))});target.dispatchEvent(event);return event};
 return {w,d,touch,desktop(){mq.matches=false;callbacks.forEach(fn=>fn())}};
}
test('Sheets pinch zooms tables and character pages around the fingers without saving content',t=>{
 const f=sheetsZoomFixture(t),root=f.d.documentElement,table=f.d.getElementById('sheetWrap'),pages=f.d.getElementById('fullCharacterPages');
 table.scrollLeft=40;table.scrollTop=60;
 f.touch(table,'touchstart',[[100,100],[200,100]]);f.touch(table,'touchmove',[[50,100],[250,100]]);
 assert.equal(root.style.getPropertyValue('--phone-sheet-zoom'),'2');assert.equal(table.scrollLeft,230);assert.equal(table.scrollTop,220);
 f.touch(table,'touchend',[]);
 f.touch(pages,'touchstart',[[100,100],[300,100]]);f.touch(pages,'touchmove',[[150,100],[250,100]]);f.touch(pages,'touchend',[]);
 assert.equal(root.style.getPropertyValue('--phone-sheet-zoom'),'1');assert.equal(f.d.querySelector('textarea').value,'draft');
 assert.equal(f.w.localStorage.getItem('sheetLocalZoom'),'1.2');
});
test('Sheets pinch clamps both directions, ignores comments, and restores desktop presentation',t=>{
 const f=sheetsZoomFixture(t),root=f.d.documentElement,table=f.d.getElementById('sheetWrap'),comment=f.d.querySelector('#sheetComments .comment-card');
 f.touch(table,'touchstart',[[100,100],[200,100]]);f.touch(table,'touchmove',[[0,100],[800,100]]);
 assert.equal(root.style.getPropertyValue('--phone-sheet-zoom'),'3');f.touch(table,'touchcancel',[]);
 f.touch(table,'touchstart',[[0,100],[800,100]]);f.touch(table,'touchmove',[[100,100],[101,100]]);f.touch(table,'touchend',[]);
 assert.equal(root.style.getPropertyValue('--phone-sheet-zoom'),'0.5');
 assert.equal(f.touch(comment,'touchstart',[[100,100],[200,100]]).defaultPrevented,false);
 f.desktop();assert.equal(root.style.getPropertyValue('--phone-sheet-zoom'),'');
 assert.equal(f.touch(table,'touchstart',[[100,100],[200,100]]).defaultPrevented,false);
});
test('one-finger Sheets scrolling and cell taps remain native; pinches do not trigger a cell click',t=>{
 const f=sheetsZoomFixture(t),cell=f.d.querySelector('[data-sheet-cell]');let clicks=0;f.d.addEventListener('click',()=>clicks++);
 assert.equal(f.touch(cell,'touchstart',[[100,100]]).defaultPrevented,false);
 assert.equal(f.touch(cell,'touchmove',[[100,140]]).defaultPrevented,false);
 assert.equal(f.touch(cell,'touchend',[]).defaultPrevented,false);cell.click();assert.equal(clicks,1);
 f.touch(cell,'touchstart',[[100,100],[200,100]]);f.touch(cell,'touchmove',[[50,100],[250,100]]);f.touch(cell,'touchend',[]);
 cell.click();assert.equal(clicks,1);
});
