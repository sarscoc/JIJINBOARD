import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const page=readFileSync(new URL('../public/matrix/index.html',import.meta.url),'utf8');

test('reusing a character source creates independent pieces and returning one keeps the others',()=>{
 const id='participant:pl:pc';
 const state={items:{[id]:{placed:true,x:15,y:30,comment:'既存の補足',crop:{x:2,y:3,zoom:1},zOrder:1}}};
 const ctx={items:[{id,name:'PC'}],appState:()=>state,mutate:fn=>fn(state),templateSpaceReady:()=>false,
  renderPlaced(){},renderTemplateTabs:async()=>{},crypto,console};
 const placement=page.slice(page.indexOf('function matrixPieceSourceId('),page.indexOf('function sizeIconImage('));
 const ordering=page.slice(page.indexOf('function orderedPlacedItems('),page.indexOf('function bringPlacedToFront('));
 runInNewContext(placement+ordering,ctx);
 const second=ctx.placeItem(id,55,65);
 assert.notEqual(second,id);
 assert.equal(ctx.matrixPieceSourceId(second),id);
 assert.equal(state.items[id].x,15);
 assert.equal(state.items[id].comment,'既存の補足');
 assert.equal(state.items[second].comment,undefined);
 assert.equal(state.items[second].x,55);
 assert.equal(state.items[second].crop.x,2);
 assert.equal(ctx.orderedPlacedItems().length,2);
 ctx.removeMatrixPlacement(second,true);
 assert.equal(state.items[second].placed,false);
 assert.equal(state.items[id].mobileSelected,true);
 assert.equal(ctx.orderedPlacedItems()[0].id,id);
 assert.equal(ctx.orderedPlacedItems().length,1);
 assert.notEqual(ctx.placeItem(id,75,80),second);
});
