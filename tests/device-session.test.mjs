import {test} from 'node:test';import assert from 'node:assert/strict';import {deviceSession} from '../src/device-session.js';
function store(){const values=new Map();let queue=Promise.resolve();const tx={get:async k=>structuredClone(values.get(k)),put:async(k,v)=>values.set(k,structuredClone(v)),delete:async k=>values.delete(k)};return {transaction(fn){const next=queue.then(()=>fn(tx));queue=next.catch(()=>{});return next}}}
test('transferred PL uses one device; other PLs and tabs on the same device remain independent',async()=>{
 const db=store(),one={playerId:'room/pl',deviceId:'laptop',tabId:'a'};
 assert.equal((await deviceSession(db,one,0)).status,200);assert.equal((await deviceSession(db,{...one,deviceId:'phone'},1)).status,409);
 assert.equal((await deviceSession(db,{...one,playerId:'room/other',deviceId:'phone'},1)).status,200);
 await deviceSession(db,{...one,tabId:'b'},2);await deviceSession(db,{...one,action:'release'},3);
 assert.equal((await deviceSession(db,{...one,deviceId:'phone'},4)).status,409);
 await deviceSession(db,{...one,tabId:'b',action:'release'},5);assert.equal((await deviceSession(db,{...one,deviceId:'phone'},6)).status,200);
});
test('simultaneous claims have one winner; expired sessions recover and late releases cannot evict another device',async()=>{
 const db=store(),a={playerId:'pl',deviceId:'a',tabId:'1'},b={...a,deviceId:'b'};
 const result=await Promise.all([deviceSession(db,a,0),deviceSession(db,b,0)]);assert.deepEqual(result.map(r=>r.status),[200,409]);
 assert.equal((await deviceSession(db,b,45001)).status,200);await deviceSession(db,{...a,action:'release'},45002);assert.equal((await deviceSession(db,a,45003)).status,409);
});
