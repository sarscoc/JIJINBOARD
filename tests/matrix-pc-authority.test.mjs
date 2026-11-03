import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('../public/matrix/matrix-pc.js',import.meta.url),'utf8');
const tick=()=>new Promise(setImmediate);
test('MATRIX cannot restore deleted PCs from cached profiles or write them back on load',async t=>{
 const dom=new JSDOM('<div id="matrixPcStrip"></div>',{url:'https://test/matrix/?board=board&room=log',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;w.structuredClone=structuredClone;w.requestAnimationFrame=fn=>w.setTimeout(fn,0);w.cancelAnimationFrame=id=>w.clearTimeout(id);
 w.localStorage.setItem('trpgMarkerProfile',JSON.stringify({id:'p',plName:'PL'}));w.localStorage.setItem('personas:log',JSON.stringify([{id:'old',name:'Old PC',type:'PC'}]));
 w.eval(`var items=[],saved={items:{'participant:p:pc':{placed:true,x:45,y:32}},display:{}};function appState(){return saved}function saveState(s){saved=s}function currentTemplateId(){return 'tpl'}function templateStates(){return {tpl:saved}}function makeLocalItemState(){return {placed:false}}function renderLibrary(){}function renderPlaced(){};window.shown=()=>items;`);
 let list=[{authorId:'p',personaId:'pc',plName:'PL',name:'Saved PC',icon:'/saved.png'}];const writes=[];
 w.fetch=async(path,options={})=>{if(options.method)writes.push(options);return {ok:true,json:async()=>({participants:list})}};
 w.eval(source);await tick();await tick();assert.equal(w.shown().length,1);assert.equal(w.shown()[0].name,'Saved PC');assert.equal(w.shown()[0].local.placed,true);
 list=[];w.dispatchEvent(new w.Event('matrix-board-participants-changed'));await tick();await tick();assert.equal(w.shown().length,0);assert.equal(writes.length,0);
});
test('saved MATRIX participant metadata paints before the server and its images are hydrated locally',async t=>{
 const dom=new JSDOM('<div id="matrixPcStrip"></div>',{url:'https://test/matrix/?board=board&room=log',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;w.structuredClone=structuredClone;w.requestAnimationFrame=fn=>w.setTimeout(fn,0);w.cancelAnimationFrame=id=>w.clearTimeout(id);w.localStorage.setItem('jijin.dataset.generation.v1','g');
 w.localStorage.setItem('trpgMarkerProfile',JSON.stringify({id:'p',plName:'PL'}));w.localStorage.setItem('board:board:matrix-pcs:log',JSON.stringify({generation:'g',participants:[{authorId:'p',personaId:'pc',name:'Saved PC',matrixIcon:'/icon'}]}));
 w.eval(`var items=[],saved={items:{},display:{}},hydrated=0;function appState(){return saved}function saveState(value){saved=value}function currentTemplateId(){return 'tpl'}function templateStates(){return {tpl:saved}}function makeLocalItemState(){return {placed:false}}function renderLibrary(){}function renderPlaced(){};async function hydrateCharacterImages(){hydrated++};window.shown=()=>items;window.hydrationCount=()=>hydrated;`);
 let release;w.fetch=()=>new Promise(resolve=>release=resolve);w.eval(source);assert.equal(w.shown()[0].name,'Saved PC');assert.equal(w.hydrationCount(),1);await tick();release({ok:true,json:async()=>({participants:[],revision:2})});await tick();await tick();assert.equal(w.shown().length,0);
});
