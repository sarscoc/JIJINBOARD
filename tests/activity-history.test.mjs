import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../realtime-worker/src/index.js',import.meta.url),'utf8');
const RoomHub=runInNewContext(source.replace(/^import .*\n/,'').replace('export class','class').split('export default')[0]+'\nRoomHub',{
  DurableObject:class{constructor(ctx){this.ctx=ctx}},URL,Response,console
});

test('a new RoomHub instance replays the most recent 50 updates saved with nobody connected',async()=>{
  const values=new Map();
  const storage={
    get:async key=>values.get(key),
    put:async(key,value)=>values.set(key,value),
    delete:async key=>values.delete(key),
    transaction:async callback=>callback(storage)
  };
  const ctx={storage,getWebSockets:()=>[]};
  const hub=new RoomHub(ctx);
  for(let id=0;id<52;id++){
    const activity={kind:'placement',id:String(id),templateId:'map',itemId:'pc'};
    await hub.fetch(new Request('https://room/notify',{method:'POST',body:JSON.stringify({action:'matrix-point',activity})}));
  }
  const restarted=new RoomHub(ctx);
  let received;
  const socket={send:raw=>{received=JSON.parse(raw)}};
  await restarted.webSocketMessage(socket,JSON.stringify({type:'activity-history'}));
  assert.equal(received.type,'activity-history');
  assert.equal(received.data.length,50);
  assert.equal(received.data[0].id,'51');
  assert.equal(received.data.at(-1).id,'2');
  assert.ok(received.data.every(row=>Number.isFinite(row.at)));
  await restarted.fetch(new Request('https://room/deleted',{method:'POST'}));
  await restarted.webSocketMessage(socket,JSON.stringify({type:'activity-history'}));
  assert.deepEqual(received.data,[]);
});
