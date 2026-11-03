import {test} from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import {readFileSync} from 'node:fs';
test('a denied transferred device shows a retry notice and blocks API mutations',async t=>{
 const dom=new JSDOM('<main>board</main>',{url:'https://test/board/?id=b',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;w.Request=Request;let writes=0;
 w.fetch=async path=>{if(String(path).endsWith('/session'))return {ok:false,status:409,json:async()=>({code:'DEVICE_IN_USE',error:'もう片方の端末を閉じてから、再読み込みしてください。'})};writes++;return {ok:true}};
 w.eval(readFileSync(new URL('../public/shared/device-session.js',import.meta.url),'utf8'));await assert.rejects(w.JijinDeviceSession.start('b','p','token'));
 assert.match(w.document.getElementById('jijinDeviceNotice').textContent,/もう片方の端末を閉じてから、再読み込みしてください。/);assert.equal(w.document.querySelector('#jijinDeviceNotice button').textContent,'再読み込み');
 await assert.rejects(w.fetch('/api/boards/b/spreadsheet/state',{method:'POST',body:'{}'}));assert.equal(writes,0);
});
