import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const read=p=>readFileSync(new URL('../public/'+p,import.meta.url),'utf8');
test('all tools load the same background and no longer use the background rewrite timers',()=>{
 for(const tool of ['board','log','matrix','spreadsheet']){
  const dom=new JSDOM(read(tool+'/index.html'));const d=dom.window.document;
  assert.equal(d.querySelectorAll('script[src^="/shared/appearance.js"]').length,1);
  assert.equal(d.querySelectorAll('link[href^="/shared/appearance.css"]').length,1);
  assert.equal(d.querySelectorAll('#jijinboard-common-background,script[src^="shared-background-sync.js"]').length,0);
  if(tool==='spreadsheet')assert.equal(d.body.querySelectorAll('link[rel="stylesheet"]').length,0);
  dom.window.close();
 }
});
test('background bootstrap preserves saved colors and identifies only the board as backdrop owner',()=>{
 for(const path of ['/board/?id=b','/log/?embedded=1&board=b','/matrix/?embedded=1&board=b','/spreadsheet/?embedded=1&board=b']){
  const dom=new JSDOM('',{url:'https://test'+path,runScripts:'outside-only'}),w=dom.window;
  w.localStorage.setItem('jijinboardScopedTheme:b',JSON.stringify({gradientColor1:'#123456',gradientColor2:'#abcdef'}));w.eval(read('shared/appearance.js'));
  assert.equal(w.document.documentElement.classList.contains('board-shell'),path.startsWith('/board/'));
  assert.equal(w.document.documentElement.style.getPropertyValue('--jijin-background-one'),'rgba(18,52,86,0.24)');
  dom.window.close();
 }
});
