import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync('public/spreadsheet/question-charts.js','utf8');
function fixture(t){const dom=new JSDOM('',{runScripts:'outside-only'});t.after(()=>dom.window.close());dom.window.eval(source);return dom.window.JijinQuestionCharts}
test('numeric answers keep the leading value and ignore bracketed supplementary numbers',t=>{
 const charts=fixture(t),data=charts.dataset([{label:'A',text:'200（ヒール込み）'},{label:'B',text:'181（全長2m）'},{label:'C',text:'１７０ cm（義足込）'},{label:'D',text:''}]);
 assert.equal(data.numeric,true);assert.deepEqual(Array.from(data.values,e=>e.value),[200,181,170]);assert.equal(data.values[0].answer,'200（ヒール込み）');
});
test('text and mixed answers count exact responses without extracting incidental numbers',t=>{
 const charts=fixture(t),data=charts.dataset([{text:'紅茶'},{text:'紅茶'},{text:'水'},{text:'第2形態'},{text:''}]);
 assert.equal(data.numeric,false);assert.deepEqual(Array.from(data.values,e=>[e.label,e.value]),[['紅茶',2],['水',1],['第2形態',1]]);
});
test('all chart types render safely and invalid pie values show an explanation',t=>{
 const charts=fixture(t),entries=[{label:'<img onerror=bad>',text:'200（ヒール込み）'},{label:'B',text:'181（全長2m）'}];
 for(const mode of ['bar-vertical','bar-horizontal','pie']){const view=charts.render(entries,mode);assert.ok(view.querySelector('svg'));assert.equal(view.querySelector('img'),null);assert.match(view.textContent,/200/)}
 assert.equal(charts.render([{label:'A',text:'-1'}],'pie').querySelector('svg'),null);
 assert.equal(charts.render([],'pie').querySelector('svg'),null);
});
