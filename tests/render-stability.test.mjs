import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=p=>readFileSync(new URL('../public/'+p,import.meta.url),'utf8');
test('presence refresh preserves unchanged comment threads and loaded images',async t=>{
 const dom=new JSDOM('<div id="commentsList"></div><span id="commentCount"></span>',{url:'https://test/log/?room=r',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;
 w.requestAnimationFrame=()=>0;w.renderComments=()=>{};w.jumpToComment=()=>{};
 w.state={roomId:'r',room:{messages:[{id:'m',tab:'Main'}]},annotations:[{id:'a',message_id:'m',body:'Hello',has_image:true,persona_name:'PC',color:'#fff'}],presence:[],profile:{id:'p'}};
 w.esc=v=>String(v??'');w.markerColor=v=>v;w.formatCommentDate=()=>'';w.commentBodyHtml=v=>v;
 w.eval(source('log/comment-window-loader.js'));await new Promise(r=>setTimeout(r,20));w.renderComments();
 const thread=w.document.querySelector('.comment-thread'),image=w.document.querySelector('.comment-image');
 w.state.presence=[{id:'other',is_typing:true,typing_message_id:'m',pl_name:'Other'}];w.renderComments();
 assert.equal(w.document.querySelector('.comment-thread'),thread);assert.equal(w.document.querySelector('.comment-image'),image);assert.equal(w.document.querySelectorAll('.typing-comment').length,1);
 w.state.annotations[0].body='Updated';w.renderComments();assert.match(w.document.querySelector('.comment-body').textContent,/Updated/);
 w.state.presence=[];w.renderComments();assert.equal(w.document.querySelectorAll('.typing-comment').length,0);
});
test('Sheets starts fetching before display helpers are ready and hydrates once',async t=>{
 const dom=new JSDOM('',{url:'https://test/spreadsheet/?board=b',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;
 w.state={characters:[],sources:[],layout:{}};w.requestAnimationFrame=()=>0;let reads=0,renders=0;
 w.fetch=async()=>{reads++;return {ok:true,json:async()=>({state:null,revision:'r'})}};w.setMainView=()=>renders++;
 w.eval(source('shared/data-sync.js'));w.eval(source('spreadsheet/sheet-sync.js'));assert.equal(reads,1);assert.equal(renders,0);
 w.sheetDisplaySettings={isEditing:()=>false};await new Promise(r=>setTimeout(r,70));assert.equal(renders,1);assert.equal(reads,1);
});
