import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {handleRoomLogMeta} from '../src/room-log-meta.js';
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
