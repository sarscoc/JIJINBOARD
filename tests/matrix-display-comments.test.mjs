import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
test('legacy token comments remain visible and new edits persist without throwing',async()=>{
 let live={items:{pc:{comment:'',placed:true}}};const storage=new Map([['magiaMatrix.displayComments.v2',JSON.stringify({tpl:{pc:{comment:'old text',commentPosition:'top'}}})]]),saves=[];
 const context={structuredClone,console,setTimeout(){},window:null,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
  appState:()=>structuredClone(live),templateStates:()=>({tpl:structuredClone(live)}),currentTemplateId:()=> 'tpl',
  mutate(fn){const value=context.appState();fn(value);live=structuredClone(value)},saveState:s=>{live=structuredClone(s)},saveCurrentTemplateState(){},items:[],renderPlaced(){},addEventListener(){},
  matrixBoardContext:{async savePoint(id,item){saves.push({id,item});return true}}};context.window=context;
 vm.runInNewContext(readFileSync(new URL('../public/matrix/matrix-display-comment-persistence.js',import.meta.url),'utf8'),context);
 assert.equal(context.appState().items.pc.comment,'old text');
 context.mutate(s=>{s.items.pc.comment='new text'});await new Promise(setImmediate);
 assert.equal(saves.length,1);assert.equal(saves[0].item.comment,'new text');
 assert.equal(JSON.parse(storage.get('magiaMatrix.displayComments.v2')).tpl.pc.comment,'new text');
 live.items.pc.comment='';assert.equal(context.appState().items.pc.comment,'','an acknowledged comment must not resurrect after remote deletion');
});
