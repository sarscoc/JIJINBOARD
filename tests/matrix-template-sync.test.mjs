import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../public/matrix/matrix-template-sync.js',import.meta.url),'utf8');
const tick=async()=>{for(let i=0;i<12;i++)await new Promise(setImmediate)};
function fixture(){
  let states={},live={display:{color:'white'},items:{}},remoteApplying=false;
  const records=new Map(),timers=new Map(),listeners=new Map(),storage=new Map(),calls=[],alerts=[];
  const remote={record:{id:'tpl',name:'server',revision:'r1',dataUrl:''},templateState:{display:{color:'blue'},items:{pc:{placed:true,x:12}}}};
  let serial=1,putHandler=async body=>({record:{...body.record,revision:`r${++serial}`}});
  const context={document:{addEventListener(){}},URL,TextEncoder,structuredClone,console:{...console,warn(){}},queueMicrotask,location:{href:'https://test/matrix/?board=board&room=log'},
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    setTimeout(fn,delay){const id=Symbol();timers.set(id,{fn,delay});return id},clearTimeout:id=>timers.delete(id),
    alert:message=>alerts.push(message),fetch:async()=>{},
    tplSetRecord:async(id,record)=>records.set(id,record),tplAllRecords:async()=>[...records.values()],tplGetRecord:async id=>records.get(id),tplDeleteRecord:async id=>records.delete(id),
    templateStates:()=>structuredClone(states),setTemplateStates:value=>{states=structuredClone(value)},currentTemplateId:()=> 'tpl',
    saveCurrentTemplateState(){states.tpl=structuredClone(live)},saveTemplateFile:Object.assign(()=>{},{__jijinTemplateOptimized:true}),
    async restoreTemplate(){live=structuredClone(states.tpl);context.saveCurrentTemplateState()},
    matrixBoardContext:{roomId:'log',profile:()=>({id:'pl',plName:'PL'}),isApplyingRemote:()=>remoteApplying,notifyChange(){},async api(path,options={}){calls.push({path,...options});if(options.method==='PUT')return putHandler(JSON.parse(options.body));return {templates:[structuredClone(remote)]}}},
    addEventListener(name,fn){listeners.set(name,fn)}
  };
  context.window=context;
  vm.runInNewContext(source,context);
  return {context,calls,alerts,storage,remote,setLive:state=>{live=structuredClone(state)},setRemoteApplying:value=>{remoteApplying=value},setPutHandler:fn=>{putHandler=fn},async edit(color){live.display.color=color;context.saveCurrentTemplateState();await tick()},async flush(){for(const [id,timer] of [...timers]){timers.delete(id);timer.fn()}await tick()},refresh:()=>listeners.get('matrix-board-comments-changed')({detail:{action:'matrix-template-state'}}),puts:()=>calls.filter(c=>c.method==='PUT').map(c=>JSON.parse(c.body))};
}

test('hydration and remote updates never upload historical local settings',async()=>{
  const f=fixture();await tick();await f.flush();assert.equal(f.puts().length,0);
  f.setRemoteApplying(true);await f.edit('stale');await f.flush();assert.equal(f.puts().length,0);
  f.setRemoteApplying(false);f.refresh();await tick();await f.flush();assert.equal(f.puts().length,0);
});

test('saves are serialized and the next edit uses the acknowledged revision',async()=>{
  const f=fixture();await tick();let resolveFirst;
  f.setPutHandler(body=>new Promise(resolve=>{resolveFirst=()=>resolve({record:{...body.record,revision:'r2'}})}));
  await f.edit('red');await f.flush();assert.equal(f.puts().length,1);
  await f.edit('green');await f.flush();assert.equal(f.puts().length,1);
  f.refresh();await tick();assert.equal(f.calls.filter(c=>!c.method).length,1,'refresh must wait for unsaved edits');
  f.setPutHandler(async body=>({record:{...body.record,revision:'r3'}}));resolveFirst();await tick();
  assert.equal(f.puts().length,2);assert.equal(f.puts()[0].baseRevision,'r1');assert.equal(f.puts()[1].baseRevision,'r2');assert.equal(f.puts()[1].templateState.display.color,'green');
});

test('conflicts stop queued stale writes, back up the edit, and reload',async()=>{
  const f=fixture();await tick();let rejectFirst;
  f.setPutHandler(()=>new Promise((resolve,reject)=>{rejectFirst=()=>reject(Object.assign(new Error('conflict'),{status:409}))}));
  await f.edit('red');await f.flush();await f.edit('green');
  f.remote.record.revision='remote-r2';f.remote.templateState.display.color='remote';
  rejectFirst();await tick();await f.flush();
  assert.equal(f.puts().length,1);assert.equal(f.alerts.length,1);
  assert.equal(JSON.parse(f.storage.get('jijinboardTemplateSaveRecovery:board:tpl')).templateState.display.color,'green');
  assert.equal(f.calls.filter(c=>!c.method).length,3);
});


test('newest uploads come first and editing does not change their order',async()=>{
 const f=fixture();await tick();
 await f.context.tplSetRecord('new',{id:'new',createdAt:200,updatedAt:1});
 await f.context.tplSetRecord('old',{id:'old',createdAt:100,updatedAt:999});
 const first=(await f.context.tplAllRecords()).map(r=>r.id);
 await f.context.tplSetRecord('new',{id:'new',createdAt:200,updatedAt:99999});
 assert.deepEqual((await f.context.tplAllRecords()).map(r=>r.id),first);
 assert.ok(first.indexOf('new')<first.indexOf('old'));
});

test('loading the template sync script twice installs only one save controller',async()=>{
 const f=fixture();await tick();const setter=f.context.tplSetRecord;
 vm.runInNewContext(source,f.context);await tick();assert.equal(f.context.tplSetRecord,setter);
 await f.edit('red');await f.flush();assert.equal(f.puts().length,1);
});

test('coordinate-only saves do not rewrite template metadata or its revision',async()=>{
 const f=fixture();await tick();f.setLive({...f.remote.templateState,savedAt:123,items:{pc:{placed:true,x:90,y:50}}});
 f.context.saveCurrentTemplateState();await tick();await f.flush();assert.equal(f.puts().length,0);
});
test('disjoint concurrent display changes rebase using the new revision',async()=>{
 const f=fixture();await tick();let attempt=0;
 f.setPutHandler(async body=>{if(!attempt++){f.remote.record.revision='remote-r2';f.remote.templateState.display.other='remote';throw Object.assign(new Error('conflict'),{status:409})}return {record:{...body.record,revision:'r3'}}});
 await f.edit('red');await f.flush();
 assert.equal(f.puts().length,2);assert.equal(f.puts()[1].baseRevision,'remote-r2');
 assert.equal(f.puts()[1].templateState.display.color,'red');assert.equal(f.puts()[1].templateState.display.other,'remote');assert.equal(f.alerts.length,0);
});


test('local stacking changes do not increment the shared template revision',async()=>{
 const f=fixture();await tick();
 const saved=f.context.templateStates().tpl;saved.items.pc.zOrder=99;f.setLive(saved);
 f.context.saveCurrentTemplateState();await tick();await f.flush();
 assert.equal(f.puts().length,0);
});
