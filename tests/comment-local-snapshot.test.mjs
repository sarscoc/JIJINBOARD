import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=p=>readFileSync(new URL('../public/'+p,import.meta.url),'utf8');
function setup(t){const dom=new JSDOM('',{url:'https://test/board/?id=one',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;w.crypto.randomUUID=()=> 'client';w.eval(source('shared/data-sync.js'));w.eval(source('shared/comments.js'));return w}
test('a previous comment list appears before the fresh response, including after a new controller is created',async t=>{
 const w=setup(t);let current=[],release;
 const options={key:()=> 'room-and-viewer',snapshot:()=>({comments:current})};
 const first=w.JijinComments.loader(async()=>({comments:[{id:'saved',body:'Saved comment'}]}),data=>current=data.comments,options);await first();
 current=[];const next=w.JijinComments.loader(()=>new Promise(resolve=>release=resolve),data=>current=data.comments,options);
 const pending=next();assert.equal(current[0].body,'Saved comment');release({comments:[{id:'saved',body:'Edited'}]});await pending;assert.equal(current[0].body,'Edited');
});
test('deleted comments update the saved snapshot and remain deleted when an older GET finishes',async t=>{
 const w=setup(t);let rows=[{id:'a'}],release;
 const opts={key:()=> 'room',snapshot:()=>({comments:rows})};
 const load=w.JijinComments.loader(()=>new Promise(resolve=>release=resolve),data=>rows=data.comments,opts);const pending=load();load.patch(()=>rows=[]);release({comments:[{id:'a'}]});await pending;assert.equal(rows.length,0);
 const second=w.JijinComments.loader(()=>new Promise(()=>{}),data=>rows=data.comments,opts);rows=[{id:'sentinel'}];second();assert.equal(rows.length,0);
});
test('saved lists do not cross viewer scopes or dataset generations',async t=>{
 const w=setup(t);let rows=[],key='viewer-a';const opts={key:()=>key,snapshot:()=>({comments:rows})};
 await w.JijinComments.loader(async()=>({comments:[{id:'private-reaction'}]}),data=>rows=data.comments,opts)();
 key='viewer-b';rows=[];w.JijinComments.loader(()=>new Promise(()=>{}),data=>rows=data.comments,opts)();assert.equal(rows.length,0);
 key='viewer-a';w.localStorage.setItem('jijin.dataset.generation.v1','new-generation');rows=[];w.JijinComments.loader(()=>new Promise(()=>{}),data=>rows=data.comments,opts)();assert.equal(rows.length,0);
});
test('an older response cannot replace a newer saved comment snapshot',async t=>{
 const w=setup(t);let snapshot={comments:[{id:'latest'}],version:10};const options={key:()=> 'versioned',snapshot:()=>snapshot};
 const seed=w.JijinComments.loader(async()=>snapshot,data=>snapshot=data,options);await seed();
 const refresh=w.JijinComments.loader(async()=>({comments:[{id:'older'}],version:9}),data=>snapshot=data,options);await refresh();assert.equal(snapshot.comments[0].id,'latest');
});
