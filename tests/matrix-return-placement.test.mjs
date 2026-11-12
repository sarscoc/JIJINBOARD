import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

test('returning a MATRIX piece only clears its placement and keeps it in the phone tray',()=>{
 const page=readFileSync(new URL('../public/matrix/index.html',import.meta.url),'utf8');
 const state={items:{first:{placed:true,x:20,comment:'補足'},second:{placed:true,x:80}}};
 const ctx={mutate:fn=>fn(state),renderPlaced(){},renderTemplateTabs:async()=>{},console};
 runInNewContext(page.slice(page.indexOf('function pointInside('),page.indexOf('function placeItem(')),ctx);
 assert.equal(ctx.pointInside({getBoundingClientRect:()=>({width:200,height:40,left:0,right:200,top:0,bottom:40})},90,20),true);
 assert.equal(ctx.pointInside({getBoundingClientRect:()=>({width:0,height:0,left:0,right:0,top:0,bottom:0})},0,0),false);
 ctx.removeMatrixPlacement('first',true);
 assert.deepEqual(state.items.first,{placed:false,x:20,comment:'補足',mobileSelected:true});
 assert.deepEqual(state.items.second,{placed:true,x:80});
});
