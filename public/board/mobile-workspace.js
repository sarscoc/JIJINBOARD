/* Same-origin mobile presentation; original controllers own every save. */
(()=>{
  'use strict';
  if(parent===window)return;
  const tool=location.pathname.includes('/matrix')?'matrix':location.pathname.includes('/spreadsheet')?'sheets':'log';
  document.documentElement.dataset.mobileWorkspace=tool;
  const link=document.createElement('link');link.rel='stylesheet';link.href='/board/mobile-workspace.css?v=20261105-display6';document.head.append(link);
  const mq=matchMedia('(max-width:760px)'),root=document.documentElement;
  function installWorkspace(){
  const panel=document.querySelector(tool==='matrix'?'#matrixIconComments':tool==='sheets'?'#sheetComments':'#commentsPane');
  if(!panel)return false;
  function announceDock(){parent.postMessage({type:'jijin-phone-docked',visible:mq.matches&&(tool!=='log'||!document.getElementById('roomView')?.classList.contains('hidden'))},location.origin)}
  if(tool==='log'&&document.getElementById('roomView'))new MutationObserver(announceDock).observe(document.getElementById('roomView'),{attributes:true,attributeFilter:['class']});
  mq.addEventListener('change',announceDock);announceDock();
  const head=document.createElement('div');head.className='phone-dock-head';head.hidden=!mq.matches;
  mq.addEventListener('change',()=>{head.hidden=!mq.matches});
  head.innerHTML='<button type="button" class="phone-dock-grip" aria-label="コメント欄を広げる" aria-expanded="false"><i></i><span>コメント</span></button>';
  panel.prepend(head);
  const grip=head.querySelector('.phone-dock-grip');
  function syncHeaderTheme(){
    try{
      const color=parent.getComputedStyle(parent.document.documentElement).getPropertyValue('--jijin-pre-color1').trim()||'#88728e';
      if(root.style.getPropertyValue('--phone-theme')!==color)root.style.setProperty('--phone-theme',color);
    }catch{}
  }
  syncHeaderTheme();
  const themeObserver=new MutationObserver(syncHeaderTheme);
  try{themeObserver.observe(parent.document.documentElement,{attributes:true,attributeFilter:['style','class']})}catch{}
  addEventListener('pagehide',()=>themeObserver.disconnect(),{once:true});
  let hold=null,press=null,suppressClick=false,cancellingPlacement=false;
  const dockNames=['閉じる','1件分','中くらい','全面'];
  let dockLevel=1,dockDrag=null,ignoreGripClick=false,resetMatrixView=()=>{};
  const list=panel.querySelector(':scope>section,.comments-list');
  const viewportHeight=()=>Math.round(window.visualViewport?.height||innerHeight);
  function dockStops(){
    const height=viewportHeight();
    const first=list?.querySelector('.comment-thread,.matrix-comment-thread,.comment-card,.matrix-comment-card');
    const cardHeight=first?.getBoundingClientRect().height||96;
    return [28,Math.min(height*.4,Math.max(72,cardHeight+44)),Math.round(height*.5),height];
  }
  function setDock(level){
    const previous=dockLevel;dockLevel=Math.max(0,Math.min(3,level));
    if(previous!==dockLevel)resetMatrixView();
    if(root.dataset.phoneDock!==String(dockLevel))root.dataset.phoneDock=String(dockLevel);
    const size=dockStops()[dockLevel]+'px';
    if(mq.matches){if(root.style.getPropertyValue('--phone-dock-size')!==size)root.style.setProperty('--phone-dock-size',size);}
    else root.style.removeProperty('--phone-dock-size');
    for(const [name,value] of Object.entries({'aria-expanded':String(dockLevel>0),'aria-valuenow':String(dockLevel),'aria-valuetext':dockNames[dockLevel],'aria-label':`コメント欄：${dockNames[dockLevel]}。上下にドラッグして高さを変更`}))if(grip.getAttribute(name)!==value)grip.setAttribute(name,value);
    if(list&&list.inert!==(mq.matches&&dockLevel===0))list.inert=mq.matches&&dockLevel===0;
  }
  grip.setAttribute('role','slider');grip.setAttribute('aria-orientation','vertical');
  grip.setAttribute('aria-valuemin','0');grip.setAttribute('aria-valuemax','3');
  grip.onclick=()=>{if(ignoreGripClick){ignoreGripClick=false;return}setDock((dockLevel+1)%4)};
  grip.addEventListener('keydown',event=>{
    const next={ArrowUp:dockLevel+1,ArrowDown:dockLevel-1,Home:0,End:3}[event.key];
    if(next===undefined)return;event.preventDefault();setDock(next);
  });
  grip.addEventListener('pointerdown',event=>{
    if(!mq.matches||event.button>0)return;
    dockDrag={y:event.clientY,height:panel.getBoundingClientRect().height||dockStops()[dockLevel],level:dockLevel,moved:false,id:event.pointerId};
    try{grip.setPointerCapture?.(event.pointerId)}catch{}
    event.preventDefault();
  });
  grip.addEventListener('pointermove',event=>{
    if(!dockDrag)return;
    const dy=dockDrag.y-event.clientY;
    if(Math.abs(dy)>4)dockDrag.moved=true;
    if(dockDrag.moved){
      event.preventDefault();
      root.style.setProperty('--phone-dock-size',Math.max(28,Math.min(viewportHeight(),dockDrag.height+dy))+'px');
    }
  });
  function finishDock(event,cancelled=false){
    if(!dockDrag)return;
    const drag=dockDrag;dockDrag=null;
    const dy=drag.y-event.clientY,stops=dockStops(),height=Math.max(28,Math.min(viewportHeight(),drag.height+dy));
    let next=stops.reduce((best,value,index)=>Math.abs(value-height)<Math.abs(stops[best]-height)?index:best,0);
    if(!cancelled&&Math.abs(dy)>24&&next===drag.level)next=drag.level+(dy>0?1:-1);
    setDock(cancelled?drag.level:next);
    if(drag.moved||Math.abs(dy)>4){ignoreGripClick=true;setTimeout(()=>ignoreGripClick=false,0)}
    try{grip.releasePointerCapture?.(drag.id)}catch{}
  }
  grip.addEventListener('pointerup',event=>finishDock(event));
  grip.addEventListener('pointercancel',event=>finishDock(event,true));
  grip.addEventListener('lostpointercapture',event=>finishDock(event,true));
  // One-card height follows newly loaded comments and attached images.
  let observedCard=null;
  const cardResize=typeof ResizeObserver==='function'?new ResizeObserver(()=>{if(dockLevel===1&&!dockDrag)setDock(1)}):null;
  function observeFirstCard(){
    const card=list?.querySelector('.comment-thread,.matrix-comment-thread,.comment-card,.matrix-comment-card');
    if(card===observedCard)return;
    if(observedCard)cardResize?.unobserve(observedCard);observedCard=card;if(card)cardResize?.observe(card);
    if(dockLevel===1&&!dockDrag)setDock(1);
  }
  if(list)new MutationObserver(observeFirstCard).observe(list,{childList:true,subtree:true});
  observeFirstCard();setDock(1);
  function attachComposer(dialog){
    if(dialog.dataset.phoneComposer)return;
    dialog.dataset.phoneComposer='1';
    const actions=document.createElement('div');actions.className='phone-composer-actions';actions.hidden=!mq.matches;
    mq.addEventListener('change',()=>{actions.hidden=!mq.matches});
    const cancel=document.createElement('button');cancel.type='button';cancel.textContent='閉じる';cancel.onclick=()=>dialog.close();
    const send=document.createElement('button');send.type='button';send.textContent='送信';send.onclick=()=>dialog.querySelector('form')?.requestSubmit();
    actions.append(cancel,send);dialog.append(actions);
    const update=()=>{
      const composing=mq.matches&&dialog.open;
      if(root.classList.contains('phone-composing')!==composing)root.classList.toggle('phone-composing',composing);
      if(composing){window.visualViewport?.addEventListener('resize',viewport)}
      else window.visualViewport?.removeEventListener('resize',viewport);
    };
    new MutationObserver(update).observe(dialog,{attributes:true,attributeFilter:['open']});dialog.addEventListener('close',update);update();
  }
  const composerSelector=tool==='matrix'?'#matrixIconCommentDialog':tool==='sheets'?'#sheetCommentDialog':'#commentDialog';
  function findComposer(){const dialog=document.querySelector(composerSelector);if(dialog)attachComposer(dialog)}
  new MutationObserver(findComposer).observe(document.body,{childList:true});findComposer();
  function viewport(){
    if(!mq.matches){root.style.removeProperty('--phone-visible-height');return}
    const height=Math.round(window.visualViewport?.height||innerHeight);
    root.style.setProperty('--phone-visible-height',height+'px');
    if(!dockDrag)setDock(dockLevel);
  }
  window.visualViewport?.addEventListener('resize',viewport);addEventListener('resize',viewport);
  mq.addEventListener('change',()=>{dockDrag=null;root.classList.remove('phone-composing');viewport();setDock(dockLevel)});viewport();
  // Observe a stationary press, cancel on scroll/drag; never synthesize a save.
  function clearHold(){clearTimeout(hold);hold=null}
  function beginComment(el){
    if(tool==='matrix'){
      window.openMatrixIconComment?.(el.dataset.id||'');
    }else if(tool==='log'){
      const text=el.querySelector('.message-text');if(!text)return;
      const selection=getSelection(),range=document.createRange();range.selectNodeContents(text);selection.removeAllRanges();selection.addRange(range);
      if(typeof selectionInfo==='function'&&typeof state!=='undefined'&&typeof openCommentDialog==='function'){
        const info=selectionInfo();if(info?.quote?.trim()){state.selection=info;openCommentDialog()}
      }
    }
  }
  if(tool==='log')for(const type of ['mouseup','touchend'])window.addEventListener(type,event=>{
    if(mq.matches&&event.target.closest('.log-message[data-message]'))event.stopImmediatePropagation();
  },true);
  if(tool==='sheets'){
    let sheetZoom=1,sheetPinch=null,consumingPinch=false;
    const hostFor=node=>node?.closest?.('#sheetWrap,#fullCharacterPages');
    const pair=touches=>{
      const [a,b]=Array.from(touches);
      return {x:(a.clientX+b.clientX)/2,y:(a.clientY+b.clientY)/2,distance:Math.max(1,Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY))};
    };
    window.addEventListener('touchstart',event=>{
      if(!mq.matches||event.touches.length!==2)return;
      const touches=Array.from(event.touches),host=hostFor(touches[0].target);
      if(!host||hostFor(touches[1].target)!==host)return;
      const mid=pair(touches),rect=host.getBoundingClientRect();
      sheetPinch={host,distance:mid.distance,zoom:sheetZoom,x:(host.scrollLeft+mid.x-rect.left)/sheetZoom,y:(host.scrollTop+mid.y-rect.top)/sheetZoom};
      consumingPinch=true;clearHold();press=null;suppressClick=true;
      event.preventDefault();event.stopImmediatePropagation();
    },{capture:true,passive:false});
    window.addEventListener('touchmove',event=>{
      if(!mq.matches||!consumingPinch)return;
      event.preventDefault();event.stopImmediatePropagation();
      if(!sheetPinch||event.touches.length!==2)return;
      const mid=pair(event.touches),{host}=sheetPinch,rect=host.getBoundingClientRect();
      sheetZoom=Math.max(.5,Math.min(3,sheetPinch.zoom*mid.distance/sheetPinch.distance));
      root.style.setProperty('--phone-sheet-zoom',String(sheetZoom));
      host.scrollLeft=sheetPinch.x*sheetZoom-(mid.x-rect.left);
      host.scrollTop=sheetPinch.y*sheetZoom-(mid.y-rect.top);
    },{capture:true,passive:false});
    function endSheetPinch(event){
      if(!consumingPinch)return;
      event.preventDefault();event.stopImmediatePropagation();sheetPinch=null;
      if(!event.touches.length){consumingPinch=false;press=null;setTimeout(()=>suppressClick=false,400)}
    }
    window.addEventListener('touchend',endSheetPinch,{capture:true,passive:false});
    window.addEventListener('touchcancel',endSheetPinch,{capture:true,passive:false});
    // Leave ordinary one-finger scrolling and cell taps with the original controls.
    for(const type of ['pointermove','pointerup','pointercancel'])window.addEventListener(type,event=>{
      if(mq.matches&&consumingPinch)event.stopImmediatePropagation();
    },true);
    mq.addEventListener('change',()=>{sheetPinch=null;consumingPinch=false;sheetZoom=1;root.style.removeProperty('--phone-sheet-zoom')});
  }
  if(tool==='matrix'){
    const canvas=document.getElementById('canvas'),stage=canvas?.parentElement;
    if(canvas&&stage){
      const touches=new Map();let zoom=1,offsetX=0,offsetY=0,baseWidth=0,baseHeight=0,pinch=null,pan=null,zoomGesture=false;
      function paintZoom(){
        if(!mq.matches||zoom===1){for(const key of ['width','height','x','y'])canvas.style.removeProperty('--phone-canvas-'+key);return}
        const width=baseWidth,height=baseHeight;
        offsetX=Math.max(width*(1-zoom),Math.min(0,offsetX));offsetY=Math.max(height*(1-zoom),Math.min(0,offsetY));
        // Resize the canvas itself so existing template coordinates and icon scale remain correct.
        canvas.style.setProperty('--phone-canvas-width',width*zoom+'px');canvas.style.setProperty('--phone-canvas-height',height*zoom+'px');
        canvas.style.setProperty('--phone-canvas-x',offsetX+'px');canvas.style.setProperty('--phone-canvas-y',offsetY+'px');
      }
      function resetZoom(){zoom=1;offsetX=offsetY=0;pinch=pan=null;touches.clear();zoomGesture=false;paintZoom()}
      function midpoint(){const [a,b]=[...touches.values()];return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y))}}
      window.addEventListener('pointerdown',event=>{
        if(!mq.matches||event.pointerType==='mouse'||!event.target.closest('#canvas')||event.target.closest('dialog,input,textarea,button'))return;
        if(!touches.size&&zoom===1){baseWidth=stage.clientWidth;baseHeight=stage.clientHeight}
        touches.set(event.pointerId,{x:event.clientX,y:event.clientY});
        if(touches.size>=2){
          const mid=midpoint(),rect=stage.getBoundingClientRect();
          pinch={...mid,zoom,x:(mid.x-rect.left-offsetX)/zoom,y:(mid.y-rect.top-offsetY)/zoom};pan=null;zoomGesture=true;
          clearHold();
          // The first finger is still pending; do not invoke a placement writer for a pinch.
          if(press?.dragging){touches.delete(event.pointerId);pinch=null;zoomGesture=false;event.preventDefault();event.stopImmediatePropagation();return}
          press=null;suppressClick=true;
        }else if(zoom>1&&!event.target.closest('.placed')){pan={x:event.clientX,y:event.clientY,offsetX,offsetY};zoomGesture=true;clearHold();press=null}
        if(zoomGesture){event.preventDefault();event.stopImmediatePropagation();try{canvas.setPointerCapture?.(event.pointerId)}catch{}}
      },true);
      window.addEventListener('pointermove',event=>{
        if(!touches.has(event.pointerId))return;
        touches.set(event.pointerId,{x:event.clientX,y:event.clientY});
        if(!zoomGesture)return;
        event.preventDefault();event.stopImmediatePropagation();
        if(pinch&&touches.size>=2){
          const mid=midpoint(),rect=stage.getBoundingClientRect();zoom=Math.max(1,Math.min(4,pinch.zoom*mid.distance/pinch.distance));
          offsetX=mid.x-rect.left-pinch.x*zoom;offsetY=mid.y-rect.top-pinch.y*zoom;paintZoom();
        }else if(pan){offsetX=pan.offsetX+event.clientX-pan.x;offsetY=pan.offsetY+event.clientY-pan.y;paintZoom()}
      },{capture:true,passive:false});
      function endZoom(event){
        if(!touches.has(event.pointerId))return;touches.delete(event.pointerId);
        if(!zoomGesture)return;
        event.preventDefault();event.stopImmediatePropagation();pinch=pan=null;
        try{canvas.releasePointerCapture?.(event.pointerId)}catch{}
        if(!touches.size){zoomGesture=false;press=null;setTimeout(()=>suppressClick=false,400)}
      }
      window.addEventListener('pointerup',endZoom,true);window.addEventListener('pointercancel',endZoom,true);
      resetMatrixView=resetZoom;
      addEventListener('resize',resetZoom);mq.addEventListener('change',resetZoom);addEventListener('matrix-template-selected',resetZoom);paintZoom();
    }
  }
  window.addEventListener('pointerdown',event=>{
    if(!mq.matches||event.button>0||event.target.closest('input,textarea,select,dialog,.phone-dock-head,#commentsPane,#matrixIconComments,#sheetComments'))return;
    if(tool!=='matrix'&&event.target.closest('button'))return;
    const el=event.target.closest(tool==='matrix'?'.placed[data-id]':tool==='log'?'.log-message[data-message]':'[data-sheet-cell]');
    press={x:event.clientX,y:event.clientY,el,time:Date.now(),id:event.pointerId,down:event};
    // Decide the touch direction before handing an icon to its existing drag handler.
    if(tool==='matrix'&&el)event.stopPropagation();
    if(el&&tool!=='sheets')hold=setTimeout(()=>{
      hold=null;
      // Cancel the legacy 540ms placement-note gesture before opening the shared composer.
      if(tool==='matrix')el.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:press?.id||1}));
      suppressClick=true;beginComment(el);
    },500);
  },true);
  window.addEventListener('pointermove',event=>{
    if(!press)return;
    const dx=event.clientX-press.x,dy=event.clientY-press.y;
    if(Math.hypot(dx,dy)>10)clearHold();
    if(tool==='matrix'&&press.el&&!press.swiping&&!press.dragging&&Math.abs(dy)>10&&Math.abs(dy)>Math.abs(dx)*1.5){
      press.dragging=true;
      if(typeof startPlacedDrag==='function')startPlacedDrag(press.down,press.el.dataset.id,press.el);
    }
    if(tool==='matrix'&&!press.dragging&&!press.swiping&&Math.abs(dx)>14&&Math.abs(dx)>Math.abs(dy)*1.5){
      press.swiping=true;suppressClick=true;
      // A horizontal page gesture must not also move or save the placed icon.
      if(press.el){cancellingPlacement=true;try{press.el.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:press.id||1}))}finally{cancellingPlacement=false}}
    }
  },true);
  window.addEventListener('pointercancel',()=>{if(cancellingPlacement)return;clearHold();press=null;suppressClick=false},true);
  window.addEventListener('pointerup',event=>{
    clearHold();
    if(mq.matches&&press){
      const dx=event.clientX-press.x,dy=event.clientY-press.y;
      if(!press.dragging&&Math.abs(dx)>75&&Math.abs(dy)<40&&!event.target.closest('dialog,#sheetComments,#commentsPane,#matrixIconComments')){
        if(tool==='log'){suppressClick=true;parent.postMessage({type:'jijin-phone-log-list'},location.origin)}
        if(tool==='matrix'&&typeof setMobileMainView==='function'){suppressClick=true;setMobileMainView(dx>0?'icons':'stage',false)}
      }
    }
    press=null;setTimeout(()=>suppressClick=false,400);
  },true);
  // Existing desktop MATRIX clicks open comments. Phone taps stay available for placement.
  window.addEventListener('click',event=>{
    if(!mq.matches)return;
    if(suppressClick||(tool==='matrix'&&event.target.closest('.placed[data-id]')&&!event.target.closest('dialog'))){event.preventDefault();event.stopImmediatePropagation();suppressClick=false}
  },true);
  window.addEventListener('contextmenu',event=>{if(mq.matches&&event.target.closest('.placed[data-id],.log-message[data-message]')){event.preventDefault();event.stopImmediatePropagation()}},true);
  if(tool==='matrix'){
    const resetView=()=>{if(mq.matches&&typeof setMobileMainView==='function')setMobileMainView('stage',false)};
    resetView();
    let selectingTemplate=false;
    // The template's own click handler stops bubbling and loads asynchronously.
    document.getElementById('templateTabs')?.addEventListener('click',event=>{if(mq.matches&&event.target.closest('.template-tab'))selectingTemplate=true},true);
    addEventListener('matrix-template-selected',()=>{if(selectingTemplate){selectingTemplate=false;requestAnimationFrame(resetView)}});
  }
  addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==parent||event.data?.type!=='jijin-phone-options'||!mq.matches)return;
    if(tool==='log')document.querySelector('.room-tools')?.classList.toggle('phone-filters-open');
    if(tool==='matrix')document.getElementById('settingsMenuBtn')?.click();
    if(tool==='sheets')root.classList.toggle('phone-options-open');
  });
  addEventListener('message',event=>{if(event.origin===location.origin&&event.source===parent&&mq.matches&&event.data?.type==='jijin-phone-collection'&&tool==='matrix'&&typeof setMobileMainView==='function')setMobileMainView('icons',false)});
  addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==parent||!mq.matches||tool!=='matrix'||event.data?.type!=='jijin-phone-action')return;
    const controls={'new-template':'newTemplateBtn','export-matrix':'exportImageBtn'},id=controls[event.data.action];if(id)document.getElementById(id)?.click();
  });
  return true;
  }
  // Sheets may create its comment panel only after the first remote snapshot arrives.
  if(!installWorkspace()){
    const waiting=new MutationObserver(()=>{if(installWorkspace())waiting.disconnect()});
    waiting.observe(document.body,{childList:true,subtree:true});
    addEventListener('pagehide',()=>waiting.disconnect(),{once:true});
  }
})();
