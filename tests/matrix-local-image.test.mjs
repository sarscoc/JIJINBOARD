import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const html=readFileSync(new URL('../public/matrix/index.html',import.meta.url),'utf8');
const start=html.indexOf('function paintCachedItemImage('),end=html.indexOf('async function warmImageCacheForItems(',start),code=html.slice(start,end);
const tick=()=>new Promise(setImmediate);
function fixture(t){const dom=new JSDOM('<div class="placed" data-id="pc"><img data-matrix-image-id="pc" src="/image"></div>',{url:'https://test/matrix/?board=one',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;w.eval(`var items=[{id:'pc',name:'PC',baseImage:'/image',imageSignature:'signature'}],imageBlobUrls=new Map(),imageCacheMeta=new Map(),imageCachePromises=new Map();function stableRemoteImageKey(value){return value}function displayImage(item){return imageBlobUrls.get(item.id)||item.baseImage}function setItemImageUrl(id,blob){const url='blob:'+blob.name;imageBlobUrls.set(id,url);return url}function revokeItemImageUrl(id){imageBlobUrls.delete(id)}`);w.eval(code);return w}
test('a stored MATRIX icon is restored without a network read or rebuilding the placed icon',async t=>{
 const w=fixture(t);let requests=0;const image=w.document.querySelector('img');w.charImgGetRecord=async()=>({signature:'signature',blob:{name:'saved'}});w.fetchCharacterImageBlob=async()=>{requests++;return{name:'network'}};w.charImgSetRecord=async()=>{};
 assert.equal(await w.ensureItemImageCached(w.items[0]),true);assert.equal(requests,0);assert.equal(w.document.querySelector('img'),image);assert.equal(image.getAttribute('src'),'blob:saved');
});
test('MATRIX icon display never waits for local image persistence to finish',async t=>{
 const w=fixture(t);w.charImgGetRecord=async()=>null;w.charImgSetRecord=()=>new Promise(()=>{});w.fetchCharacterImageBlob=async()=>({name:'download'});
 const result=await Promise.race([w.ensureItemImageCached(w.items[0]),new Promise((_,reject)=>setTimeout(()=>reject(Error('display waited on IndexedDB')),200))]);assert.equal(result,true);assert.equal(w.document.querySelector('img').getAttribute('src'),'blob:download');
});
test('a changed image signature does not reuse an older pending icon download',async t=>{
 const w=fixture(t),release=[];w.charImgGetRecord=async()=>null;w.charImgSetRecord=async()=>{};w.fetchCharacterImageBlob=source=>new Promise(resolve=>release.push({source,resolve}));
 const old=w.ensureItemImageCached(w.items[0]);await tick();w.items[0]={id:'pc',baseImage:'/new',imageSignature:'new'};const fresh=w.ensureItemImageCached(w.items[0]);await tick();assert.equal(release.length,2);release[0].resolve({name:'old'});await old;assert.equal(w.document.querySelector('img').getAttribute('src'),'/image');release[1].resolve({name:'new'});await fresh;assert.equal(w.document.querySelector('img').getAttribute('src'),'blob:new');
});
