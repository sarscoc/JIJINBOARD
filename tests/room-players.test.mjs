import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {roomFixture} from './helpers/room-db.mjs';
import {handleRoomPlayers} from '../src/room-players.js';
import {playerKey,characterKey,localId,servePlayerIcon} from '../src/player-address.js';
import {handleRoomParticipants} from '../src/room-participants.js';
import {handleRoomDelete} from '../src/room-delete.js';
import {tokenHash} from '../src/data-model.js';
const req=(method,data,accessToken='')=>new Request('https://test/api',{method,headers:{'x-player-token':accessToken},...(data?{body:JSON.stringify(data)}:{})});
async function register(env,board,id='same',name='PL'){
 const response=await handleRoomPlayers(req('POST',{playerId:id,plName:name,characters:[{id:'old',name:'Old cache'}]}),env,board,[]);assert.equal(response.status,201);return response.json();
}
test('same IDs in different rooms have independent PLs, PCs, images, tokens and delete records',async t=>{
 const f=roomFixture(t),one=await register(f.env,'one'),two=await register(f.env,'two');
 assert.deepEqual(one.master.characters,[],'bootstrap must not upload cache candidates');
 assert.notEqual(one.master.address,two.master.address);
 assert.equal((await handleRoomPlayers(req('GET',null,one.accessToken),f.env,'two',['same'])).status,403);
 const update=(board,token,name)=>handleRoomPlayers(req('PUT',{playerId:'same',plName:name,plIcon:'data:image/png;base64,QQ==',characters:[{id:'pc',name,icon:'data:image/png;base64,QQ=='}]},token),f.env,board,['same']);
 const a=await (await update('one',one.accessToken,'One')).json(),b=await (await update('two',two.accessToken,'Two')).json();
 assert.equal(a.master.characters[0].name,'One');assert.equal(b.master.characters[0].name,'Two');assert.notEqual(a.master.plIcon,b.master.plIcon);
 assert.equal(f.db.prepare('SELECT count(*) AS n FROM character').get().n,2);
 const char=characterKey('one','same','pc');assert.equal(localId(char),'pc');assert.equal(a.master.characters[0].address,char);
 await handleRoomPlayers(req('DELETE',{playerId:'same'},one.accessToken),f.env,'one',['same','characters','pc']);
 const stale=await (await update('one',one.accessToken,'Stale')).json();assert.deepEqual(stale.master.characters,[]);
 const other=await (await handleRoomPlayers(req('GET',null,two.accessToken),f.env,'two',['same'])).json();assert.equal(other.master.characters[0].name,'Two');
 const hash=b.master.plIcon.split('/').pop();assert.equal((await servePlayerIcon(req('GET'),f.env,'two','pl-icons',hash)).status,200);
 await f.env.LOGS.delete([...f.objects.keys()].filter(k=>k.startsWith('rooms/one/')));
 assert.equal((await servePlayerIcon(req('GET'),f.env,'one','pl-icons',hash)).status,404,'another board cannot supply its image');
});
test('room participants and room deletion use room addresses and preserve other rooms',async t=>{
 const f=roomFixture(t);
 for(const board of ['one','two']){
  await handleRoomParticipants(req('POST',{authorId:'same',plName:board,personas:[{id:'pc',name:'PC'}]}),f.env,board,`log-${board}`);
 }
 const people=await (await handleRoomParticipants(req('GET'),f.env,'one')).json();assert.equal(people.participants[0].authorId,'same');assert.equal(people.participants[0].personaId,'pc');
 f.db.prepare('UPDATE room SET room_admin_token_hash=? WHERE room_id=?').run(await tokenHash('admin'),'one');
 const deleted=await handleRoomDelete(new Request('https://test/api',{method:'DELETE',headers:{'x-board-admin-token':'admin'}}),f.env,'one');assert.equal(deleted.status,200);
 assert.equal(f.db.prepare('SELECT * FROM pl WHERE pl_id=?').get(playerKey('one','same')),undefined);
 assert.ok(f.db.prepare('SELECT * FROM character WHERE character_id=?').get(characterKey('two','same','pc')));
 assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('transfer codes only redeem in their own room, once, while the original device remains usable',async t=>{
 const f=roomFixture(t),one=await register(f.env,'one');
 const code=await (await handleRoomPlayers(req('POST',{playerId:'same'},one.accessToken),f.env,'one',['same','code'])).json();
 assert.equal((await handleRoomPlayers(req('POST'),f.env,'two',['redeem',code.code])).status,404);
 const redeemed=await handleRoomPlayers(req('POST'),f.env,'one',['redeem',code.code]);assert.equal(redeemed.status,200);
 assert.equal((await handleRoomPlayers(req('POST'),f.env,'one',['redeem',code.code])).status,404);
 assert.equal((await handleRoomPlayers(req('GET',null,one.accessToken),f.env,'one',['same'])).status,200);
});
test('player addresses escape all IDs without truncating the board prefix',()=>{
 const key=characterKey('部屋/%?','PL/日本語','PC/%?');assert.equal(localId(key),'PC/%?');assert.notEqual(key,characterKey('別部屋','PL/日本語','PC/%?'));
});
const source=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
test('profile, tokens, people and recovery caches are isolated by room; global caches are not imported',t=>{
 for(const board of ['one','two']){
  const dom=new JSDOM('',{url:`https://test/log/?board=${board}&room=log`,runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;
  const rawSet=w.Storage.prototype.setItem,rawGet=w.Storage.prototype.getItem;
  rawSet.call(w.localStorage,'trpgMarkerProfile',JSON.stringify({id:'legacy',plName:'Old'}));rawSet.call(w.localStorage,'board:two:players:trpgMarkerProfile',JSON.stringify({id:'two',plName:'Two'}));
  w.eval(source('shared/room-storage.js'));
  assert.equal(w.localStorage.getItem('trpgMarkerProfile'),board==='two'?JSON.stringify({id:'two',plName:'Two'}):null);
  w.localStorage.setItem('jijinboardPlayerMasterToken.v1','token');w.localStorage.setItem('personas:log','[]');
  assert.equal(rawGet.call(w.localStorage,`board:${board}:players:jijinboardPlayerMasterToken.v1`),'token');
  assert.ok(w.JijinRoomStorage.keys().includes('personas:log'));assert.equal(w.JijinRoomStorage.keys().includes('trpgMarkerProfile'),board==='two');
 }
});

test('a delete arriving before an in-flight first PC save still leaves a tombstone',async t=>{
 const f=roomFixture(t),one=await register(f.env,'one');
 assert.equal((await handleRoomPlayers(req('DELETE',{playerId:'same'},one.accessToken),f.env,'one',['same','characters','not-saved-yet'])).status,200);
 const saved=await (await handleRoomPlayers(req('PUT',{playerId:'same',characters:[{id:'not-saved-yet',name:'Late save'}]},one.accessToken),f.env,'one',['same'])).json();
 assert.deepEqual(saved.master.characters,[]);assert.ok(saved.master.deletedCharacterIds.includes('not-saved-yet'));
});

test('the first board registration persists PL data and its token before closing the form',async t=>{
 const dom=new JSDOM('<dialog id="boardProfileDialog" open><form id="boardProfileForm"><input id="boardPlName" value="New PL"><input id="boardPlColor" value="#123456"><button type="submit">入る</button></form></dialog>',{url:'https://test/board/?id=one',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};w.alert=message=>assert.fail(message);
 const writes=[];w.fetch=async(path,options={})=>{const payload=options.body?JSON.parse(options.body):null;writes.push({path,payload});return {ok:true,json:async()=>({playerId:payload?.playerId,accessToken:'room-token',master:{boardId:'one',playerId:payload?.playerId,plName:payload?.plName,characters:[],deletedCharacterIds:[]}})}};
 w.eval(source('shared/room-storage.js'));w.eval(source('shared/player-master.js'));w.eval(source('board/board-profile.js'));
 w.document.querySelector('#boardProfileForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 for(let i=0;i<10&&w.document.querySelector('dialog').open;i++)await new Promise(setImmediate);
 assert.equal(w.document.querySelector('dialog').open,false);assert.ok(writes.some(x=>x.path==='/api/boards/one/players'&&x.payload.plName==='New PL'));
 assert.equal(w.localStorage.getItem('jijinboardPlayerMasterToken.v1'),'room-token');
});
