import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const source=readFileSync(new URL('../public/matrix/matrix-template-transfer.js',import.meta.url),'utf8');
const tick=()=>new Promise(setImmediate);

test('copy appends fresh templates to the selected board and resumes without copying completed items twice',async t=>{
 const dom=new JSDOM('<div id="displaySettingsBody"><section id="otherSettings"></section><button id="deleteCurrentTemplateBtn"></button></div>',{url:'https://test/matrix/?board=source',runScripts:'outside-only'});
 t.after(()=>dom.window.close());
 const w=dom.window,writes=[];
 const templates=['A','B'].map(name=>({record:{id:'old-'+name,name,dataUrl:''},templateState:{display:{},items:{pc:{placed:true,x:5,comment:name}}}}));
 w.matrixBoardContext={boardId:'source',profile:()=>({id:'pl',plName:'PL'}),async api(path,options){
  if(path.includes('/boards/source/'))return {templates};
  if(options?.method==='PUT'){
   writes.push({path,body:JSON.parse(options.body)});
   if(writes.length===2)throw new Error('timeout');
  }
  return {};
 }};
 w.eval(source);
 const section=w.document.querySelector('.matrix-template-transfer');
 assert.equal(section.previousElementSibling.id,'otherSettings');
 assert.equal(section.nextElementSibling.id,'deleteCurrentTemplateBtn');
 const form=w.document.querySelector('form'),status=w.document.querySelector('[role=status]');
 form.querySelector('input').value='https://test/board/?id=destination';
 form.requestSubmit();await tick();
 assert.match(status.textContent,/1\/2件/);
 form.requestSubmit();await tick();
 assert.equal(status.textContent,'2件を追加しました。');
 assert.equal(writes.length,3);
 assert.equal(writes[1].path,writes[2].path);
 assert.match(writes[0].path,/^\/api\/boards\/destination\/matrix\/destination\/templates\/[\w-]+$/);
 assert.equal(writes[0].body.baseRevision,null);
 assert.equal(writes[0].body.record.id,undefined);
 assert.equal(writes[0].body.templateState.items.pc.comment,'A');
});

test('image ZIP preserves original bytes and formats, skips empty templates, and uses unique names',async t=>{
 const dom=new JSDOM('<div id="displaySettingsBody"></div>',{url:'https://test/matrix/?board=source',runScripts:'outside-only'});
 t.after(()=>dom.window.close());
 const w=dom.window;
 const templates=['webp','png',''].map(ext=>({record:{name:'地図',dataUrl:ext?'/'+ext:''}}));
 w.matrixBoardContext={boardId:'source',api:async()=>({templates})};
 w.fetch=async path=>new Response(path,{headers:{'content-type':'image/'+path.slice(1)}});
 const index=readFileSync(new URL('../public/matrix/index.html',import.meta.url),'utf8');
 Object.assign(w,{TextEncoder,Blob});
 w.eval(index.slice(index.indexOf('function sanitizeExportFileName('),index.indexOf('function iconExportSelectedSize(')));
 let complete;
 const downloaded=new Promise(resolve=>complete=resolve);
 w.blobDownload=(blob,name)=>complete({blob,name});
 w.eval(source);
 w.document.querySelector('[data-download-images]').click();
 const {blob,name}=await downloaded;
 assert.equal(name,'jijinboard-matrix-images.zip');
 assert.equal(blob.type,'application/zip');
 const archive=await blob.arrayBuffer(),view=new DataView(archive),decoder=new TextDecoder();
 let offset=0;
 for(const [file,body] of [['001_地図.webp','/webp'],['002_地図.png','/png']]){
  assert.equal(view.getUint32(offset,true),0x04034b50);
  const nameLength=view.getUint16(offset+26,true),size=view.getUint32(offset+18,true);
  assert.equal(decoder.decode(new Uint8Array(archive,offset+30,nameLength)),file);
  offset+=30+nameLength;
  assert.equal(decoder.decode(new Uint8Array(archive,offset,size)),body);
  offset+=size;
 }
 assert.equal(view.getUint16(archive.byteLength-12,true),2);
});
