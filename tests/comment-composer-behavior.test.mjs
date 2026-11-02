import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {JSDOM} from 'jsdom';
const read=p=>readFileSync(new URL('../public/'+p,import.meta.url),'utf8');
const helper='// Desktop composer behavior'+read('shared/comments.js').split('// Desktop composer behavior')[1];
for(const id of ['commentDialog','matrixIconCommentDialog','sheetCommentDialog'])test(id+': Enter, Shift+Enter, IME, outside and mobile',t=>{
 const dom=new JSDOM(`<dialog id="${id}" open><form><textarea></textarea></form></dialog>`,{url:'https://test/',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;w.eval(helper);const d=w.document.querySelector('dialog'),ta=d.querySelector('textarea');let sent=0;d.querySelector('form').requestSubmit=()=>sent++;d.close=()=>d.open=false;
 const key=options=>{const e=new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true,...options});ta.dispatchEvent(e);return e};
 ta.value='text';assert.equal(key({shiftKey:true}).defaultPrevented,false);assert.equal(key({isComposing:true}).defaultPrevented,false);assert.equal(sent,0);assert.equal(key({}).defaultPrevented,true);assert.equal(sent,1);key({repeat:true});assert.equal(sent,1);
 assert.equal(w.JijinCommentComposer.outside(d),true);assert.equal(d.open,true);assert.equal(sent,1);ta.value='   ';w.JijinCommentComposer.outside(d);assert.equal(d.open,false);
 d.open=true;w.JijinCommentComposer.outside(d,true);assert.equal(d.open,true,'an attached image is a draft');
 w.innerWidth=390;assert.equal(key({}).defaultPrevented,false);assert.equal(w.JijinCommentComposer.outside(d),false);assert.equal(d.open,true);
});
test('MATRIX supplement keeps outside drafts, cancels blank edits, and explicitly commits Enter',t=>{
 const dom=new JSDOM('<div id="point"></div><button id="outside"></button>',{url:'https://test/',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;w.eval(helper);w.requestAnimationFrame=()=>0;const state={items:{p:{comment:'',commentPosition:'top'}},display:{}};let saves=0;w.appState=()=>state;w.mutate=fn=>{saves++;fn(state)};w.items=[{id:'p'}];w.getCommentFontFamily=()=>'';w.commentTextColor=()=>'';w.applyTextOutline=()=>{};
 const html=read('matrix/index.html');w.eval('let activeCommentEditor=null;function commitActiveCommentEditor(){activeCommentEditor?.commit()}\n'+html.slice(html.indexOf('function openInlineCommentEditor('),html.indexOf('function setupPlacedClickBehavior(')));
 const point=w.document.getElementById('point'),out=w.document.getElementById('outside');w.openInlineCommentEditor('p',point);let ta=point.querySelector('textarea');ta.value='note';ta.dispatchEvent(new w.Event('input'));out.dispatchEvent(new w.Event('pointerdown',{bubbles:true}));assert.ok(point.querySelector('textarea'));assert.equal(saves,0);
 ta.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',shiftKey:true,bubbles:true,cancelable:true}));assert.equal(saves,0);ta.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));assert.equal(saves,1);assert.equal(state.items.p.comment,'note');assert.equal(point.querySelector('textarea'),null);
 w.openInlineCommentEditor('p',point);ta=point.querySelector('textarea');ta.value='';ta.dispatchEvent(new w.Event('input'));out.dispatchEvent(new w.Event('pointerdown',{bubbles:true}));assert.equal(saves,1);assert.equal(state.items.p.comment,'note');assert.equal(point.querySelector('textarea'),null);
});
