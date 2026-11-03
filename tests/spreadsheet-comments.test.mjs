import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../public/spreadsheet/sheet-comments-controller.js',import.meta.url),'utf8');
function shared(w){
  class Socket{static OPEN=1;static CONNECTING=0;readyState=0;addEventListener(){}close(){}send(){}}
  w.WebSocket=Socket;
  for(const name of ['comment-target.js','data-sync.js','comments.js'])w.eval(fs.readFileSync(new URL('../public/shared/'+name,import.meta.url),'utf8'));
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
test('posting a sheet comment refreshes after an older pending read and only posts once',async t=>{
 const dom=new JSDOM('<div data-sheet-cell="c1">cell</div>',{url:'https://example.test/spreadsheet/?board=b',runScripts:'outside-only'});
 t.after(()=>dom.window.close());const w=dom.window;
 w.CSS={escape:String};w.localStorage.setItem('trpgMarkerProfile',JSON.stringify({id:'author',plName:'PL'}));
 w.HTMLDialogElement.prototype.show=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 let finishRead,reads=0,writes=0;const rows=[{id:'comment',cell_id:'c1',author_id:'author',persona_name:'PL',persona_type:'PL',body:'saved'}];
 w.fetch=async(path,options={})=>{
  if(options.method==='POST'){writes++;return {ok:true,json:async()=>({ok:true})}}
  reads++;if(reads===1)return new Promise(resolve=>{finishRead=()=>resolve({ok:true,json:async()=>({comments:[]})})});
  return {ok:true,json:async()=>({comments:rows})};
 };
 shared(w);w.eval(source);w.document.querySelector('[data-sheet-cell]').click();
 const dialog=w.document.querySelector('dialog');dialog.querySelector('textarea').value='saved';
 dialog.querySelector('form').requestSubmit();dialog.querySelector('form').requestSubmit();await tick();
 assert.equal(writes,1);finishRead();await tick();await tick();
 assert.equal(reads,2);assert.equal(w.document.querySelector('.sheet-comment-count').textContent,'1');
 assert.equal(w.document.querySelector('.comment-body').textContent,'saved');assert.equal(dialog.open,false);
 const hidden=w.document.createElement('div');hidden.className='hidden';const original=w.document.querySelector('[data-sheet-cell]');original.before(hidden);hidden.append(original);
 const visible=w.document.createElement('div');visible.dataset.sheetCell='c1';w.document.body.append(visible);
 let jumped=null;w.HTMLElement.prototype.scrollIntoView=function(options){jumped=this;assert.equal(options.inline,'center')};
 w.document.querySelector('.comment-card').click();assert.equal(jumped,visible);assert.ok(visible.classList.contains('sheet-comment-flash'));
 assert.ok(original.classList.contains('sheet-has-comment'));

});
test('matrix keeps a desktop draft when another target is clicked, and sends with Enter',async t=>{
 const dom=new JSDOM('<div class="stage-shell"></div>',{url:'https://example.test/matrix/',runScripts:'outside-only',pretendToBeVisual:true});
 t.after(()=>dom.window.close());const w=dom.window;w.CSS={escape:String};
 w.HTMLDialogElement.prototype.show=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 const writes=[];let saved=[];
 w.matrixBoardContext={boardId:'b',roomId:'r',profile:()=>({id:'author',plName:'PL'}),api:async(path,options={})=>{
  if(options.method==='POST'){const data=JSON.parse(options.body);writes.push(data);saved.push({id:'comment',target_id:'template@@matrix-template@@'+decodeURIComponent(data.target.split('/').pop()),body:data.body,persona_name:'PL',persona_type:'PL'});return {ok:true}}
  if(path.endsWith('/participants'))return {participants:[]};return {comments:saved};
 }};
 w.items=[];w.currentTemplateId=()=> 'template';w.appState=()=>({items:{}});w.displayImage=()=>'';
 shared(w);
 w.fetch=async(path,options={})=>({ok:true,json:()=>w.matrixBoardContext.api(path,options)});
 w.eval(fs.readFileSync(new URL('../public/matrix/matrix-icon-comments.js',import.meta.url),'utf8'));
 await w.openMatrixIconComment('first');w.document.querySelector('textarea').value='draft';
 await w.openMatrixIconComment('second');
 assert.equal(writes.length,0);assert.equal(w.document.querySelector('textarea').value,'draft');
 w.document.querySelector('textarea').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));await tick();await tick();
 assert.equal(writes.length,1);assert.equal(writes[0].target,'/boards/b/matrix/template/points/first');
 assert.equal(w.document.querySelector('#matrixIconCommentCount').textContent,'1');assert.equal(w.document.querySelector('dialog').open,false);
 w.dispatchEvent(new w.CustomEvent('matrix-board-typing',{detail:{clientId:'other-device',templateId:'template',name:'Other PC',typing:true}}));
 assert.match(w.document.querySelector('.matrix-typing').textContent,/Other PC.*入力中/);
 w.dispatchEvent(new w.CustomEvent('matrix-board-typing',{detail:{clientId:'other-device',typing:false}}));
 assert.equal(w.document.querySelector('.matrix-typing'),null);

});


test('a saved sheet comment appears immediately without an extra list GET',async t=>{
 const dom=new JSDOM('<div data-sheet-cell="c">cell</div>',{url:'https://test/spreadsheet/?board=b',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;w.CSS={escape:String};w.localStorage.setItem('trpgMarkerProfile',JSON.stringify({id:'author',plName:'PL'}));w.HTMLDialogElement.prototype.show=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 let reads=0,writes=0;w.fetch=async(path,options={})=>{if(options.method==='POST'){writes++;return {ok:true,json:async()=>({comment:{id:'saved',target:'/boards/b/sheets/main/cells/c',cell_id:'c',body:'delivered',persona_name:'PL',persona_type:'PL',author_id:'author'},version:2})}}reads++;return {ok:true,json:async()=>({comments:[],version:1})}};
 shared(w);w.eval(source);await tick();await tick();w.document.querySelector('[data-sheet-cell]').click();const d=w.document.querySelector('dialog');d.querySelector('textarea').value='delivered';const before=reads;d.querySelector('form').requestSubmit();await tick();await tick();assert.equal(writes,1);assert.equal(reads,before);assert.equal(d.open,false);assert.equal(w.document.querySelector('.comment-body').textContent,'delivered');
});
