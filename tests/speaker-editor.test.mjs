import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {roomFixture} from './helpers/room-db.mjs';
import {handleRoomPlayers} from '../src/room-players.js';
import {handleRoomLogMeta} from '../src/room-log-meta.js';
const source=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const tick=()=>new Promise(setImmediate);
const req=(method,data,token='')=>new Request('https://test/api',{method,headers:{'content-type':'application/json','x-player-token':token},...(data?{body:JSON.stringify(data)}:{})});

test('player writes notify after persistence; failed auth and reads do not notify',async t=>{
 const f=roomFixture(t),events=[];
 f.env.ROOMS={idFromName:id=>id,get:id=>({fetch:async(url,options)=>{events.push({id,...JSON.parse(options.body),rows:f.db.prepare('SELECT count(*) AS n FROM pl').get().n});return new Response('{}')}})};
 const made=await (await handleRoomPlayers(req('POST',{playerId:'p',plName:'PL'}),f.env,'one')).json();
 assert.equal(events.length,1);assert.equal(events[0].rows,1);assert.equal(events[0].action,'participants');
 await handleRoomPlayers(req('GET',null,made.accessToken),f.env,'one',['p']);
 await handleRoomPlayers(req('PUT',{plName:'bad'},'wrong'),f.env,'one',['p']);assert.equal(events.length,1);
 f.env.ROOMS.get=()=>{throw Error('offline')};
 const oldWarn=console.warn;console.warn=()=>{};
 try{assert.equal((await handleRoomPlayers(req('PUT',{plName:'Saved'},made.accessToken),f.env,'one',['p'])).status,200)}finally{console.warn=oldWarn}
});

test('another device receives names, colors and an empty PC list without reloading',async t=>{
 const f=roomFixture(t),sockets=[];
 const made=await (await handleRoomPlayers(req('POST',{playerId:'p',plName:'PL'}),f.env,'one')).json();
 f.env.ROOMS={idFromName:id=>id,get:()=>({fetch:async(url,options)=>{const data=JSON.parse(options.body);for(const socket of sockets)socket.dispatchEvent(new socket.w.MessageEvent('message',{data:JSON.stringify({type:'refresh',...data})}));return new Response('{}')}})};
 function client(){
  const dom=new JSDOM('',{url:'https://test/log/?board=one&room=log-one',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;
  w.eval(source('shared/room-storage.js'));
  w.localStorage.setItem('trpgMarkerProfile',JSON.stringify({id:'p',plName:'PL'}));w.localStorage.setItem('jijinboardPlayerMasterId.v1','p');w.localStorage.setItem('jijinboardPlayerMasterToken.v1',made.accessToken);
  w.eval(`var state={roomId:'log-one',profile:{id:'p',plName:'PL',personas:[]}};window.view=()=>state.profile;function saveProfile(){}function renderPlIcon(){}function renderPersonas(){}function fillPersonaSelect(){}function emitIntegratedProfile(){}function heartbeatPresence(){}`);
  class Socket extends w.EventTarget{readyState=1;constructor(){super();this.w=w;sockets.push(this);w.setTimeout(()=>this.dispatchEvent(new w.Event('open')),0)}close(){this.readyState=3}}
  w.WebSocket=Socket;
  w.fetch=async(path,options={})=>{const parts=new URL(path,'https://test').pathname.split('/').slice(5);return handleRoomPlayers(new Request('https://test'+path,options),f.env,'one',parts)};
  w.eval(source('shared/player-master.js'));return w;
 }
 const a=client(),b=client();await Promise.all([a.JIJINPlayerMaster.bootstrap(),b.JIJINPlayerMaster.bootstrap()]);
 for(let i=0;i<30&&sockets.length<2;i++)await new Promise(r=>setTimeout(r,5));
 assert.equal(sockets.length,2);
 await a.JIJINPlayerMaster.updateProfile({plName:'Renamed',plColor:'#112233',plColorDark:'#334455',characters:[{id:'pc',type:'PC',name:'New PC',color:'#aabbcc'}]});
 for(let i=0;i<15&&b.view().personas.length!==1;i++)await tick();
 assert.equal(b.view().plName,'Renamed');assert.equal(b.view().plColorDark,'#334455');assert.equal(b.view().personas[0].name,'New PC');
 await a.JIJINPlayerMaster.deleteCharacter('pc');for(let i=0;i<15&&b.view().personas.length;i++)await tick();
 assert.deepEqual(JSON.parse(JSON.stringify(b.view().personas)),[]);assert.deepEqual(JSON.parse(b.localStorage.getItem('personas:log-one')),[]);
});

test('inline settings have no LOG frame; saves serialize and empty snapshots clear rows',async t=>{
 const dom=new JSDOM('<div id="editor"></div>',{url:'https://test/board/?id=one',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;w.structuredClone=structuredClone;
 let master={plName:'PL',characters:[{id:'pc',type:'PC',name:'PC'}]},release,calls=[];
 w.JIJINPlayerMaster={get master(){return master},async refresh(){return master},async updateProfile(body){calls.push(body);if(calls.length===1)await new Promise(r=>release=r);master={...body};return master}};
 w.eval(source('board/speaker-editor.js'));const editor=w.JijinSpeakerEditor(w.document.querySelector('#editor'));await editor.open();assert.equal(w.document.querySelector('iframe'),null);
 const input=w.document.querySelector('[data-person="pc"] .speaker-name');input.value='First';input.dispatchEvent(new w.Event('input',{bubbles:true}));const save=editor.flush();await tick();
 input.value='Second';input.dispatchEvent(new w.Event('input',{bubbles:true}));release();await save;
 assert.equal(calls.length,2);assert.equal(calls[1].characters[0].name,'Second');
 master={plName:'PL',characters:[]};w.dispatchEvent(new w.Event('jijinboard-player-master-updated'));assert.equal(w.document.querySelector('[data-person="pc"]'),null);
});

test('board header only reads the room and never waits on log or participant queries',async t=>{
 const f=roomFixture(t);f.DB.queryCount=0;
 const data=await (await handleRoomLogMeta(new Request('https://test/api/boards/one?summary=1'),f.env,'one')).json();assert.equal(data.name,'ONE');assert.equal(data.logs,undefined);assert.equal(f.DB.queryCount,1);
});

test('board clears a previous PC list when an authoritative empty list arrives',t=>{
 const dom=new JSDOM('',{url:'https://test/board/?id=one',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;
 const code=source('board/board2.js'),start=code.indexOf('function storedProfileForRoom'),end=code.indexOf('function logBridge');
 w.eval(`const state={activeRoom:'log',profile:{id:'p',plName:'PL',personas:[{id:'old',name:'Old'}],__roomId:'log'}};function validPersonas(v){return Array.isArray(v)?v:[]} ${code.slice(start,end)};window.accept=acceptProfile;window.profile=()=>state.profile;`);
 w.localStorage.setItem('trpgMarkerProfile',JSON.stringify({id:'p',plName:'PL'}));w.accept({roomId:'log',profile:{id:'p',plName:'PL',personas:[]}});
 assert.deepEqual(JSON.parse(JSON.stringify(w.profile().personas)),[]);assert.equal(w.localStorage.getItem('personas:log'),'[]');
});


test('room name is painted before screenshot starts, and PL waits for screenshot outcome',async t=>{
 const dom=new JSDOM('<strong id="boardName"></strong><img id="boardHomeImage" class="hidden"><div id="boardHomeEmpty"></div>',{url:'https://test/board/?id=one',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());const w=dom.window;
 let release;w.fetch=()=>new Promise(r=>release=r);w.JijinDataset={ready:Promise.resolve()};
 w.eval(source('board/board-boot.js'));w.JijinBoardReady.startImage();
 const image=w.document.querySelector('img');assert.equal(image.getAttribute('src'),null);
 await tick();release({ok:true,json:async()=>({id:'one',name:'部屋名'})});await w.JijinBoardReady.title;await tick();
 assert.equal(w.document.querySelector('#boardName').textContent,'部屋名');assert.equal(image.getAttribute('src'),'/api/boards/one/home-image');
 let next=false;w.JijinBoardReady.image.then(()=>next=true);await tick();assert.equal(next,false);
 image.dispatchEvent(new w.Event('load'));await w.JijinBoardReady.image;assert.equal(next,true);assert.equal(image.classList.contains('hidden'),false);
});


test('failed settings save retains the edited PC and PL image across refresh and can be retried',async t=>{
 const dom=new JSDOM('<div id="editor"></div>',{url:'https://test/board/?id=one',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;w.structuredClone=structuredClone;
 let master={plName:'PL',plIcon:'/saved.png',characters:[{id:'pc',type:'PC',name:'Saved PC'}]},fail=true;
 w.JIJINPlayerMaster={get master(){return master},async refresh(){return master},setEditing(){},async updateProfile(body){if(fail)throw Error('通信エラー (500)');master={...body};return master}};
 w.eval(source('board/speaker-editor.js'));const editor=w.JijinSpeakerEditor(w.document.querySelector('#editor'));await editor.open();
 const input=w.document.querySelector('[data-person="pc"] .speaker-name');input.value='Draft PC';input.dispatchEvent(new w.Event('input',{bubbles:true}));await assert.rejects(editor.flush(),/500/);
 master={plName:'PL',characters:[]};w.dispatchEvent(new w.Event('jijinboard-player-master-updated'));await editor.open();
 assert.equal(w.document.querySelector('[data-person="pc"] .speaker-name').value,'Draft PC');assert.equal(w.document.querySelector('[data-person="PL"] img').getAttribute('src'),'/saved.png');assert.equal(w.document.querySelector('[data-retry]').hidden,false);
 fail=false;await editor.flush();assert.equal(master.characters[0].name,'Draft PC');
});
