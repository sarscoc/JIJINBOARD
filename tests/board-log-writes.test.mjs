import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {handleRoomLogMeta} from '../src/room-log-meta.js';
import {createStreamRoom,handleLogStream} from "../src/log-stream.js";
import {tokenHash} from "../src/data-model.js";

const board = readFileSync(new URL('../public/board/board2.js',import.meta.url),'utf8');
test('a committed upload and deletion update the current list without reading the board',async()=>{
 const state={board:{logs:[{roomId:'old'}]},editingRoom:'old',opened:{}};
 const requests=[],opened=[];
 const api=async(path,options)=>{requests.push(options?.method);assert.equal(options?.method,'DELETE')};
 const logHandlers=[
  board.match(/function attachRoom\([\s\S]*?\n\}/)[0],
  board.match(/^async function removeLog\(.*$/m)[0],
  board.match(/function patchBoardLogs\([\s\S]*?\n\}/)[0]
 ].join('\n');
 const run=new Function('state','api','boardId','adminToken','openLog','saveOpened','renderLogs','confirm','localStorage','alert','$','refreshBoardMeta',logHandlers+'\nreturn {attachRoom,removeLog}');
 const actions=run(state,api,'b',()=> 'token',id=>opened.push(id),()=>{},()=>{},()=>true,{removeItem(){}},assert.fail,()=>({close(){}}),null);
 actions.attachRoom({roomId:'new',title:'New'});
 await actions.removeLog();
 assert.deepEqual(state.board.logs.map(log=>log.roomId),['new']);
 assert.deepEqual(opened,['new']);
 assert.deepEqual(requests,['DELETE']);
});

test('log deletion commits before waiting for file cleanup',async()=>{
 let release;
 const blocked=new Promise(resolve=>{release=resolve});
 const tasks=[],batches=[];
 const DB={
  prepare(sql){return {sql,bind(){return this},async first(){
   if(sql.includes('room_admin_token_hash'))return {room_admin_token_hash:hash};
   return {};
  },async all(){return {results:[]}}}},
  async batch(statements){batches.push(statements.map(statement=>statement.sql))}
 };
 const token="test-token",hash=await tokenHash(token);
 const env={DB,LOGS:{list:()=>blocked}};
 const request=new Request('https://test/api/boards/b/logs/l',{method:'DELETE',headers:{'x-board-admin-token':token}});
 try{
  const response=await handleRoomLogMeta(request,env,'b','l',{waitUntil:task=>tasks.push(task)});
  assert.equal(response.status,200);
  assert.match(batches[0][1],/DELETE FROM log/);
  assert.equal(tasks.length,1);
 }finally{release({objects:[],truncated:false});await Promise.all(tasks)}
});

test('an upload publishes the log and its chunk index together after writing the files',async()=>{
 const events=[];
 const hash=await tokenHash('test-token');
 const DB={
  prepare(sql){return {sql,bind(){return this},async first(){
   return sql.includes('room_admin_token_hash')?{room_admin_token_hash:hash}:{value:-1};
  }}},
  async batch(statements){events.push(statements.map(statement=>statement.sql.match(/INSERT INTO (\w+)/)[1]))}
 };
 const env={DB,LOGS:{async put(){events.push('body stored')}}};
 const request=new Request('https://test/api/rooms',{method:'POST',headers:{'x-board-admin-token':'test-token'},body:JSON.stringify({boardId:'b',messages:[{id:'m1',text:'Hello'}]})});
 assert.equal((await createStreamRoom(request,env)).status,201);
 assert.deepEqual(events,['body stored',['log','log_tab','log_chunk']]);
});

test('a log with no chunk index reads remaining files, and reports when none are left',async()=>{
 const key='rooms/b/logs/l/tabs/t/chunk-0001.json';
 const DB={prepare(sql){return {bind(){return this},async first(){return {log_id:'l',room_id:'b'}},async all(){return {results:[{tab_id:'t',tab_name:'Main',chunk_count:0}]}}}}};
 let exists=true;
 const env={DB,LOGS:{
  async list({prefix}){assert.equal(prefix,'rooms/b/logs/l/tabs/');return {objects:exists?[{key}]:[]}},
  async get(requested){assert.equal(requested,key);return {text:async()=>JSON.stringify({lines:[{line_id:'m1',message_body:'Hello'}]})}}
 }};
 const request=new Request('https://test/api/rooms/l');
 const response=await handleLogStream(request,env,'l','full');
 assert.deepEqual((await response.json()).messages.map(message=>[message.id,message.tab,message.text]),[['m1','Main','Hello']]);
 exists=false;
 assert.equal((await handleLogStream(request,env,'l','full')).status,404);
});
