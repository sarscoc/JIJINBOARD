import {test} from 'node:test';import assert from 'node:assert/strict';import {deviceSession,consumeDeviceTicket} from '../src/device-session.js';
function store(){const values=new Map();let queue=Promise.resolve();const tx={get:async k=>structuredClone(values.get(k)),put:async(k,v)=>values.set(k,structuredClone(v)),delete:async k=>values.delete(k)};return {transaction(fn){const next=queue.then(()=>fn(tx));queue=next.catch(()=>{});return next}}}
test('an open connection owns the PL indefinitely; tabs on that device and other PLs remain independent',async()=>{
 const db=store(),one={playerId:'room/pl',deviceId:'laptop',tabId:'a'};
 const admitted=await deviceSession(db,one,0);assert.equal(admitted.status,200);const first=await consumeDeviceTicket(db,admitted.body.ticket,1);let sessions=[first];
 assert.equal((await deviceSession(db,{...one,deviceId:'phone'},3600000,sessions)).status,409,'idle open connections do not expire');
 assert.equal((await deviceSession(db,{...one,playerId:'room/other',deviceId:'phone'},3600000,sessions)).status,200);
 const tab=await deviceSession(db,{...one,tabId:'b'},3600000,sessions);sessions.push(await consumeDeviceTicket(db,tab.body.ticket,3600001,sessions));
 sessions=sessions.filter(p=>p.session_tab_id!=='a');await deviceSession(db,{...one,action:'release'},3600002,sessions);
 assert.equal((await deviceSession(db,{...one,deviceId:'phone'},3600003,sessions)).status,409);
 sessions=[];await deviceSession(db,{...one,tabId:'b',action:'release'},3600004);assert.equal((await deviceSession(db,{...one,deviceId:'phone'},3600005,sessions)).status,200);
});
test('simultaneous entry has one winner; abandoned admission expires and tickets are single-use',async()=>{
 const db=store(),a={playerId:'pl',deviceId:'a',tabId:'1'},b={...a,deviceId:'b'};
 const result=await Promise.all([deviceSession(db,a,0),deviceSession(db,b,0)]);assert.deepEqual(result.map(r=>r.status),[200,409]);
 const phone=await deviceSession(db,b,30001);assert.equal(phone.status,200);assert.equal(await consumeDeviceTicket(db,result[0].body.ticket,30002),null);
 const session=await consumeDeviceTicket(db,phone.body.ticket,30002);assert.equal(session.session_device_id,'b');assert.equal(await consumeDeviceTicket(db,phone.body.ticket,30003),null);
 await deviceSession(db,{...a,action:'release'},30003,[session]);assert.equal((await deviceSession(db,a,30004,[session])).status,409);
});
