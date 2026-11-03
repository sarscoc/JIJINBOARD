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
