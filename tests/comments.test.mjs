import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleComments,targets} from '../src/comments.js';
import {handleLegacyComments} from '../src/comments-legacy.js';

function fixture(t){
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  db.exec(`INSERT INTO pl(pl_id,access_token_hash,pl_name) VALUES('author','token','Author'),('other','token2','Other');
    INSERT INTO room(room_id,owner_pl_id,room_name,room_admin_token_hash) VALUES('board','author','test','token'),('elsewhere','other','test','token');
    INSERT INTO log(log_id,room_id,log_name) VALUES('log','board','LOG'),('foreign','elsewhere','LOG');
    INSERT INTO matrix_template(room_id,template_id,template_name) VALUES('board','template','MATRIX'),('elsewhere','template','MATRIX');`);
  const notifications=[],objects=new Map();
  const env={DB:{prepare(sql){let values=[];return {bind(...args){values=args;return this},async first(){return db.prepare(sql).get(...values)||null},async all(){return {results:db.prepare(sql).all(...values)}},async run(){return {meta:db.prepare(sql).run(...values)}},async execute(){return /^\s*SELECT/.test(sql)?this.all():this.run()}}},async batch(statements){db.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.execute());db.exec('COMMIT');return results}catch(e){db.exec('ROLLBACK');throw e}}},
    LOGS:{head:async key=>objects.get(key),put:async(key,bytes,options)=>objects.set(key,{body:bytes,...options}),get:async key=>objects.get(key)},
    ROOMS:{idFromName:x=>x,get:board=>({fetch:async(url,options)=>{notifications.push({board,...JSON.parse(options.body)});return new Response('{}')}})}};
  const call=(method,body,id='',action='',query='',board='board')=>handleComments(new Request('https://test/api'+query,{method,...(body?{body:JSON.stringify(body)}:{})}),env,board,id,action);
  const create=target=>call('POST',{target,body:'hello',authorId:'author',authorName:'Author',personaType:'PL'});
  const list=async scope=>(await (await call('GET',null,'','','?scope='+encodeURIComponent(scope))).json()).comments;
  return {db,env,call,create,list,notifications};
}

test('all target types round-trip encoded IDs, ranges, and legacy IDs',()=>{
  const cases=[targets.log('board','log',{messageId:'line/a? 日本語',endMessageId:'line/b',startOffset:2,endOffset:8}),targets.matrix('board','template /?','participant:pc/one'),targets.cell('board','cell:/?%日本語')];
  for(const address of cases)assert.equal(targets.parse(address,'board').address,address);
  assert.notEqual(targets.matrix('board','one','pc'),targets.matrix('board','two','pc'));
  assert.notEqual(targets.cell('board','pc'),targets.matrix('board','one','pc'));
  assert.throws(()=>targets.parse(cases[0],'elsewhere'));
  assert.throws(()=>targets.log('board','log',{messageId:'x',startOffset:5,endOffset:2}));
  assert.throws(()=>targets.parse('/boards/board/logs/log/ranges/x?start=-1&end=0'));
  assert.throws(()=>targets.parse('https://evil/boards/board/matrix'));
  const row={comment_target_type:'matrix_point',comment_target_id:'old/point'};
  assert.equal(targets.storage(targets.parse(targets.fromStorage('board',row))).key,'old/point');
});

for(const kind of ['log','matrix','sheet'])test(`${kind}: common create/read/reply/edit/like/image/delete and server notifications`,async t=>{
  const f=fixture(t),address=kind==='log'?targets.log('board','log',{messageId:'message',startOffset:1,endOffset:10}):kind==='matrix'?targets.matrix('board','template','pc'):targets.cell('board','cell');
  const response=await f.create(address);assert.equal(response.status,201);
  const {comment}=await response.json();assert.equal(comment.target,address);
  assert.equal(f.notifications.at(-1).action,'comment:create');assert.equal(f.notifications.at(-1).data.target,address);
  const reply=await f.call('POST',{target:address,parentId:comment.id,authorId:'other',personaName:'Other',body:'reply'});assert.equal(reply.status,201);
  const scope=kind==='log'?targets.log('board','log'):kind==='matrix'?targets.matrix('board'):targets.cell('board');
  assert.equal((await f.list(scope)).length,2);
  assert.equal((await f.call('PATCH',{authorId:'other',body:'intrusion'},comment.id)).status,403);
  assert.equal((await f.call('PATCH',{authorId:'author',body:'edited',imageData:'data:image/png;base64,QQ=='},comment.id)).status,200);
  const image=await f.call('GET',null,comment.id,'image');assert.equal(image.status,200);assert.equal(await image.text(),'A');
  const liked=await (await f.call('POST',{authorId:'other'},comment.id,'like')).json();assert.equal(liked.likeCount,1);
  const again=await (await f.call('POST',{authorId:'other'},comment.id,'like')).json();assert.equal(again.likeCount,0);
  assert.equal(f.db.prepare("SELECT pl_name FROM pl WHERE pl_id='other'").get().pl_name,'Other');
  const wrongBoard=await f.call('DELETE',{authorId:'author'},comment.id,'','','elsewhere');assert.equal(wrongBoard.status,404);
  const deleted=await (await f.call('DELETE',{authorId:'author'},comment.id)).json();assert.equal(deleted.deletedIds.length,2);
  assert.equal((await f.list(scope)).length,0);
  assert.equal(f.db.prepare('SELECT count(*) n FROM comment_reaction').get().n,0);
});

test('a reply cannot cross a board, log range, template, or cell',async t=>{
  const f=fixture(t),a=targets.matrix('board','template','pc'),{comment}=await (await f.create(a)).json();
  const response=await f.call('POST',{target:targets.cell('board','cell'),parentId:comment.id,authorId:'author',body:'wrong'});
  assert.equal(response.status,400);
  assert.equal((await f.create(targets.log('board','foreign',{messageId:'x',endOffset:1}))).status,404);
  assert.equal((await f.create(targets.cell('elsewhere','x'))).status,400);
});

test('existing data and all legacy URLs use the common service without migration',async t=>{
  const f=fixture(t);
  f.db.exec("INSERT INTO comment(comment_id,room_id,author_pl_id,comment_target_type,comment_target_id,comment_body) VALUES('old','board','other','matrix_template','template@@matrix-template@@pc','preserved')");
  const [old]=await f.list(targets.matrix('board'));assert.equal(old.id,'old');assert.equal(old.target,targets.matrix('board','template','pc'));
  for(const [url,payload] of [
    ['/api/rooms/log/annotations',{messageId:'m',endOffset:3,quote:'old LOG'}],
    ['/api/boards/board/matrix/log/comments',{targetId:'template@@matrix-template@@pc'}],
    ['/api/boards/board/spreadsheet/comments',{cellId:'cell'}]
  ]){
    const response=await handleLegacyComments(new Request('https://test'+url,{method:'POST',body:JSON.stringify({authorId:'author',body:'legacy client',...payload})}),f.env);
    assert.equal(response.status,201,url);assert.ok((await response.json()).comment.target.startsWith('/boards/board/'));
  }
  assert.equal(f.db.prepare("SELECT comment_body FROM comment WHERE comment_id='old'").get().comment_body,'preserved');
  const before=f.db.prepare('SELECT count(*) n FROM comment').get().n;
  const bad=await handleLegacyComments(new Request('https://test/api/rooms/log/annotations/old',{method:'DELETE',body:JSON.stringify({authorId:'other'})}),f.env);
  assert.equal(bad.status,404);assert.equal(f.db.prepare('SELECT count(*) n FROM comment').get().n,before);
});

test('point display notes use the same address; stale edits conflict and deletions cannot recover',async t=>{
  const f=fixture(t),target=targets.matrix('board','template','pc');
  f.db.exec("INSERT INTO matrix_point(room_id,template_id,point_id,is_placed,point_x) VALUES('board','template','pc',1,88)");
  const save=extra=>f.call('PUT',{target,authorId:'author',body:'note',...extra},'note');
  assert.equal((await save({baseComment:''})).status,200);
  const note=await (await f.call('GET',null,'note','','?target='+encodeURIComponent(target))).json();assert.equal(note.target,target);assert.equal(note.body,'note');
  assert.equal((await save({baseComment:'stale',body:'bad'})).status,409);
  assert.equal((await save({baseComment:'note',body:'new'})).status,200);
  assert.equal((await save({baseComment:'new',body:''})).status,200);
  await save({body:'old local cache',recoverIfEmpty:true});
  const row=f.db.prepare("SELECT * FROM matrix_point WHERE point_id='pc'").get();assert.equal(row.supplement_body,'');assert.equal(row.point_x,88);
  assert.equal(f.notifications.at(-1).action,'comment:note');assert.equal(f.notifications.at(-1).data.target,target);
  f.db.exec("UPDATE matrix_template SET template_image_key='__deleted__' WHERE room_id='board'");
  assert.equal((await save({body:'resurrect'})).status,404);
});

test('scoped target reads and writes cannot escape their parent address',async t=>{
  const f=fixture(t),cell=targets.cell('board','one'),other=targets.cell('board','two');
  await f.create(cell);await f.create(other);
  assert.equal((await f.list(cell)).length,1);
  const invalid=await f.call('POST',{target:other,authorId:'author',body:'wrong'},'','','?scope='+encodeURIComponent(cell));
  assert.equal(invalid.status,400);
  const response=await f.call('GET',null,'','','?scope='+encodeURIComponent(targets.matrix('board'))+'&target='+encodeURIComponent(cell));
  assert.equal(response.status,400);
});

test('comment image validation avoids downloading unchanged bytes and detects replacements',async t=>{
 const f=fixture(t),{comment}=await (await f.create(targets.cell('board','cell'))).json();
 await f.call('PATCH',{authorId:'author',imageData:'data:image/png;base64,QQ=='},comment.id);
 let reads=0;const get=f.env.LOGS.get;f.env.LOGS.get=async key=>{reads++;return get(key)};
 const first=await f.call('GET',null,comment.id,'image'),etag=first.headers.get('etag');assert.ok(etag);assert.equal(reads,1);
 const cached=await handleComments(new Request('https://test/api',{headers:{'if-none-match':etag}}),f.env,'board',comment.id,'image');assert.equal(cached.status,304);assert.equal(reads,1);
 await f.call('PATCH',{authorId:'author',imageData:'data:image/png;base64,Qg=='},comment.id);
 const changed=await handleComments(new Request('https://test/api',{headers:{'if-none-match':etag}}),f.env,'board',comment.id,'image');assert.equal(changed.status,200);assert.notEqual(changed.headers.get('etag'),etag);assert.equal(await changed.text(),'B');
});

test('versioned comment images are reusable locally, and obsolete versions remain validated',async t=>{
 const f=fixture(t),{comment}=await (await f.create(targets.cell('board','cell'))).json();
 const edited=await (await f.call('PATCH',{authorId:'author',imageData:'data:image/png;base64,QQ=='},comment.id)).json();const version=edited.comment.image_version;assert.ok(version);
 const cached=await handleComments(new Request('https://test/image?v='+encodeURIComponent(version)),f.env,'board',comment.id,'image');assert.match(cached.headers.get('cache-control'),/immutable/);
 const unknown=await handleComments(new Request('https://test/image?v=old'),f.env,'board',comment.id,'image');assert.match(unknown.headers.get('cache-control'),/no-cache/);
});
