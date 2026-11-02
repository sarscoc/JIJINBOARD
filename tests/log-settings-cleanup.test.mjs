import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
function dom(t,query=''){
 const d=new JSDOM('<dialog id="profileDialog"><div id="logSpeakerSlot"></div></dialog><select id="personaSelect"><option value="PL">PL</option><option value="0">PC</option></select>',{url:'https://test/log/?board=one'+query,runScripts:'outside-only'});t.after(()=>d.window.close());return d.window;
}
test('LOG settings open the current parent editor without opening a second profile dialog',async t=>{
 const w=dom(t,'&embedded=1'),messages=[];Object.defineProperty(w,'parent',{value:{postMessage:(message,origin)=>messages.push({message,origin})}});
 w.eval(source('log/log-speaker-settings.js'));await w.JijinLogSettings.open();
 assert.equal(messages.length,1);assert.equal(messages[0].message.type,'jijinboard-open-settings');assert.equal(messages[0].origin,'https://test');assert.equal(w.document.getElementById('profileDialog').open,false);
});
test('direct LOG settings use the current shared editor and flush on close',async t=>{
 const w=dom(t);let opened=0,flushed=0;w.JijinSpeakerEditor=()=>({open(){opened++},flush(){flushed++;return Promise.resolve()}});w.HTMLDialogElement.prototype.showModal=function(){this.open=true};
 w.eval(source('log/log-speaker-settings.js'));await w.JijinLogSettings.open();assert.equal(opened,1);assert.equal(w.document.getElementById('profileDialog').open,true);
 w.document.getElementById('profileDialog').dispatchEvent(new w.Event('close'));assert.equal(flushed,1);
});
test('old global PC payloads never populate a room that has no saved PC list',t=>{
 const w=dom(t),code=source('log/app.js');const start=code.indexOf('function loadProfile()'),end=code.indexOf('function emitIntegratedProfile',start);
 w.localStorage.setItem('trpgMarkerProfile',JSON.stringify({id:'p',plName:'PL',plColorDark:'#334455',personas:[{id:'old',name:'Old PC'}]}));
 w.eval(`var state={roomId:null,profile:null};function uid(){return 'new'};${code.slice(start,end)};loadProfile();loadRoomPersonas('log');window.snapshot=state.profile;`);
 assert.equal(w.snapshot.personas.length,0);assert.equal(w.localStorage.getItem('personas:log'),null);assert.equal(w.snapshot.plColorDark,'#334455');
});
test('current PL and PC marker pairs still select the correct light and dark colors',t=>{
 const w=dom(t),code=source('log/app.js'),a=code.indexOf('function selectedPersona()'),b=code.indexOf('function currentPersona()',a),end=code.indexOf('\n}',b)+2;
 const marker=code.slice(code.indexOf('function markerColor(value)'),code.indexOf('\n',code.indexOf('function markerColor(value)')));
 w.eval(`var state={profile:{plName:'PL',plColor:'#112233',plColorDark:'#334455',personas:[{name:'PC',type:'PC',color:'#aabbcc',colorDark:'#ddeeff'}]}};function $(s){return document.querySelector(s)};${code.slice(a,end)};${marker};window.color=()=>markerColor(currentPersona().color);`);
 assert.equal(w.color(),'#112233');w.document.documentElement.classList.add('dark');assert.equal(w.color(),'#334455');w.document.getElementById('personaSelect').value='0';assert.equal(w.color(),'#ddeeff');w.document.documentElement.classList.remove('dark');assert.equal(w.color(),'#aabbcc');
});
