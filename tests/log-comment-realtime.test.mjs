import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('log page loads its saved comment notification handler and applies remote creates',()=>{
 const html=readFileSync(new URL('../public/log/index.html',import.meta.url),'utf8');
 assert.match(html,/<script src="comment-incremental-sync.js"><\/script>/);
 const listeners=new Map();let refreshes=0;
 const socket={addEventListener:(name,fn)=>listeners.set(name,fn)};
 const context={state:{roomId:'log',annotations:[],room:{messages:[]},profile:{id:'viewer'},realtime:socket},
  api(){},document:{getElementById:()=>null},connectRealtime(){},queueMicrotask,console,
  refreshAnnotations:()=>refreshes++,postComment(){},deleteComment(){},toggleLike(){}};
 context.window=context;
 vm.runInNewContext(readFileSync(new URL('../public/log/comment-incremental-sync.js',import.meta.url),'utf8'),context);
 const message=data=>listeners.get('message')({data:JSON.stringify(data)});
 const event={type:'comment-change',action:'comment:create',data:{logId:'log',version:2,annotation:{id:'new',body:'remote'}}};
 const installed=context.connectRealtime;vm.runInNewContext(readFileSync(new URL('../public/log/comment-incremental-sync.js',import.meta.url),'utf8'),context);assert.equal(context.connectRealtime,installed);
 message(event);message(event);assert.equal(context.state.annotations.length,1);assert.equal(context.state.annotations[0].body,'remote');
 message({...event,data:{...event.data,logId:'other',annotation:{id:'wrong'}}});assert.equal(context.state.annotations.length,1);
 message({type:'comment-change',data:null});assert.equal(refreshes,1);
});
