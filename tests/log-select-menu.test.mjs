import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('../public/log/log-select-menu.js',import.meta.url),'utf8');
function fixture(t){
 const dom=new JSDOM('<div class="filters"><select id="viewMode"><option value="compact">通常</option><option value="timeline">共有時間軸モード</option></select><select id="tabFilter"><option>メイン</option><option>情報</option></select></div>',{url:'https://test/log/',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;w.eval(source);return w;
}
test('custom log choices keep native change handlers and update options after shared tab changes',async t=>{
 const w=fixture(t),select=w.document.getElementById('tabFilter'),trigger=w.document.getElementById('tabFilterTrigger');let calls=0;select.onchange=()=>calls++;
 trigger.click();const menu=w.document.getElementById('tabFilterMenu');assert.equal(menu.parentElement,w.document.body);assert.equal(menu.hidden,false);
 menu.children[1].click();assert.equal(select.value,'情報');assert.equal(calls,1);assert.equal(trigger.textContent,'情報');assert.equal(menu.hidden,true);
 select.innerHTML='<option>HO1</option><option>HO2</option>';select.value='HO2';await new Promise(setImmediate);assert.equal(trigger.textContent,'HO2');trigger.click();assert.deepEqual([...menu.children].map(c=>c.textContent),['HO1','HO2']);
});
test('keyboard choice, Escape and switching menus keep focus and expanded state consistent',t=>{
 const w=fixture(t),trigger=w.document.getElementById('viewModeTrigger');trigger.focus();
 const key=k=>trigger.dispatchEvent(new w.KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true}));
 key('ArrowDown');key('ArrowDown');key('Enter');assert.equal(w.document.getElementById('viewMode').value,'timeline');assert.equal(w.document.activeElement,trigger);assert.equal(trigger.getAttribute('aria-expanded'),'false');
 trigger.click();w.document.getElementById('tabFilterTrigger').click();assert.equal(trigger.getAttribute('aria-expanded'),'false');assert.equal(w.document.getElementById('tabFilterMenu').hidden,false);
 w.document.getElementById('tabFilterTrigger').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',cancelable:true}));assert.equal(w.document.getElementById('tabFilterMenu').hidden,true);
});
test('the popup is clamped inside the viewport when the original select is near its left edge',t=>{
 const w=fixture(t),trigger=w.document.getElementById('viewModeTrigger');trigger.getBoundingClientRect=()=>({left:-5,right:103,bottom:40,top:12,width:108});trigger.click();const menu=w.document.getElementById('viewModeMenu');assert.equal(menu.style.left,'8px');assert.equal(menu.style.top,'46px');
});
