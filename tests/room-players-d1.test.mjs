import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as runtime from 'miniflare';
import {playerScopeTriggers,ensurePlayerScope} from '../src/player-scope.js';
import {createStatements} from '../src/schema.js';
import {freshnessStatements} from '../src/data-freshness.js';
import {handleRoomPlayers} from '../src/room-players.js';
import {handleMatrixTemplates} from '../src/matrix-templates.js';
import {handleMatrixPoint} from '../src/matrix-point.js';
import {handleMatrixState} from '../src/matrix-state.js';
import {handleRoomParticipants} from '../src/room-participants.js';
const req=(method,data,token='')=>new Request('https://test/api',{method,headers:{'x-player-token':token},...(data?{body:JSON.stringify(data)}:{})});

test('new PC registration succeeds on actual D1 with the production reset triggers',async t=>{
 const options={workers:[{name:'test',modules:true,script:'export default {fetch(){return new Response("ok")}}',d1Databases:['DB'],r2Buckets:['LOGS']}]};
 const mf=new runtime.Miniflare(runtime.convertV4MiniflareOptions?runtime.convertV4MiniflareOptions(options):options);t.after(()=>mf.dispose());
 const DB=await mf.getD1Database('DB'),LOGS=await mf.getR2Bucket('LOGS');
 await DB.batch([...createStatements,...freshnessStatements].map(sql=>DB.prepare(sql)));
 await DB.batch(playerScopeTriggers.map(sql=>DB.prepare(sql)));
 // Recreate the old production triggers to prove the reported 500, then migrate.
 await DB.batch([
  DB.prepare('DROP TRIGGER character_room_address_insert'),DB.prepare('DROP TRIGGER character_room_address_update'),
  ...['INSERT','UPDATE'].map(op=>DB.prepare(`CREATE TRIGGER character_room_address_${op.toLowerCase()} BEFORE ${op} ON character WHEN NEW.character_id NOT GLOB (NEW.pl_id||'/characters/*') BEGIN SELECT RAISE(ABORT,'Room character address required'); END`))
 ]);
 const board='FCPBLKtoUaSMArPvOTfu_WTZ3IU',player='test-player';
 await DB.prepare('INSERT INTO room(room_id,owner_pl_id,room_name,room_admin_token_hash) VALUES(?,?,?,?)').bind(board,`/boards/${board}/players/owner`,'Test','unused').run();
 const events=[];
 const env={DB,LOGS,ROOMS:{idFromName:id=>id,get:id=>({fetch:async(url,options)=>{events.push({board:id,...JSON.parse(options.body)});return new Response('{}')}})}};
 const made=await (await handleRoomPlayers(req('POST',{playerId:player,plName:'PL'}),env,board)).json();assert.ok(made.accessToken);
 const save=()=>handleRoomPlayers(req('PUT',{playerId:player,plName:'PL',characters:[{id:'pc-1',name:'キャラクター',type:'PC'}]},made.accessToken),env,board,[player]);
 await assert.rejects(save(),/LIKE or GLOB pattern too complex/);
 await ensurePlayerScope(DB);
 const saved=await save();
 assert.equal(saved.status,200);assert.equal((await saved.json()).master.characters[0].name,'キャラクター');
 const reloaded=await (await handleRoomPlayers(req('GET',null,made.accessToken),env,board,[player])).json();assert.equal(reloaded.master.characters.length,1);
 const updated=await handleRoomPlayers(req('PUT',{playerId:player,plName:'PL',characters:[{id:'pc-1',name:'変更後',type:'PC'}]},made.accessToken),env,board,[player]);assert.equal(updated.status,200);
 await assert.rejects(DB.prepare('UPDATE character SET pl_id=? WHERE character_id=?').bind(`/boards/${board}/players/other`,reloaded.master.characters[0].address).run(),/Room character address required/);
 assert.equal((await DB.prepare('SELECT count(*) AS n FROM room_participant WHERE character_id IS NOT NULL').first()).n,1);
 // A different visitor reads shared PCs without possessing the owner's token.
 const shared=await (await handleRoomParticipants(new Request('https://test/api/participants'),env,board)).json();
 assert.equal(shared.participants.length,1);assert.equal(shared.participants[0].name,'変更後');assert.equal(shared.participants[0].authorId,player);
 assert.ok(events.some(e=>e.board===board&&e.action==='participants'));
 // Re-running the non-destructive migration never changes the saved data.
 await ensurePlayerScope(DB);
 assert.equal((await DB.prepare('SELECT count(*) AS n FROM character').first()).n,1);
 // MATRIX must persist at board scope before any log exists.
 const callTemplate=(method,id,body)=>handleMatrixTemplates(req(method,body),env,board,board,id);
 const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Z2cAAAAASUVORK5CYII=';
 const payload=name=>({authorId:player,authorName:'PL',baseRevision:null,record:{name,dataUrl:image},templateState:{items:{},display:{}}});
 const first=await callTemplate('PUT','template-one',payload('一枚目'));assert.equal(first.status,200,await first.clone().text());
 const itemId=`participant:${player}:pc-1`;
 const placed=await handleMatrixPoint(req('PATCH',{authorId:player,authorName:'PL',templateId:'template-one',placed:true,x:21,y:34}),env,board,board,itemId);assert.equal(placed.status,200);
 const second=await callTemplate('PUT','template-two',payload('二枚目'));assert.equal(second.status,200,await second.clone().text());
 const listed=await (await callTemplate('GET','')).json();assert.equal(listed.templates.length,2);
 const one=listed.templates.find(t=>t.record.id==='template-one'),two=listed.templates.find(t=>t.record.id==='template-two');
 assert.equal(one.templateState.items[itemId].x,21);assert.equal(one.templateState.items[itemId].placed,true);assert.ok(two.record.dataUrl.includes('template-two'));
 const picture=await handleMatrixTemplates(new Request('https://test/image'),env,board,'','template-two',true);assert.equal(picture.status,200);assert.ok((await picture.arrayBuffer()).byteLength>0);
 const display=await handleMatrixState(req('POST',{authorId:player,authorName:'PL',state:{display:{color:'white'}}}),env,board,board);assert.equal(display.status,200);
 const stale=await callTemplate('PUT','template-one',{...payload('stale'),baseRevision:'old'});assert.equal(stale.status,409,'revision conflict protection remains active');

});
