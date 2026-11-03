import {test} from 'node:test';import assert from 'node:assert/strict';import {notifyResource,resourceAction} from '../src/resource-notify.js';
test('resource mutations notify only after success; reads and failed writes do not broadcast',async()=>{
 const events=[],env={ROOMS:{idFromName:x=>x,get:()=>({fetch:async(url,init)=>events.push(JSON.parse(init.body))})}};
 const request=new Request('https://test/api/boards/b/matrix/r/points/p',{method:'PATCH'});
 await notifyResource(request,new Response('{}',{status:500}),env);assert.equal(events.length,0);
 await notifyResource(request,new Response(JSON.stringify({point:{itemId:'p',x:12}})),env);assert.equal(events[0].action,'matrix-point');assert.equal(events[0].data.x,12);
 await notifyResource(new Request(request.url),new Response('{}'),env);assert.equal(events.length,1);
 assert.equal(resourceAction('/api/boards/b/players/p/session'),'');assert.equal(resourceAction('/api/boards/b/matrix/r/templates/t'),'matrix-template-state');
});
test('small committed sheet snapshots are sent directly; large snapshots invalidate without being truncated',async()=>{
 const events=[],env={ROOMS:{idFromName:x=>x,get:()=>({fetch:async(url,init)=>events.push(JSON.parse(init.body))})}};
 for(const text of ['short','x'.repeat(7000)]){const req=new Request('https://test/api/boards/b/spreadsheet/state',{method:'POST',body:JSON.stringify({state:{text},baseRevision:'before'})});await notifyResource(req,new Response(JSON.stringify({revision:'after'})),env,null,req.clone())}
 assert.equal(events[0].data.state.text,'short');assert.equal(events[0].data.revision,'after');assert.equal(events[1].data,null);
});
