import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
test('Sheets has no legacy global design entry, dialog or controller, while individual character settings remain',()=>{
 const source=readFileSync(new URL('../public/spreadsheet/index.html',import.meta.url),'utf8');
 const dom=new JSDOM(source);try{
  assert.equal(dom.window.document.querySelector('#designToolBtn,#designToolModal'),null);
  assert.ok(dom.window.document.querySelector('#characterDesignModal'));
  assert.ok(dom.window.document.querySelector('#characterDesignAccent'));
  assert.doesNotMatch(source,/openDesignTool|closeDesignTool|syncDesignToolInputs|updateGlobalDesign|designDatabaseReset|designGlobalReset/);
 }finally{dom.window.close()}
});
