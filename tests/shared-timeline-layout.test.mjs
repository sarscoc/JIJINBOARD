import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const code=readFileSync(new URL('../public/log/shared-timeline-layout.js',import.meta.url),'utf8');
function fixture(t){
 const dom=new JSDOM('<div id="logPane"></div><input id="fontSize">',{url:'https://test/log/',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;
 w.state={hiddenTabs:new w.Set(),annotationVersion:1,viewMode:'compact'};w.esc=s=>String(s||'');w.messageHtml=m=>'<div class="log-message">'+m.text+'</div>';w.requestAnimationFrame=fn=>w.setTimeout(fn,0);w.cancelAnimationFrame=id=>w.clearTimeout(id);
 Object.defineProperty(w.document.getElementById('logPane'),'clientWidth',{value:400,configurable:true});
 w.eval('function sharedTimelineSlots(){};function timelinePagePanelHtml(){};');w.eval(code);return w;
}
test('shared timeline merges equal times, sorts minor clock reversals and preserves midnight order',t=>{
 const w=fixture(t),messages=[{tab:'メイン',time:'21:00',text:'a'},{tab:'情報',time:'20:59',text:'b'},{tab:'情報',time:'21:00',text:'c'},{tab:'メイン',time:'00:01',text:'d'},{tab:'情報',time:'00:01',text:'e'}];
 const slots=w.sharedTimelineSlots(messages);assert.deepEqual(Array.from(slots,s=>s.time),['20:59','21:00','00:01']);assert.equal(slots[1].byTab.size,2);assert.equal(slots[2].byTab.size,2);
});
test('empty and populated tabs reserve the same height, including long messages over 110px',t=>{
 const w=fixture(t);const original=w.HTMLElement.prototype.getBoundingClientRect;
 w.HTMLElement.prototype.getBoundingClientRect=function(){if(this.dataset.measureSlot!==undefined)return {height:this.textContent.includes('long')?480:36};return original.call(this)};
 const slots=w.sharedTimelineSlots([{tab:'メイン',time:'21:00',text:'short'},{tab:'情報',time:'21:00',text:'long'},{tab:'メイン',time:'21:01',text:'next'}]);
 const sizes=w.JijinTimelineLayout.heights(slots,{},'');assert.deepEqual(Array.from(sizes),[480,36]);
 const a=new JSDOM(w.timelinePagePanelHtml('メイン',0,1,slots,{},'')),b=new JSDOM(w.timelinePagePanelHtml('情報',1,2,slots,{},''));t.after(()=>{a.window.close();b.window.close()});
 assert.deepEqual([...a.window.document.querySelectorAll('.timeline-slot')].map(r=>r.style.height),['480px','36px']);assert.deepEqual([...b.window.document.querySelectorAll('.timeline-slot')].map(r=>r.style.height),['480px','36px']);assert.ok(b.window.document.querySelectorAll('.timeline-slot')[1].classList.contains('empty-slot'));
});
test('layout measurements are shared across tabs and recalculated after a font change',t=>{
 const w=fixture(t),slots=w.sharedTimelineSlots([{tab:'main',time:'21:00',text:'a'.repeat(100)}]);const first=w.JijinTimelineLayout.heights(slots,{},'');assert.equal(w.JijinTimelineLayout.heights(slots,{},''),first);
 w.document.documentElement.style.setProperty('--log-font-size','20px');const next=w.JijinTimelineLayout.heights(slots,{},'');assert.notEqual(next,first);assert.ok(next[0]>first[0]);
});
