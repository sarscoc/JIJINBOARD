import {JSDOM,VirtualConsole,requestInterceptor} from 'jsdom';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root=new URL('../public',import.meta.url).pathname;

const snapshot={
 'charaHub.characters':[{id:'c1',name:'テストPC',key:'テストPC',sources:[],local:true,localValues:{'local::one':'基本情報','local::two':'詳細情報','local::three':'未分類'}}],
 'charaHub.sources':[],
 'charaHub.layoutV1':{groups:[{id:'g1',name:'基本'},{id:'g2',name:'詳細'}],localItems:[{id:'one',label:'名前'},{id:'two',label:'紹介'},{id:'three',label:'未分類項目'}],assignments:{'local::one':'g1','local::two':'g2'},parts:[],sheetLayout:{order:['g1','g2','ungrouped'],positions:{g1:{row:1,col:1},g2:{row:2,col:1}},sizes:{g1:1,g2:3},heights:{g1:5,g2:1},baseRows:8},mainMode:'characters'}
};
let server=structuredClone(snapshot),posts=[],fail=false,errors=[],pauseNext=false,releasePost=null;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function openPage(t){
 const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(fs.readFileSync(root+'/spreadsheet/index.html','utf8'),{url:'http://127.0.0.1:8765/spreadsheet/?board=test',runScripts:'dangerously',resources:{interceptors:[requestInterceptor(request=>{try{return new Response(fs.readFileSync(root+new URL(request.url).pathname),{headers:{'Content-Type':request.url.includes('.css')?'text/css':'application/javascript'}})}catch{return new Response('')}})]},pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
  w.CSS={escape:s=>String(s).replace(/[^\w-]/g,c=>'\\'+c)};w.structuredClone=structuredClone;w.TextEncoder=TextEncoder;w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};
  w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLElement.prototype.scrollTo=function(){};w.scrollTo=()=>{};
  for(const [k,v]of Object.entries(snapshot))w.localStorage.setItem('board:test:spreadsheet:'+k,JSON.stringify(v));
  w.fetch=async(input,options={})=>{
   const path=String(input);
   if(path.includes('/spreadsheet/state')){
    if(options.method==='POST'){if(pauseNext){pauseNext=false;await new Promise(resolve=>{releasePost=resolve})}if(fail)return {ok:false,json:async()=>({error:'通信エラー'})};const data=JSON.parse(options.body);server=structuredClone(data.state);posts.push(structuredClone(data.state));return {ok:true,json:async()=>({ok:true})}}
    return {ok:true,json:async()=>({state:structuredClone(server)})};
   }
   return {ok:true,json:async()=>({comments:[],images:[],participants:[],characters:[],people:[],tabs:[]})};
  };
 }});
 const w=dom.window;for(let i=0;i<100;i++){if(w.jijinSpreadsheetSync?.isReady())break;await sleep(30)}
 await sleep(350);t.after(()=>dom.window.close());
 assert.ok(w.sheetDisplaySettings);assert.ok(w.jijinSpreadsheetSync.isReady());
 return w;
}
test('spreadsheet display saves and group controls persist across reloads',async(t)=>{
 const w=await openPage(t);
 
 assert.equal(w.eval("state.layout.sheetLayout.positions.ungrouped"),undefined);
 assert.equal(w.document.querySelectorAll('[data-full-group-id="ungrouped"]').length,0);
 assert.equal(w.sheetGroupSpan('g1'),1);assert.equal(w.sheetGroupHeight('g1'),5);
 w.document.getElementById('sheetLayoutBtn').click();
 w.eval("state.layout.sheetLayout.positions.g1={row:4,col:2};delete state.layout.sheetLayout.positions.g2;state.layout.sheetLayout.baseRows=12;saveLayoutState()");
 await sleep(250);
 assert.equal(server['charaHub.layoutV1'].sheetLayout.positions.g1.row,1,'draft should not autosave layout');
 assert.equal(JSON.parse(w.localStorage.getItem('charaHub.layoutV1')).sheetLayout.positions.g1.row,1);
 w.document.getElementById('sheetLayoutSaveBtn').click();await sleep(250);
 assert.equal(server['charaHub.layoutV1'].sheetLayout.positions.g1.row,4);
 assert.equal(server['charaHub.layoutV1'].sheetLayout.positions.g2,undefined);
 assert.match(w.document.querySelector('.sheet-layout-save-status').textContent,/保存しました/);
 w.eval("state.layout.sheetLayout.positions.g1={row:8,col:2};saveLayoutState()");
 w.document.getElementById('sheetLayoutCancelBtn').click();
 assert.equal(w.eval('state.layout.sheetLayout.positions.g1.row'),4);
 w.document.getElementById('sheetLayoutBtn').click();
 w.eval("state.layout.sheetLayout.positions.g1={row:6,col:2};saveLayoutState()");fail=true;
 w.document.getElementById('sheetLayoutSaveBtn').click();await sleep(250);
 assert.match(w.document.querySelector('.sheet-layout-save-status').textContent,/保存できません/);
 assert.equal(server['charaHub.layoutV1'].sheetLayout.positions.g1.row,4);
 fail=false;w.document.getElementById('sheetLayoutSaveBtn').click();await sleep(250);
 assert.equal(server['charaHub.layoutV1'].sheetLayout.positions.g1.row,6);
 w.document.getElementById('sheetLayoutCancelBtn').click();
 w.document.getElementById('organizeBtn').click();
 let row=w.document.querySelector('[data-group-control="g1"]');assert.ok(row);
 row.querySelector('[data-group-action="toggle"]').click();await sleep(250);
 assert.equal(server['charaHub.layoutV1'].hiddenGroups.g1,true);
 assert.equal(w.document.querySelectorAll('[data-full-group-id="g1"]').length,0);
 assert.equal(w.eval('state.layout.hiddenItems["local::one"]'),undefined);
 w.document.getElementById('mainDatabaseModeBtn').click();
 const hiddenBody=w.document.querySelector('tbody[data-group-body="g1"]');
 assert.ok(!hiddenBody||hiddenBody.hidden);
 w.renderQuestionView();
 const hiddenQuestion=w.document.getElementById('qgroup-g1');assert.ok(!hiddenQuestion||hiddenQuestion.hidden);
 w.document.getElementById('mainCharacterModeBtn').click();
 const target=w.document.querySelector('[data-group-control="g1"]');
 const drop=new w.Event('drop',{bubbles:true});Object.defineProperty(drop,'dataTransfer',{value:{getData:()=> 'g2'}});Object.defineProperty(drop,'clientY',{value:-1});target.dispatchEvent(drop);await sleep(250);
 assert.deepEqual(server['charaHub.layoutV1'].groupOrder,['ungrouped','g2','g1']);
 w.document.querySelector('[data-group-control="g1"] [data-group-action="toggle"]').click();await sleep(250);
 assert.equal(server['charaHub.layoutV1'].hiddenGroups.g1,undefined);
 assert.ok(w.document.querySelector('[data-full-group-id="g1"]'));
 assert.deepEqual(errors,[]);
 // A manual save waits for an older in-flight autosave, then sends the latest draft.
 w.closeOrganize();pauseNext=true;
 w.eval("state.layout.questionStyle='cards';saveLayoutState()");await sleep(200);
 assert.equal(typeof releasePost,'function');
 w.document.getElementById('sheetLayoutBtn').click();
 w.eval("state.layout.sheetLayout.positions.g1={row:7,col:2};saveLayoutState()");
 w.document.getElementById('sheetLayoutSaveBtn').click();await sleep(30);
 assert.equal(w.document.getElementById('sheetLayoutSaveBtn').disabled,true);
 releasePost();await sleep(250);
 assert.equal(server['charaHub.layoutV1'].sheetLayout.positions.g1.row,7);
 assert.match(w.document.querySelector('.sheet-layout-save-status').textContent,/保存しました/);
 w.document.getElementById('sheetLayoutCancelBtn').click();
 // A fresh page hydrates the last acknowledged arrangement and shared group order.
 const reloaded=await openPage(t);
 assert.equal(reloaded.eval('state.layout.sheetLayout.positions.g1.row'),7);
 assert.equal(reloaded.eval('state.layout.sheetLayout.positions.g2'),undefined);
 assert.equal(reloaded.eval('state.layout.sheetLayout.positions.ungrouped'),undefined);
 assert.equal(reloaded.eval('state.layout.sheetLayout.baseRows'),12);
 assert.deepEqual(JSON.parse(reloaded.eval('JSON.stringify(state.layout.groupOrder)')),['ungrouped','g2','g1']);
 assert.deepEqual(errors,[]);
});
