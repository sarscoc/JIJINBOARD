import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const html=readFileSync(new URL('../public/matrix/index.html',import.meta.url),'utf8');
const start=html.indexOf('function applyPlacedTextSizes('),end=html.indexOf('function updatePlacedTemplateScale(',start);
for(const scale of [.5,1,2,4])test('PC text remains at the selected size with template scale '+scale,t=>{
 const dom=new JSDOM('<div class="placed"><div class="placed-name"></div><div class="placed-comment"></div></div>',{runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;w.JijinDesktop={};w.eval(html.slice(start,end));const el=w.document.querySelector('.placed');w.applyPlacedTextSizes(el,{nameFontSize:6,commentFontSize:8},scale);
 assert.equal(parseFloat(el.querySelector('.placed-name').style.fontSize)*scale,6);assert.equal(parseFloat(el.querySelector('.placed-comment').style.fontSize)*scale,8);
 w.applyPlacedTextSizes(el,{nameFontSize:12,commentFontSize:16},scale);assert.equal(parseFloat(el.querySelector('.placed-name').style.fontSize)*scale,12);assert.equal(parseFloat(el.querySelector('.placed-comment').style.fontSize)*scale,16);
});
test('the PC font adjustment does not alter phone text',t=>{
 const dom=new JSDOM('<div class="placed"><div class="placed-name" style="font-size:6px"></div><div class="placed-comment" style="font-size:8px"></div></div>',{runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;w.eval(html.slice(start,end));const el=w.document.querySelector('.placed');w.applyPlacedTextSizes(el,{nameFontSize:20,commentFontSize:20},2);assert.equal(el.querySelector('.placed-name').style.fontSize,'6px');assert.equal(el.querySelector('.placed-comment').style.fontSize,'8px');
});
test('desktop redraw and resize both apply the selected text sizes; export uses screen text scale',()=>{
 assert.match(html,/applyPlacedTextSizes\(el,d,uiScale\)/);assert.match(html,/applyPlacedTextSizes\(el,display,scale\)/);assert.match(html,/const nameFontSize=px\(d.nameFontSize\|\|13\)\*\(window.JijinDesktop\?renderScale:uiRenderScale\)/);
});
