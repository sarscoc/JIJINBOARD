import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/log/comment-submit-guard.js',import.meta.url),'utf8');
function place(viewport,readerRight,anchor){
 const style={},dialog={open:true,offsetHeight:200,style:{setProperty(k,v){style[k]=v}}};
 const c={innerWidth:viewport,innerHeight:900,state:{pendingSelection:anchor},positionCommentDialog(){},document:{querySelector:s=>s==='#commentDialog'?dialog:s==='#logPane'?{getBoundingClientRect:()=>({right:readerRight})}:null},addEventListener(){},clearInterval(){}};
 c.window=c;c.parent=c;vm.runInNewContext(source,c);c.positionCommentDialog();return style;
}
test('comment composer is placed just beyond the selected passage',()=>{
 const s=place(1400,1000,{anchorLeft:100,anchorRight:800,anchorTop:200,anchorBottom:230});
 assert.equal(s.left,'808px');assert.equal(s.width,'390px');
});
test('when no right gutter exists the composer moves below the selected passage',()=>{
 const s=place(700,690,{anchorLeft:20,anchorRight:650,anchorTop:100,anchorBottom:130});
 assert.equal(s.top,'138px');assert.equal(s.left,'302px');assert.equal(s.width,'390px');
});
