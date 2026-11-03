import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
test('question popup reserves all portraits and sizes answers before any image finishes',async t=>{
 const dom=new JSDOM('<div id="questionPopup"><div class="modal"><div class="modal-head"><b id="questionPopupTitle"></b><button>×</button></div><div class="modal-body"><span id="questionPopupMeta"></span><div id="questionPopupAnswers"></div></div></div></div><div id="characterDesignModal"><div class="modal-body"></div></div><button id="characterDesignBtn"></button>',{url:'https://test/spreadsheet/?board=b',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window,d=w.document;let sizes=0,openedMode='',loads=[];
 w.state={layout:{},characters:[{id:'a',name:'A'},{id:'b',name:'B'},{id:'c',name:'C'}]};
 w.loadImageBlob=(_,id)=>new Promise(resolve=>loads.push({id,resolve}));w.autoGrowQuestionTextareas=()=>sizes++;w.saveLayoutState=()=>{};w.openCharacterDesign=()=>{};w.URL.createObjectURL=()=> 'blob:portrait';w.URL.revokeObjectURL=()=>{};
 w.openQuestionPopup=()=>{openedMode=d.getElementById('questionPopup').dataset.answerPresentation;d.getElementById('questionPopupAnswers').innerHTML=w.state.characters.map(c=>`<div class="question-popup-row"><div class="question-popup-answer"><textarea data-popup-char="${c.id}">Answer</textarea></div></div>`).join('')};
 w.eval(readFileSync(new URL('../public/spreadsheet/question-presentation.js',import.meta.url),'utf8'));w.openQuestionPopup({key:'question'});
 assert.equal(openedMode,'bubble');assert.equal(loads.length,3);assert.equal(d.querySelectorAll('.question-portrait-fallback').length,3);assert.equal(sizes,1);
 loads.forEach(x=>x.resolve(new Blob(['portrait'])));await new Promise(setImmediate);
 assert.equal(d.querySelectorAll('img.question-portrait').length,3);assert.equal(sizes,1);
 // Slow results from an older opening must not be inserted into the current answers.
 w.openQuestionPopup({key:'older'});const older=loads.slice(3);w.openQuestionPopup({key:'newer'});older.forEach(x=>x.resolve(new Blob(['old'])));await new Promise(setImmediate);
 assert.equal(d.querySelectorAll('img.question-portrait').length,0);assert.equal(d.querySelectorAll('.question-portrait-fallback').length,3);
});

test('chart dropdown uses current answers and restores editable bubbles without losing text',async t=>{
 const dom=new JSDOM('<div id="questionPopup"><div class="modal"><div class="modal-head"><button>×</button></div><div class="modal-body"><span id="questionPopupMeta"></span><div id="questionPopupAnswers"></div></div></div></div><div id="characterDesignModal"><div class="modal-body"></div></div><button id="characterDesignBtn"></button>',{url:'https://test/',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window,d=w.document;
 w.state={layout:{},characters:[{id:'a',name:'A'}]};w.loadImageBlob=async()=>null;w.autoGrowQuestionTextareas=()=>{};w.saveLayoutState=()=>{};w.openCharacterDesign=()=>{};
 w.openQuestionPopup=()=>{d.getElementById('questionPopupAnswers').innerHTML='<div class="question-popup-row"><div class="question-popup-answer"><textarea data-popup-char="a">200（ヒール込み）</textarea></div></div>'};
 for(const file of ['question-charts.js','question-presentation.js'])w.eval(readFileSync(new URL('../public/spreadsheet/'+file,import.meta.url),'utf8'));
 w.openQuestionPopup({key:'height'});const select=d.querySelector('.question-graph-select');select.value='bar-vertical';select.dispatchEvent(new w.Event('change'));
 assert.equal(d.getElementById('questionPopupAnswers').hidden,true);assert.match(d.querySelector('.question-chart').textContent,/200/);
 d.querySelector('[data-presentation="bubble"]').click();assert.equal(d.querySelector('.question-chart'),null);assert.equal(d.getElementById('questionPopupAnswers').hidden,false);assert.equal(d.querySelector('textarea').value,'200（ヒール込み）');
});
