import {test} from 'node:test';
import assert from 'node:assert/strict';
import {roomFixture} from './helpers/room-db.mjs';
import {performRequestedReset} from '../src/requested-reset.js';
import {datasetGeneration,checkDataset} from '../src/data-freshness.js';
async function finish(env){for(let i=0;i<40;i++){const result=await performRequestedReset(env);if(result===null)return null;assert.equal(result.status,503)}throw Error('Reset did not finish');}
test('explicit reset removes current/legacy data and every R2 page, rotates generation, and runs only once',async t=>{
 const f=roomFixture(t);f.env.RESET_DATASET_ONCE='requested-test-reset';
 f.db.exec("INSERT INTO top_auth(password_hash,password_salt,password_hash_version) VALUES('hash','salt',1);CREATE TABLE old_cache(id TEXT);INSERT INTO old_cache VALUES('old');CREATE VIEW old_ui AS SELECT * FROM old_cache;INSERT INTO pl(pl_id,access_token_hash,pl_name) VALUES('old','old','Old');INSERT INTO character(character_id,pl_id,character_name) VALUES('old-pc','old','Old PC')");
 for(let i=0;i<1003;i++)f.objects.set('legacy/'+i,{body:'old'});
 const old=await datasetGeneration(f.DB);
 assert.equal((await performRequestedReset(f.env)).status,503);assert.notEqual(await datasetGeneration(f.DB),old);
 f.db.prepare('UPDATE app_reset SET not_before=0').run();
 assert.equal(await finish(f.env),null);
 assert.equal(f.db.prepare('SELECT state FROM app_reset').get().state,'complete');assert.equal(f.objects.size,0);
 assert.equal(f.db.prepare('SELECT count(*) n FROM room').get().n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM pl').get().n,0);assert.equal(f.db.prepare('SELECT count(*) n FROM character').get().n,0);
 assert.equal(f.db.prepare("SELECT 1 FROM sqlite_master WHERE name IN ('old_cache','old_ui')").get(),undefined);
 assert.equal(f.db.prepare('SELECT password_hash FROM top_auth').get().password_hash,'hash');assert.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
 assert.equal((await checkDataset(new Request('https://test/api',{method:'POST',headers:{'x-jijin-dataset':old}}),f.DB)).status,409);
 assert.throws(()=>f.db.exec("INSERT INTO pl(pl_id,access_token_hash,pl_name) VALUES('old-client','old','Old')"),/address required/);
 f.db.exec("INSERT INTO room(room_id,owner_pl_id,room_name,room_admin_token_hash) VALUES('new','/boards/new/players/owner','New','secret')");f.objects.set('rooms/new/image',{body:'new'});
 assert.equal(await performRequestedReset(f.env),null);assert.equal(f.objects.size,1);assert.ok(f.db.prepare("SELECT 1 FROM room WHERE room_id='new'").get());
});
test('failed R2 cleanup keeps maintenance active and resumes before declaring completion',async t=>{
 const f=roomFixture(t);f.env.RESET_DATASET_ONCE='retry-test';f.objects.set('old',{body:'old'});
 await performRequestedReset(f.env);f.db.prepare('UPDATE app_reset SET not_before=0').run();
 while(f.db.prepare('SELECT phase FROM app_reset').get().phase!=='images')await performRequestedReset(f.env);
 const remove=f.env.LOGS.delete;f.env.LOGS.delete=async()=>{throw Error('Temporary R2 error')};
 assert.equal((await performRequestedReset(f.env)).status,503);assert.notEqual(f.db.prepare('SELECT state FROM app_reset').get().state,'complete');
 f.env.LOGS.delete=remove;assert.equal(await performRequestedReset(f.env),null);assert.equal(f.objects.size,0);
});
test('ordinary deployments with no reset directive leave all data untouched',async t=>{
 const f=roomFixture(t);assert.equal(await performRequestedReset(f.env),null);assert.equal(f.db.prepare('SELECT count(*) n FROM room').get().n,2);
});

test('large legacy schemas reset in bounded resumable batches',async t=>{
 const f=roomFixture(t);f.env.RESET_DATASET_ONCE='large-legacy';
 for(let i=0;i<100;i++)f.db.exec(`CREATE TABLE legacy_${i}(id TEXT);INSERT INTO legacy_${i} VALUES('old')`);
 await performRequestedReset(f.env);f.db.prepare('UPDATE app_reset SET not_before=0').run();
 let done=false;
 for(let i=0;i<50&&!done;i++){
  const before=f.DB.queryCount;const response=await performRequestedReset(f.env);assert.ok(f.DB.queryCount-before<50,'stay within free-tier D1 query budget');done=response===null;
 }
 assert.equal(done,true);assert.equal(f.db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name LIKE 'legacy_%'").get().n,0);
});
