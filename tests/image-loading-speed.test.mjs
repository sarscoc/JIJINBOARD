import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const read=p=>readFileSync(new URL('../public/'+p,import.meta.url),'utf8');
const tick=()=>new Promise(setImmediate);
test('downloaded Sheets images display without waiting for a blocked local database and reuse memory',async t=>{
 const dom=new JSDOM('',{url:'https://test/spreadsheet/?board=one',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;let gets=0,missing=false;
 w.saveImageBlob=()=>new Promise(()=>{});w.deleteImageBlob=async()=>{};w.loadImageBlob=()=>new Promise(()=>{});
 const blob=new w.Blob(['image'],{type:'image/png'});w.fetch=async()=>{gets++;return missing?{ok:false,status:404}:{ok:true,status:200,blob:async()=>blob}};
 w.eval(read('spreadsheet/sheet-image-sync.js'));await tick();
 const deadline=()=>new Promise((_,reject)=>setTimeout(()=>reject(Error('image waited on local database')),200));
 assert.equal(await Promise.race([w.loadImageBlob('question-portrait','pc'),deadline()]),blob);
 assert.equal(await Promise.race([w.loadImageBlob('question-portrait','pc'),deadline()]),blob);assert.equal(gets,1);
 missing=true;w.dispatchEvent(new w.CustomEvent('jijinboard-spreadsheet-remote-change',{detail:{action:'spreadsheet-image'}}));
 assert.equal(await w.loadImageBlob('question-portrait','pc'),null);assert.equal(gets,2);
});
test('an image download begun before deletion cannot restore that image',async t=>{
 const dom=new JSDOM('',{url:'https://test/spreadsheet/?board=one',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;let release;
 w.saveImageBlob=async()=>{};w.deleteImageBlob=async()=>{};w.loadImageBlob=async()=>null;
 w.fetch=(url,init={})=>init.method==='DELETE'?Promise.resolve({ok:true}):new Promise(resolve=>release=resolve);
 w.eval(read('spreadsheet/sheet-image-sync.js'));await tick();const loading=w.loadImageBlob('part','pc');await tick();await w.deleteImageBlob('part','pc');release({ok:true,status:200,blob:async()=>new w.Blob(['old'])});assert.equal(await loading,null);
});
test('image cells start downloads together rather than waiting on earlier cells',async t=>{
 const dom=new JSDOM('<div data-image-host="p" data-image-char="a"><div class="image-part-frame"></div></div><div data-image-host="p" data-image-char="b"><div class="image-part-frame"></div></div>',{runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window,releases=[];
 w.loadImageBlob=()=>new Promise(resolve=>releases.push(resolve));
 const html=read('spreadsheet/index.html'),start=html.indexOf('async function hydrateImageParts('),end=html.indexOf('function bindImagePartControls(',start);w.eval(html.slice(start,end));const hydration=w.hydrateImageParts();assert.equal(releases.length,2);releases.forEach(resolve=>resolve(null));await hydration;
});
test('previously saved images appear before a slow remote verification and update after it',async t=>{
 const dom=new JSDOM('',{url:'https://test/spreadsheet/?board=one',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;let release,updated=0;
 const old=new w.Blob(['old'],{type:'image/png'}),fresh=new w.Blob(['new bytes'],{type:'image/png'});w.saveImageBlob=async()=>{};w.deleteImageBlob=async()=>{};w.loadImageBlob=async()=>old;
 w.fetch=()=>new Promise(resolve=>release=resolve);w.addEventListener('jijinboard-local-image-updated',()=>updated++);
 w.eval(read('spreadsheet/sheet-image-sync.js'));await tick();assert.equal(await w.loadImageBlob('question-portrait','pc'),old);assert.equal(updated,0);
 release({ok:true,status:200,blob:async()=>fresh});await tick();assert.equal(await w.loadImageBlob('question-portrait','pc'),fresh);assert.equal(updated,1);
});
test('versioned MATRIX template images can stay local while unversioned URLs require validation',async()=>{
 const {handleMatrixTemplates}=await import('../src/matrix-templates.js');const key='rooms/board/matrix/templates/template/rev/image.webp';
 const env={DB:{prepare(){return {bind(){return this},async first(){return {template_image_key:key}}}}},LOGS:{async get(){return {body:'bytes',httpMetadata:{contentType:'image/webp'}}}}};
 const local=await handleMatrixTemplates(new Request('https://test/image?v='+encodeURIComponent(key)),env,'board','','template',true);assert.match(local.headers.get('cache-control'),/immutable/);
 const unversioned=await handleMatrixTemplates(new Request('https://test/image'),env,'board','','template',true);assert.match(unversioned.headers.get('cache-control'),/no-cache/);
});
