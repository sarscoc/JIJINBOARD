import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {JSDOM,VirtualConsole} from 'jsdom';
import {registerHooks} from 'node:module';
const hooks=registerHooks({resolve(specifier,context,next){return specifier==='cloudflare:workers'?{url:'data:text/javascript,export class DurableObject {}',shortCircuit:true}:next(specifier,context)}});
const {default:worker}=await import('../src/index.js');hooks.deregister();
import {datasetGeneration,checkDataset} from '../src/data-freshness.js';
import {handleSpreadsheetState} from '../src/spreadsheet-state.js';
import {resolveCharacterIdentity,tokenHash} from '../src/data-model.js';
import {handleRoomPlayers} from '../src/room-players.js';
import {playerKey,characterKey} from '../src/player-address.js';
function fixture(t){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
 db.exec("INSERT INTO pl(pl_id,access_token_hash,pl_name) VALUES('pl','token','PL');INSERT INTO room(room_id,owner_pl_id,room_name,room_admin_token_hash) VALUES('board','pl','room','secret')");
 const DB={prepare(sql){let args=[];return {bind(...v){args=v;return this},async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},async run(){return {meta:db.prepare(sql).run(...args)}},async execute(){return /^(SELECT|PRAGMA)/.test(sql)?this.all():this.run()}}},async batch(items){db.exec('BEGIN');try{const out=[];for(const x of items)out.push(await x.execute());db.exec('COMMIT');return out}catch(e){db.exec('ROLLBACK');throw e}}};
 return {db,env:{DB,LOGS:{},ROOMS:{}}};
}
test('old or missing generation cannot write; rotation invalidates a previously accepted client',async t=>{
 const {env}=fixture(t),g=await datasetGeneration(env.DB);
 const req=value=>new Request('https://test/api/boards/board',{method:'DELETE',headers:value?{'x-jijin-dataset':value}:{}});
 assert.equal((await checkDataset(req(),env.DB)).status,409);
 assert.equal((await checkDataset(req('old'),env.DB)).status,409);
 assert.equal(await checkDataset(req(g),env.DB),null);
 await env.DB.prepare("UPDATE app_dataset SET generation='next' WHERE singleton=1").run();
 assert.equal((await checkDataset(req(g),env.DB)).status,409);
 assert.equal(await checkDataset(req('next'),env.DB),null);
 // Verify the actual Worker entry point rejects an old client before any route effects.
 const result=await worker.fetch(req(g),env,{waitUntil(){}});assert.equal(result.status,409);
 assert.ok(await env.DB.prepare("SELECT 1 FROM room WHERE room_id='board'").first());
});
test('Sheets rejects stale snapshots after a deletion, including trailing slash routes',async t=>{
 const {env}=fixture(t),call=(method,data)=>handleSpreadsheetState(new Request('https://test/api',{method,...(data?{body:JSON.stringify(data)}:{})}),env,'board');
 assert.equal((await call('POST',{state:{old:1}})).status,409);
 assert.equal((await call('POST',{state:{old:1},baseRevision:null})).status,200);
 const initial=await (await call('GET')).json();
 assert.equal((await call('POST',{state:{},baseRevision:initial.revision})).status,200);
 assert.equal((await call('POST',{state:{old:1},baseRevision:initial.revision})).status,409);
 const g=await datasetGeneration(env.DB);
 const response=await worker.fetch(new Request('https://test/api/boards/board/spreadsheet/state/',{method:'POST',headers:{'x-jijin-dataset':g},body:JSON.stringify({state:{old:1}})}),env,{waitUntil(){}});
 assert.equal(response.status,409);assert.deepEqual((await (await call('GET')).json()).state,{});
});
test('deleted room PC cannot return from master sync or participant identity',async t=>{
 const {db,env}=fixture(t),pl=playerKey('board','pl');
 db.prepare('INSERT INTO pl(pl_id,access_token_hash,pl_name) VALUES(?,?,?)').run(pl,await tokenHash('secret'),'PL');
 const call=(method,parts,data)=>handleRoomPlayers(new Request('https://test/api',{method,headers:{'x-player-token':'secret'},...(data?{body:JSON.stringify(data)}:{})}),env,'board',['pl',...parts]);
 const payload={playerId:'pl',characters:[{id:'pc',name:'PC'}]};
 assert.equal((await call('PUT',[],payload)).status,200);
 assert.equal((await call('DELETE',['characters','pc'])).status,200);
 const sync=await (await call('PUT',[],payload)).json();assert.deepEqual(sync.master.characters,[]);assert.deepEqual(sync.master.deletedCharacterIds,['pc']);
 assert.equal(await resolveCharacterIdentity(env.DB,pl,'PC','PC',{characterId:'pc'}),null);
 assert.equal(db.prepare('SELECT * FROM character WHERE character_id=?').get(characterKey('board','pl','pc')),undefined);
 assert.equal(await resolveCharacterIdentity(env.DB,pl,'PC','PC'),null);
 await call('PUT',[],{playerId:'pl',characters:[{id:'new-pc',name:'PC'}]});assert.ok(db.prepare('SELECT 1 FROM character WHERE character_id=?').get(characterKey('board','pl','new-pc')));
});

const source=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const tick=()=>new Promise(setImmediate);
test('a reset during bootstrap discards old cache and never sends the queued stale body',async t=>{
 const dom=new JSDOM('',{url:'https://test/board/',runScripts:'outside-only',virtualConsole:new VirtualConsole()});t.after(()=>dom.window.close());const w=dom.window;
 w.Request=Request;w.Headers=Headers;w.localStorage.setItem('jijin.dataset.generation.v1','old');w.localStorage.setItem('board:one:charaHub.characters','stale');w.localStorage.setItem('unrelated','keep');
 let release;const sent=[];w.fetch=async(path,init)=>{sent.push({path,init});return new Promise(r=>release=r)};
 w.eval(source('shared/dataset-guard.js'));
 const queued=w.fetch('/api/boards/one/spreadsheet/state',{method:'POST',body:'stale'}).catch(e=>e);
 release(new Response(JSON.stringify({generation:'new'})));await queued;
 assert.equal(sent.length,1);assert.equal(w.JijinDataset.blocked,true);
 assert.equal(w.localStorage.getItem('board:one:charaHub.characters'),null);assert.equal(w.localStorage.getItem('unrelated'),'keep');
 w.localStorage.setItem('charaHub.characters','stale again');assert.equal(w.localStorage.getItem('charaHub.characters'),null);
});
test('verified clients attach generation while preserving caller headers',async t=>{
 const dom=new JSDOM('',{url:'https://test/board/',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;w.Request=Request;w.Headers=Headers;
 w.localStorage.setItem('jijin.dataset.generation.v1','current');let sent;
 w.fetch=async(path,init)=>{if(path==='/api/dataset')return new Response(JSON.stringify({generation:'current'}));sent=init;return new Response('{}')};
 w.eval(source('shared/dataset-guard.js'));await w.fetch('/api/boards/B',{method:'PATCH',headers:{'x-player-token':'secret'}});
 assert.equal(sent.headers.get('x-jijin-dataset'),'current');assert.equal(sent.headers.get('x-player-token'),'secret');
});
test('missing remote Sheets image deletes cache without reuploading it',async t=>{
 const dom=new JSDOM('',{url:'https://test/spreadsheet/?board=board',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;let deleted=0;const methods=[];
 w.saveImageBlob=async()=>{};w.loadImageBlob=async()=>new w.Blob(['old']);w.deleteImageBlob=async()=>{deleted++};
 w.fetch=async(path,init={})=>{methods.push(init.method||'GET');return {status:404,ok:false}};
 w.eval(source('spreadsheet/sheet-image-sync.js'));await tick();assert.equal(await w.loadImageBlob('background','global'),null);assert.equal(deleted,1);assert.deepEqual(methods,['GET']);
});
