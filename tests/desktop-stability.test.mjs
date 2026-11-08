import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {JSDOM} from 'jsdom';
const source=p=>readFileSync(new URL('../public/'+p,import.meta.url),'utf8'),tick=()=>new Promise(setImmediate),sleep=ms=>new Promise(r=>setTimeout(r,ms));
function page(t,html='',url='https://test/matrix/?board=b'){const dom=new JSDOM(html,{url,runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());const w=dom.window;w.structuredClone=structuredClone;w.requestAnimationFrame=fn=>{fn();return 1};w.cancelAnimationFrame=()=>{};return w}
test('desktop additions are inert in the phone viewport',t=>{
 const w=page(t);Object.defineProperty(w,'innerWidth',{value:390});const original=()=>{};w.openInlineCommentEditor=original;w.eval(source('shared/desktop-ui.js'));w.eval(source('matrix/desktop-notes.js'));
 assert.equal(w.JijinDesktop,undefined);assert.equal(w.document.documentElement.classList.contains('jijin-desktop'),false);assert.equal(w.openInlineCommentEditor,original);
});
test('PC supplement can retry after failure, survive repaint requests and reopen after saving',async t=>{
 const w=page(t,'<div class="placed" data-id="pc"></div>');w.eval(source('shared/desktop-ui.js'));
 let state={items:{pc:{comment:'old',commentPosition:'top',x:31}}},draws=0,writes=0,fail=true;
 w.appState=()=>structuredClone(state);w.saveJSON=(_,value)=>{state=structuredClone(value)};w.STATE='s';w.saveCurrentTemplateState=()=>{};w.currentTemplateId=()=> 'tpl';w.activeCommentEditor={box:w.document.createElement('div')};w.items=[{id:'pc'}];w.renderPlaced=()=>draws++;w.openInlineCommentEditor=()=>{throw Error('retired editor must not run')};
 w.matrixBoardContext={boardId:'b',async savePoint(id,item,note){writes++;assert.equal(note,true);assert.equal(item.baseComment,'old');if(fail)throw Error('offline');return true}};
 w.eval(source('matrix/desktop-notes.js'));const el=w.document.querySelector('.placed');w.openInlineCommentEditor('pc',el);let field=w.document.querySelector('textarea');assert.equal(w.document.querySelector('select').hidden,true);assert.equal(w.document.querySelectorAll('.comment-direction-btn').length,4);w.document.querySelector('.dir-left').click();assert.equal(w.document.querySelector('select').value,'left');assert.equal(w.document.querySelector('.dir-left').hidden,true);field.value='new';field.dispatchEvent(new w.Event('input'));
 w.renderPlaced();assert.equal(draws,0);assert.ok(field.isConnected);w.openInlineCommentEditor('pc',el);assert.equal(w.document.querySelector('textarea'),field);
 field.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));await tick();assert.equal(field.disabled,false);assert.ok(field.isConnected);assert.match(w.document.querySelector('[role=status]').textContent,/offline/);assert.equal(state.items.pc.comment,'old');
 fail=false;field.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));await tick();assert.equal(writes,2);assert.equal(state.items.pc.comment,'new');assert.equal(state.items.pc.x,31);assert.equal(w.document.querySelector('textarea'),null);assert.equal(w.activeCommentEditor,null);
 w.openInlineCommentEditor('pc',el);assert.equal(w.document.querySelector('textarea').value,'new');
});
test('PC image updates prefer MATRIX image over the old placement and fallback image',async t=>{
 const w=page(t,'<div id="matrixPcStrip"></div>');w.eval(source('shared/desktop-ui.js'));w.eval(`var items=[],saved={items:{'participant:p:pc':{placed:true,placedImage:'/old.png'}},display:{}};function appState(){return saved}function saveState(s){saved=s}function currentTemplateId(){return 'tpl'}function templateStates(){return {tpl:saved}}function makeLocalItemState(){return {}}function renderLibrary(){}function renderPlaced(){};window.shown=()=>items;`);
 let icon='/matrix1.png';w.fetch=async()=>({ok:true,json:async()=>({participants:[{authorId:'p',personaId:'pc',name:'PC',textColor:'#112233',color:'#aabbcc',colorDark:'#334455',matrixIcon:icon,icon:'/base.png',serverIcon:'/base.png'}]})});w.eval(source('matrix/matrix-pc.js'));await tick();await tick();assert.equal(w.shown()[0].baseImage,'/matrix1.png');assert.equal(w.shown()[0].placementImage,'/matrix1.png');assert.equal(w.shown()[0].color,'#112233');assert.equal(w.shown()[0].markerColor,'#aabbcc');assert.equal(w.shown()[0].markerColorDark,'#334455');
 icon='/matrix2.png';w.dispatchEvent(new w.Event('matrix-board-participants-changed'));await tick();await tick();assert.equal(w.shown()[0].baseImage,'/matrix2.png');assert.equal(w.shown()[0].local.placed,true);
});
test('PC sheet view stays personal across a remote update and is never published as another viewers mode',async t=>{
 const w=page(t,'','https://test/spreadsheet/?board=b');w.eval(source('shared/desktop-ui.js'));w.eval(source('shared/data-sync.js'));
 w.state={layout:{},characters:[],sources:[]};w.sheetDisplaySettings={isEditing:()=>false};w.ensureLayoutShape=()=>{};w.migrateCharacters=()=>{};w.setMainView=()=>{};
 w.localStorage.setItem('charaHub.layoutV1',JSON.stringify({mainMode:'database'}));let remote={ 'charaHub.characters':[], 'charaHub.sources':[], 'charaHub.layoutV1':{mainMode:'characters'}},revision='r1',posts=[];
 w.fetch=async(path,options={})=>{if(options.method==='POST'){posts.push(JSON.parse(options.body));revision='r3';return {ok:true,json:async()=>({revision})}}return {ok:true,json:async()=>({state:structuredClone(remote),revision})}};
 w.eval(source('spreadsheet/sheet-sync.js'));await tick();await tick();assert.equal(w.state.layout.mainMode,'database');
 w.state.layout.mainMode='characters';w.localStorage.setItem('charaHub.layoutV1',JSON.stringify(w.state.layout));await sleep(180);assert.equal(posts.length,0);
 remote['charaHub.layoutV1'].mainMode='database';w.dispatchEvent(new w.CustomEvent('jijinboard-spreadsheet-remote-change',{detail:{action:'spreadsheet-state',data:{baseRevision:'r1',revision:'r2',state:remote}}}));await tick();assert.equal(w.state.layout.mainMode,'characters');
 w.localStorage.setItem('charaHub.characters',JSON.stringify([{id:'pc',name:'PC'}]));await sleep(180);assert.equal(posts.length,1);assert.equal(posts[0].state['charaHub.layoutV1'].mainMode,'database');assert.equal(posts[0].baseRevision,'r2');
});
test('PC roots are newest first and replies stay below their parent',async t=>{
 const w=page(t,'<div id="commentsList"></div><span id="commentCount"></span>','https://test/log/?room=r');w.eval(source('shared/desktop-ui.js'));w.renderComments=()=>{};w.jumpToComment=()=>{};w.esc=v=>String(v??'');w.markerColor=v=>v;w.formatCommentDate=()=>'';w.commentBodyHtml=v=>v;
 w.state={roomId:'r',room:{tabs:['Main','Other'],messages:[{id:'m1',tab:'Main'},{id:'m2',tab:'Other'}]},annotations:[{id:'old',message_id:'m1',body:'old',created_at:'2026-11-03 22:37:00'},{id:'reply',parent_id:'old',message_id:'m1',body:'reply',created_at:'2026-11-05 10:00:00'},{id:'early-reply',parent_id:'old',message_id:'m1',body:'early',created_at:'2026-11-04 10:00:00'},{id:'new',message_id:'m2',body:'new',created_at:'2026-11-04 22:48:00'}],presence:[],profile:{id:'p'}};
 w.eval(source('log/comment-window-loader.js'));await sleep(25);w.renderComments();assert.deepEqual(Array.from(w.document.querySelectorAll('.comment-card'),el=>el.id),['comment-new','comment-old','comment-early-reply','comment-reply']);w.state.hiddenTabs=new Set(['Other']);w.renderComments();assert.equal(w.document.getElementById('comment-new'),null);
});

test('PC supplement conflict keeps the draft and requires checking the latest note before changing its base',async t=>{
 const w=page(t,'<div class="placed"></div>');w.eval(source('shared/desktop-ui.js'));let state={items:{pc:{comment:'old',commentPosition:'top'}}},conflict=true;
 w.appState=()=>structuredClone(state);w.saveJSON=(_,s)=>state=structuredClone(s);w.STATE='s';w.saveCurrentTemplateState=()=>{};w.currentTemplateId=()=> 't';w.renderPlaced=()=>{};w.openInlineCommentEditor=()=>{};w.items=[];
 w.matrixBoardContext={async savePoint(id,item){if(conflict)throw Object.assign(Error('updated'),{status:409,point:{comment:'remote',commentPosition:'left'}});assert.equal(item.baseComment,'remote');return true}};
 w.eval(source('matrix/desktop-notes.js'));w.openInlineCommentEditor('pc',w.document.querySelector('.placed'));const field=w.document.querySelector('textarea');field.value='draft';field.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await tick();assert.equal(field.value,'draft');assert.equal(field.disabled,false);assert.equal(state.items.pc.comment,'old');
 w.document.querySelector('.note-conflict-latest').click();assert.equal(field.value,'remote');assert.equal(state.items.pc.comment,'remote');conflict=false;field.value='my next edit';field.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await tick();assert.equal(state.items.pc.comment,'my next edit');assert.equal(w.document.querySelector('textarea'),null);
});

test('PC presence order survives a peer disconnect and rejoin without swapping other people',async t=>{
 const w=page(t,'<div id="presenceBar"></div><dialog id="boardProfileDialog"></dialog>','https://test/board/?id=b');w.eval(source('shared/desktop-ui.js'));class Socket extends w.EventTarget{static OPEN=1;readyState=1;constructor(){super();w.socket=this}send(){}close(){}}w.WebSocket=Socket;w.eval('var boardId="b";function esc(s){return String(s)}');
 const s=source('board/board2.js'),start=s.indexOf('// Presence belongs'),end=s.indexOf('window.JIJINBOARD_LOG_TITLE',start);w.eval(s.slice(start,end));await tick();
 const people=[{author_id:'a',pl_name:'Alice'},{author_id:'b',pl_name:'Bob'},{author_id:'c',pl_name:'Carol'}],send=list=>w.socket.dispatchEvent(new w.MessageEvent('message',{data:JSON.stringify({type:'presence',presence:list})}));send(people);const alice=w.document.querySelector('[data-author-id="a"]');send([people[2],people[0]]);send([people[1],people[2],people[0]]);
 assert.deepEqual(Array.from(w.document.querySelector('#presenceBar').children,n=>n.dataset.authorId),['a','b','c']);assert.equal(w.document.querySelector('[data-author-id="a"]'),alice);
});

test('PC imported documents compact whitespace-only blank lines without changing marker source offsets',t=>{
 const w=page(t);w.eval(source('shared/desktop-ui.js'));w.eval(source('shared/log-format.js'));const text='first\n\u00a0\n\u3000\nlast',host=w.document.createElement('div');host.innerHTML=w.JijinLogFormat.render(text,[],{compactBlankLines:true});
 host.querySelectorAll('[data-log-hidden]').forEach(n=>n.remove());assert.equal(host.textContent,'first\nlast');assert.ok(host.querySelector('[data-log-start="10"]')||Array.from(host.querySelectorAll('[data-log-end]')).some(n=>Number(n.dataset.logEnd)===text.length));assert.equal(w.JijinLogFormat.plain(text),text);
});

test('PC display never presents a cached icon from an older image signature',t=>{
 const w=page(t);w.eval(source('shared/desktop-ui.js'));w.imageBlobUrls=new Map([['pc','blob:old']]);w.imageCacheMeta=new Map([['pc',{signature:'old'}]]);w.stableRemoteImageKey=s=>s;
 const code=source('matrix/index.html'),start=code.indexOf('function displayImage(it){'),end=code.indexOf('\n}',start)+2;w.eval(code.slice(start,end));
 assert.equal(w.displayImage({id:'pc',imageSignature:'new',baseImage:'/new.png'}),'/new.png');w.imageCacheMeta.set('pc',{signature:'new'});w.imageBlobUrls.set('pc','blob:new');assert.equal(w.displayImage({id:'pc',imageSignature:'new',baseImage:'/new.png'}),'blob:new');
});

test('PC comment emphasis closes outside cards and markers',t=>{
 const w=page(t,'<div class="comment-card focused">comment</div><mark data-ann="c">marker</mark><button id="outside">outside</button>');w.eval(source('shared/desktop-ui.js'));
 w.document.querySelector('mark').click();assert.ok(w.document.querySelector('.comment-card').classList.contains('focused'));
 w.document.querySelector('.comment-card').click();assert.ok(w.document.querySelector('.comment-card').classList.contains('focused'));
 w.document.getElementById('outside').click();assert.equal(w.document.querySelector('.focused'),null);
});

test('desktop MATRIX note and comment composers switch exclusively and retain the note draft',t=>{
 const w=page(t,'<div class="placed"></div>');w.eval(source('shared/desktop-ui.js'));
 w.appState=()=>({items:{pc:{comment:'saved',commentPosition:'top'}}});w.currentTemplateId=()=> 'tpl';w.renderPlaced=()=>{};w.openInlineCommentEditor=()=>{};w.items=[];
 let commentOpen=true,blocked=false;w.jijinSuspendMatrixComment=()=>{if(blocked)return false;commentOpen=false;return true};
 w.eval(source('matrix/desktop-notes.js'));const el=w.document.querySelector('.placed');el.dataset.id='pc';w.eval(source('matrix/matrix-icon-interactions.js'));el.dispatchEvent(new w.MouseEvent('contextmenu',{bubbles:true,cancelable:true}));assert.equal(commentOpen,false);
 const field=w.document.querySelector('textarea');field.value='draft';field.dispatchEvent(new w.Event('input'));assert.equal(w.jijinSuspendMatrixNote(),true);assert.equal(w.document.querySelector('textarea'),null);
 commentOpen=true;blocked=true;w.openInlineCommentEditor('pc',el);assert.equal(w.document.querySelector('textarea'),null);
 blocked=false;w.openInlineCommentEditor('pc',el);assert.equal(commentOpen,false);assert.equal(w.document.querySelector('textarea').value,'draft');
});

test('desktop MATRIX replies remain indented in newest-first order and use marker rather than text colors',t=>{
 const w=page(t,'<div class="placed" data-id="pc"><img alt=""></div><section id="list"></section><span id="count"></span>');w.eval(source('shared/desktop-ui.js'));
 w.eval(`var comments=[{id:'parent',created_at:'2026-11-04',target:'tpl@@matrix-template@@pc',persona_name:'PC',persona_type:'PC',author_id:'me',body:'parent'},{id:'reply',parent_id:'parent',created_at:'2026-11-05',target:'tpl@@matrix-template@@pc',persona_name:'PC',persona_type:'PC',author_id:'me',body:'reply'}];function profile(){return {id:'me'}}function ctx(){return {boardId:'b'}}function pcList(){return [{id:'pc',name:'PC',type:'PC',color:'#aabbcc',colorDark:'#334455'}]}function esc(v){return String(v||'')}function targetImage(){return ''}function targetName(){return 'PC'}function targetItem(){return {markerColor:'#aabbcc'}}var TARGET_SEP='@@matrix-template@@';function targetParts(){return {templateId:'tpl',itemId:'pc'}}function currentTemplateId(){return 'tpl'}function formatCommentDate(){return ''}function renderTyping(){}function panel(){return {querySelector:s=>document.querySelector(s==='section'?'#list':'#count')}}`);
 const code=source('matrix/matrix-icon-comments.js');w.eval(code.slice(code.indexOf('  function commentColor('),code.indexOf('  const changes='))+';window.paint=render;');
 w.appState=()=>({items:{pc:{placed:true,comment:'既存の補足'}}});w.paint();let rows=w.document.querySelectorAll('.matrix-comment-thread:not(.matrix-point-note-thread)');assert.equal(rows.length,2);assert.equal(rows[1].classList.contains('matrix-reply'),true);assert.equal(rows[1].parentElement,rows[0]);assert.match(rows[1].textContent,/reply/);assert.equal(rows[0].querySelector('article').style.getPropertyValue('--comment-marker'),'#aabbcc');
 w.document.documentElement.classList.add('dark');w.paint();assert.equal(w.document.querySelector('.matrix-comment-thread:not(.matrix-point-note-thread) article').style.getPropertyValue('--comment-marker'),'#334455');
 const badge=w.document.querySelector('.matrix-point-note-badge');
 const placed=badge.closest('.placed'),avatar=placed.querySelector('img');
 assert.equal(placed.title,'');
 const hover=(target,type,relatedTarget=null)=>{
  const event=new w.MouseEvent(type,{bubbles:true,relatedTarget});
  Object.defineProperty(event,'pointerType',{value:'mouse'});
  target.dispatchEvent(event);
 };
 hover(avatar,'pointerover');
 assert.equal(w.document.querySelector('.matrix-point-hover-preview').textContent,'既存の補足');
 hover(avatar,'pointerout',badge);
 assert.ok(w.document.querySelector('.matrix-point-hover-preview'));
 hover(badge,'pointerout',w.document.body);
 assert.equal(w.document.querySelector('.matrix-point-hover-preview'),null);
 badge.click();
 assert.ok(w.document.querySelector('#list > .matrix-point-note-thread .focused'));
 assert.equal(w.document.querySelectorAll('#list .matrix-comment-thread').length,3);
 assert.equal(w.document.querySelector('.matrix-point-summary'),null);
 w.appState=()=>({items:{pc:{placed:true,comment:''}}});
 w.paint();
 assert.equal(w.document.querySelector('.matrix-point-note-badge'),null);
 assert.equal(w.document.querySelectorAll('#list .matrix-comment-thread').length,2);
});

test('PC supplement is outside the canvas clipping hierarchy and remains within the viewport',t=>{
 const w=page(t,'<div class="canvas" style="overflow:hidden"><div class="placed"></div></div>');w.eval(source('shared/desktop-ui.js'));const el=w.document.querySelector('.placed');el.getBoundingClientRect=()=>({left:1000,right:1040,top:740,bottom:780,width:40,height:40});
 w.appState=()=>({items:{pc:{comment:'note',commentPosition:'right'}}});w.currentTemplateId=()=> 'tpl';w.renderPlaced=()=>{};w.openInlineCommentEditor=()=>{};w.items=[];w.eval(source('matrix/desktop-notes.js'));w.openInlineCommentEditor('pc',el);
 const box=w.document.querySelector('.inline-comment-editor');assert.equal(box.parentElement,w.document.body);assert.equal(box.style.position,'fixed');assert.ok(parseFloat(box.style.left)+242<=w.innerWidth);assert.ok(parseFloat(box.style.top)+140<=w.innerHeight);
});
