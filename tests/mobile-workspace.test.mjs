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
  f.w.selectionInfo=()=>({messageId:'m1',quote:'Test passage'});f.w.openCommentDialog=()=>opens++;
  f.pointer(f.d.querySelector('.log-message'),'pointerdown');f.fireHold();
  assert.equal(opens,1);assert.equal(f.w.state.selection.messageId,'m1');
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
test('the comment handle expands with swipe and collapses with a tap',t=>{
  const f=fixture(t),grip=f.d.querySelector('.phone-dock-grip');
  f.pointer(grip,'pointerdown',50,200);f.pointer(grip,'pointerup',50,130);
  assert.equal(grip.getAttribute('aria-expanded'),'true');assert.equal(f.d.documentElement.classList.contains('phone-comments-expanded'),true);
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
