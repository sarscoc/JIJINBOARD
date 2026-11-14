import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../public/log/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/log/index.html',import.meta.url),'utf8');

test('LOG selection is finalized locally, not on every selectionchange',()=>{
  assert.doesNotMatch(source,/addEventListener\(["']selectionchange["'],showSelection\)/);
  assert.match(source,/addEventListener\(["']pointerup["'],finishLogSelection\)/);
  assert.match(source,/if\(first<0\|\|last<first/);
});

test('double-clicking a LOG tab does not toggle its visibility',()=>{
  const handler=source.match(/document\.addEventListener\("dblclick",e=>\{[^\n]+\}\);/);
  assert.ok(handler,'expected LOG tab double-click handler');
  assert.match(handler[0],/goToTab\(/);
  assert.doesNotMatch(handler[0],/toggleTabVisibility\(/);
});

test('LOG marker rendering ignores missing or reversed endpoints',()=>{
  const start=source.indexOf('function markedText(message, anns) {');
  const end=source.indexOf('\nfunction markerColor(',start);
  assert.ok(start>=0&&end>start);
  const rendered=[];
  const context={
    state:{room:{messages:[{id:'a',text:'hello'},{id:'b',text:'world'}]},annotations:[],activeMarkerId:null},
    JijinLogFormat:{render:(text,segments)=>{rendered.push(segments);return text}},
    annotationMarkerColor:()=> '#abc',
    window:{JijinDesktop:false}
  };
  vm.runInNewContext(source.slice(start,end)+'\nthis.markedText=markedText;',context);
  const output=context.markedText(context.state.room.messages[0],[{id:'x',message_id:'missing',end_message_id:'b',start_offset:0,end_offset:4}]);
  assert.equal(output,'hello');
  assert.ok(rendered[0].every(segment=>!segment.winner));
});

test('LOG HTML loads the updated marker-selection code',()=>{
  assert.match(html,/app\.js\?v=20261115-local-marker-selection/);
});
