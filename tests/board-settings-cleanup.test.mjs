import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=name=>readFileSync(new URL('../public/board/'+name,import.meta.url),'utf8');
const tick=()=>new Promise(setImmediate);
function fixture(t){
 const dom=new JSDOM('<div class="top-actions"></div><div id="boardProfileDialog"></div>',{url:'https://test/board/?id=one',runScripts:'outside-only'});t.after(()=>dom.window.close());
 const w=dom.window;w.JijinBoardReady={image:new Promise(()=>{})};w.requestAnimationFrame=fn=>fn();w.requestIdleCallback=fn=>fn();
 let opens=0,flushes=0;
 w.JijinSpeakerEditor=()=>({open(){opens++},flush(){flushes++;return Promise.resolve()}});
 w.eval(source('board-profile.js'));
 return {w,get opens(){return opens},get flushes(){return flushes}};
}
test('settings switch directly between current editors without creating tool frames',async t=>{
 const f=fixture(t),w=f.w;w.fetch=async()=>({ok:true,json:async()=>({theme:null})});w.eval(source('theme-scoped.js'));
 w.document.getElementById('boardSettingsButton').click();assert.equal(f.opens,1);
 w.document.querySelector('[data-board-settings-tab="design"]').click();assert.equal(f.flushes,1);
 assert.ok(w.document.getElementById('scopedColor1'));assert.equal(w.document.querySelector('iframe'),null);
 w.document.querySelector('[data-board-settings-tab="general"]').click();assert.equal(f.opens,2);
 w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape'}));assert.equal(f.flushes,2);assert.equal(w.document.getElementById('boardSettingsOverlay').hidden,true);
 assert.equal(w.document.getElementById('profileButton'),null);
});
test('cached colors are revalidated and an absent server theme clears outdated colors',async t=>{
 const {w}=fixture(t);const key='jijinboardScopedTheme:one';w.localStorage.setItem(key,JSON.stringify({color1:'#ff0000',gradientColor1:'#000000'}));
 let release;w.fetch=()=>new Promise(r=>release=r);w.eval(source('theme-scoped.js'));
 assert.match(w.document.getElementById('jijinboardScopedThemeStyle').textContent,/#ff0000/);
 release({ok:true,json:async()=>({theme:null})});await tick();
 assert.equal(JSON.parse(w.localStorage.getItem(key)).color1,'#171a20');
 assert.equal(w.document.documentElement.style.getPropertyValue('--jijin-pre-color1'),'#171a20');
});
test('a delayed theme response cannot replace a newer local color edit',async t=>{
 const {w}=fixture(t);let release;w.fetch=()=>new Promise(r=>release=r);w.eval(source('theme-scoped.js'));w.JijinBoardTheme.open();
 const input=w.document.getElementById('scopedColor1');input.value='#123456';input.dispatchEvent(new w.Event('input',{bubbles:true}));
 release({ok:true,json:async()=>({theme:{color1:'#ff0000'}})});await tick();
 assert.equal(input.value,'#123456');assert.equal(JSON.parse(w.localStorage.getItem('jijinboardScopedTheme:one')).color1,'#123456');
});
