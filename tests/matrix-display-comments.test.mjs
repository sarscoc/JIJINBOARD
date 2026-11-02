import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
test('cached token comments never overlay shared state, while explicit edits and deletions still save',async()=>{
 let live={items:{pc:{comment:'',placed:true}}};const storage=new Map([['magiaMatrix.displayComments.v2',JSON.stringify({tpl:{pc:{comment:'old text',commentPosition:'top'}}})]]),saves=[];
 const context={structuredClone,console,alert(){},window:null,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
  appState:()=>structuredClone(live),templateStates:()=>({tpl:structuredClone(live)}),currentTemplateId:()=> 'tpl',
  mutate(fn){const value=context.appState();fn(value);live=structuredClone(value)},
  matrixBoardContext:{async savePoint(id,item){saves.push({id,item});return true}}};context.window=context;
 vm.runInNewContext(readFileSync(new URL('../public/matrix/matrix-display-comment-persistence.js',import.meta.url),'utf8'),context);
 assert.equal(context.appState().items.pc.comment,'');assert.equal(saves.length,0,'startup must not upload cached comments');
 context.mutate(s=>{s.items.pc.comment='new text'});await new Promise(setImmediate);
 assert.equal(saves.length,1);assert.equal(saves[0].item.comment,'new text');assert.equal(saves[0].item.baseComment,'');
 context.mutate(s=>{s.items.pc.comment=''});await new Promise(setImmediate);
 assert.equal(saves.length,2);assert.equal(saves[1].item.comment,'');assert.equal(saves[1].item.baseComment,'new text');
 live.items.pc.comment='';assert.equal(context.appState().items.pc.comment,'','remote deletion remains authoritative');
 context.mutate(s=>{s.items.pc.x=80});await new Promise(setImmediate);assert.equal(saves.length,2,'a position edit must not rewrite a comment');
});
