import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync('public/board/board-home-cache.js','utf8');
function setup(fetcher){
 const dom=new JSDOM('<img id="boardHomeImage" class="hidden"><div id="boardHomeEmpty"></div>',{url:'https://example.com/board/?id=room',runScripts:'outside-only'}),w=dom.window;
 const writes=[];w.Response=Response;w.AbortController=AbortController;
 w.caches={open:async()=>({match:async()=>new Response(new Blob(['saved'],{type:'image/png'})),put:async(...args)=>writes.push(args),delete:async()=>{}})};
 w.URL.createObjectURL=()=> 'blob:local';w.URL.revokeObjectURL=()=>{};
 w.Image=class{decode(){return Promise.resolve()}};w.fetch=fetcher;
 w.eval(source);return {w,writes,target:w.document.querySelector('img'),close:()=>w.close()};
}
test('saved screenshot appears while the server request remains pending',async()=>{
 const env=setup(()=>new Promise(()=>{}));
 assert.equal(await env.w.JijinHomeImage.show(env.target),true);
 assert.equal(env.target.src,'blob:local');assert.equal(env.target.classList.contains('hidden'),false);env.close();
});
test('temporary network failure preserves the saved screenshot',async()=>{
 const env=setup(async()=>{throw Error('offline')});
 assert.equal(await env.w.JijinHomeImage.show(env.target),true);
 await new Promise(resolve=>setTimeout(resolve,0));assert.equal(env.target.classList.contains('hidden'),false);env.close();
});
test('uploaded screenshot is displayed and persisted without downloading it again',async()=>{
 let fetched=0;const env=setup(async()=>{fetched++;throw Error('unexpected')});
 assert.equal(await env.w.JijinHomeImage.remember(new Blob(['upload']),env.target),true);
 await new Promise(resolve=>setTimeout(resolve,0));assert.equal(env.writes.length,1);assert.equal(fetched,0);env.close();
});
