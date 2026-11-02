import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
function fixture(t,html=''){
 const dom=new JSDOM(html,{url:'https://test/log/',runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window;w.eval(source('shared/log-format.js'));return w;
}
const notation='前 |漢字《かんじ》 **太字** ~~取り消し~~ 後';
function verify(w,text=notation){const host=w.document.createElement('div');host.innerHTML=w.JijinLogFormat.render(text);assert.equal(host.querySelector('ruby rt').textContent,'かんじ');assert.equal(host.querySelector('strong').textContent,'太字');assert.equal(host.querySelector('del').textContent,'取り消し');return host}

test('Tekey notation renders nested formatting and escapes hostile HTML',t=>{
 const w=fixture(t);verify(w);const host=verify(w,notation+'<img src=x onerror=alert(1)>');assert.equal(host.querySelector('img'),null);
 host.innerHTML=w.JijinLogFormat.render('**~~|漢字《かんじ》~~**');assert.ok(host.querySelector('strong del ruby rt'));
 assert.equal(w.JijinLogFormat.plain(notation),'前 漢字 太字 取り消し 後');
 assert.equal(w.JijinLogFormat.plain('**未閉じ'),'**未閉じ');assert.equal(w.JijinLogFormat.plain('|未完《'),'|未完《');
});

test('formatted text selections keep original UTF-16 addresses and marks',t=>{
 const w=fixture(t),raw='😀 **太字 |漢字《かんじ》** ~~末尾~~',host=w.document.createElement('span');host.dataset.sourceLength=raw.length;
 const start=raw.indexOf('漢字'),end=start+2;
 host.innerHTML=w.JijinLogFormat.render(raw,[{start,end,winner:{id:'saved',color:'#ffe66b'}}]);
 const marked=host.querySelector('ruby mark');assert.equal(marked.textContent,'漢字');assert.equal(marked.dataset.ann,'saved');
 const text=marked.querySelector('[data-log-start]').firstChild;
 assert.equal(w.JijinLogFormat.sourceOffset(host,text,0),start);assert.equal(w.JijinLogFormat.sourceOffset(host,text,2,'end'),end);
 assert.equal(w.JijinLogFormat.plain(raw,start,end),'漢字');
 const after=raw.indexOf('末尾');host.innerHTML=w.JijinLogFormat.render(raw,[{start:after,end:after+2,winner:{id:'second',color:'#ffe66b'}}]);assert.equal(host.querySelector('del mark').textContent,'末尾');
 assert.equal(w.JijinLogFormat.sourceOffset(host,host,host.childNodes.length,'end'),raw.length);
});

for(const [name,html] of [
 ['Tekey',`<title>Test</title><div class="chatlog"><div class="tab0"><b>PL：</b><span>[12:00]</span>${notation}</div></div>`],
 ['flat',`<title>Test</title><font><b>PL</b>：${notation}</font><br>`],
 ['CCFOLIA',`<title>Test</title><p><span>[main]</span><span>PL</span> : <span>${notation}</span></p>`],
 ['Tekey native HTML',`<div class="chatlog"><div class="tab0"><b>PL：</b><span>[12:00]</span>前 <ruby>漢字<rp>（</rp><rt>かんじ</rt><rp>）</rp></ruby> <strong>太字</strong> <del>取り消し</del><br>後</div></div>`],
 ['flat native HTML',`<font><b>PL</b>：前 <ruby>漢字<rt>かんじ</rt></ruby> <b>太字</b> <s>取り消し</s><br>後</font>`],
 ['CCFOLIA native HTML',`<p><span>[main]</span><span>PL</span> : <span>前 <ruby>漢字<rt>かんじ</rt></ruby> <strong>太字</strong> <strike>取り消し</strike><br>後</span></p>`]
])test(`${name} import preserves ruby, bold and strike through a JSON round-trip`,t=>{
 const w=fixture(t),app=source('log/app.js'),start=app.indexOf('function parseTekey('),end=app.indexOf('async function handleFile',start);
 w.eval(app.slice(start,end));w.eval(source('log/flat-log-parser.js'));
 const parsed=w.parseTekey(html,'Test.html');assert.equal(parsed.messages.length,1);assert.equal(parsed.messages[0].speaker,'PL');
 verify(w,JSON.parse(JSON.stringify(parsed)).messages[0].text);
 if(name.includes('native'))assert.ok(parsed.messages[0].text.includes('\n後'));
});

test('TRPG JSON import and standalone HTML export retain all three styles',async t=>{
 const w=fixture(t,'<div id="homeStatus"></div><div id="importTitle"></div><div id="importCount"></div><div id="importPreview"></div>');
 w.eval(`var state={parsed:null,archiveImages:{}};function $(s){return document.querySelector(s)};async function handleFile(){};function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))};function commentBodyHtml(v){return JijinLogFormat.render(v)};function markerColor(){return '#ffe66b'};window.parsed=()=>state.parsed;`);
 w.eval(source('log/trpg-log-import.js'));
 await w.handleFile({name:'sample.trpglog',text:async()=>JSON.stringify({format:'trpg-log-marker',room:{title:'Title',tabs:['main'],messages:[{id:'m',tab:'main',speaker:'PL',text:notation}]}})});
 assert.equal(w.parsed().messages[0].text,notation);verify(w,w.parsed().messages[0].text);
 const app=source('log/app.js'),start=app.indexOf('function standaloneArchiveHtml('),end=app.indexOf('\n',start);w.eval(app.slice(start,end));
 const html=w.standaloneArchiveHtml({room:w.parsed(),annotations:[]}),exported=new JSDOM(html);t.after(()=>exported.window.close());
 assert.equal(exported.window.document.querySelector('ruby rt').textContent,'かんじ');assert.equal(exported.window.document.querySelector('strong').textContent,'太字');assert.equal(exported.window.document.querySelector('del').textContent,'取り消し');
});

test('the real fast-render override preserves explicit Tekey ruby and annotation positions',t=>{
 const w=fixture(t);w.eval(`var state={room:{messages:[]},annotations:[],profile:{id:'pl'},activeMarkerId:''};function esc(v){return String(v)};function annotationMarkerColor(){return '#ffe66b'};function markedText(){return 'old'};`);
 w.eval(source('log/log-fast-first-paint.js'));
 const message={id:'m',tab:'main',text:'名前は|鈍呑《にびのみ》|塗笑《ぬえ》。|赤《あか》い **太字** ~~削除~~'};w.state.room.messages=[message];
 const host=w.document.createElement('span');host.innerHTML=w.markedText(message,[]);
 assert.deepEqual(Array.from(host.querySelectorAll('ruby rt'),el=>el.textContent),['にびのみ','ぬえ','あか']);assert.equal(host.querySelector('strong').textContent,'太字');assert.equal(host.querySelector('del').textContent,'削除');
 const start=message.text.indexOf('赤'),end=start+1;host.innerHTML=w.markedText(message,[{id:'saved',message_id:'m',start_offset:start,end_offset:end}]);
 assert.equal(host.querySelector('ruby mark').textContent,'赤');const run=host.querySelector('ruby mark span');assert.equal(w.JijinLogFormat.sourceOffset(host,run.firstChild,0),start);
});
