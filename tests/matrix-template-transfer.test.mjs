import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const source=readFileSync(new URL('../public/matrix/matrix-template-transfer.js',import.meta.url),'utf8');
const tick=()=>new Promise(setImmediate);

test('copy appends fresh templates to the selected board and resumes without copying completed items twice',async t=>{
 const dom=new JSDOM('<div id="displaySettingsBody"></div>',{url:'https://test/matrix/?board=source',runScripts:'outside-only'});
 t.after(()=>dom.window.close());
 const w=dom.window,writes=[];
 const templates=['A','B'].map(name=>({record:{id:'old-'+name,name,dataUrl:''},templateState:{display:{},items:{pc:{placed:true,x:5,comment:name}}}}));
 w.matrixBoardContext={boardId:'source',profile:()=>({id:'pl',plName:'PL'}),async api(path,options){
  if(path.includes('/boards/source/'))return {templates};
  if(options?.method==='PUT'){
   writes.push({path,body:JSON.parse(options.body)});
   if(writes.length===2)throw new Error('timeout');
  }
  return {};
 }};
 w.eval(source);
 const form=w.document.querySelector('form'),status=w.document.querySelector('[role=status]');
 form.querySelector('input').value='https://test/board/?id=destination';
 form.requestSubmit();await tick();
 assert.match(status.textContent,/1\/2件/);
 form.requestSubmit();await tick();
 assert.equal(status.textContent,'2件を追加しました。');
 assert.equal(writes.length,3);
 assert.equal(writes[1].path,writes[2].path);
 assert.match(writes[0].path,/^\/api\/boards\/destination\/matrix\/destination\/templates\/[\w-]+$/);
 assert.equal(writes[0].body.baseRevision,null);
 assert.equal(writes[0].body.record.id,undefined);
 assert.equal(writes[0].body.templateState.items.pc.comment,'A');
});
