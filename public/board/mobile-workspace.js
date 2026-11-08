/* Same-origin mobile presentation; original controllers own every save. */
(()=>{
  'use strict';
  if(parent===window)return;
  const tool=location.pathname.includes('/matrix')?'matrix':location.pathname.includes('/spreadsheet')?'sheets':'log';
  document.documentElement.dataset.mobileWorkspace=tool;
  const link=document.createElement('link');link.rel='stylesheet';link.href='/board/mobile-workspace.css?v=20261105-display8';document.head.append(link);
  const mq=matchMedia('(max-width:760px)'),root=document.documentElement;
  let workspaceInstalled=false,settleMatrix=()=>{};
  function revealLog(){
    if(tool!=='log'||!workspaceInstalled||!mq.matches||!link.sheet)return;
    const ready=()=>parent.postMessage({type:'jijin-phone-log-ready'},location.origin);
    if(typeof requestAnimationFrame==='function')requestAnimationFrame(ready);else ready();
  }
  link.addEventListener('load',revealLog);mq.addEventListener('change',revealLog);
  if(tool==='matrix'){
    let stylesReady=!!link.sheet,sequence=0,frameReadySent=false;
    root.dataset.phoneMatrixSizing='1';
    settleMatrix=()=>{
      if(!mq.matches){delete root.dataset.phoneMatrixSizing;return}
      if(typeof requestAnimationFrame!=='function')return;
      root.dataset.phoneMatrixSizing='1';
      const current=++sequence;let previous='',stable=0,attempts=0;
      function measure(){
        if(current!==sequence||!mq.matches)return;
        const canvas=document.getElementById('canvas'),image=document.getElementById('templateImg');
        const rect=canvas?.getBoundingClientRect();
        const signature=[canvas,document.getElementById('templateOverlay'),canvas?.querySelector('.placed')].filter(Boolean).map(node=>{
          const r=node.getBoundingClientRect();return [r.width,r.height].map(value=>Math.round(value*10)).join(',');
        }).join('|');
        stable=signature===previous?stable+1:0;previous=signature;
        if(stylesReady&&workspaceInstalled&&rect?.width>0&&rect?.height>0&&stable>=2){
          if(!frameReadySent){parent.postMessage({type:'jijin-phone-matrix-ready'},location.origin);frameReadySent=true}
          if(!image?.getAttribute('src')||image.complete){delete root.dataset.phoneMatrixSizing;return}
        }
        if(++attempts<120)requestAnimationFrame(measure);
      }
      requestAnimationFrame(measure);
    };
    link.addEventListener('load',()=>{stylesReady=true;settleMatrix()});
    link.addEventListener('error',()=>{stylesReady=true;settleMatrix()});
    document.addEventListener('load',event=>{if(event.target.id==='templateImg')settleMatrix()},true);
    document.addEventListener('error',event=>{if(event.target.id==='templateImg')settleMatrix()},true);
    const image=document.getElementById('templateImg');
    if(image)new MutationObserver(settleMatrix).observe(image,{attributes:true,attributeFilter:['src']});
    addEventListener('matrix-template-selected',settleMatrix);addEventListener('matrix-board-active',settleMatrix);
    mq.addEventListener('change',settleMatrix);document.fonts?.ready.then(settleMatrix);
  }
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
  const composerSelector=tool==='matrix'?'#matrixIconCommentDialog':tool==='sheets'?'#sheetCommentDialog':'#commentDialog';
  const editAttribute=tool==='matrix'?'data-matrix-edit':tool==='sheets'?'data-edit':'data-edit-comment';
  let requestedEdit=null;
  const composers=new Map();
  function editCard(reference){
    if(!reference||!list)return null;
    return [...list.querySelectorAll(`[${editAttribute}]`)].find(button=>button.getAttribute(editAttribute)===reference)?.closest('.comment-card,.matrix-comment-card')||null;
  }
  // Capture intent before the original controller opens or fills its form.
  window.addEventListener('click',event=>{
    if(!mq.matches||!event.target.closest||event.target.closest(composerSelector))return;
    const dialog=document.querySelector(composerSelector);
    if(dialog?.open&&dialog.querySelector('textarea')?.value.trim())return;
    const edit=event.target.closest(`[${editAttribute}]`);
    if(edit&&list?.contains(edit))requestedEdit=edit.getAttribute(editAttribute);
    else if(event.target.closest('[data-reply-comment],[data-matrix-reply],[data-reply],[data-sheet-cell],.placed,.log-message'))requestedEdit=null;
    queueMicrotask(findComposer);
  },true);
  function attachComposer(dialog){
    if(composers.has(dialog))return;
    dialog.dataset.phoneComposer='1';
    const home=document.createComment('phone composer home');dialog.before(home);
    const actions=document.createElement('div');actions.className='phone-composer-actions';actions.hidden=!mq.matches;
    mq.addEventListener('change',()=>{actions.hidden=!mq.matches});
    const cancel=document.createElement('button');cancel.type='button';cancel.textContent='×';cancel.setAttribute('aria-label','入力を閉じる');cancel.onclick=()=>dialog.close();
    const send=document.createElement('button');send.type='button';send.textContent='↑';send.setAttribute('aria-label','送信');send.onclick=()=>dialog.querySelector('form')?.requestSubmit();
    actions.append(cancel,send);dialog.append(actions);
    const record={home,card:null,wasComposing:false,focused:null,geometry:null};composers.set(dialog,record);
    const textarea=dialog.querySelector('textarea');
    function measureComposer(){
      if(!mq.matches||!dialog.open)return;
      const height=Math.ceil(dialog.getBoundingClientRect().height||108)+12;
      if(root.style.getPropertyValue('--phone-composer-height')!==height+'px')root.style.setProperty('--phone-composer-height',height+'px');
    }
    function resizeInput(){
      if(!mq.matches||!textarea)return;
      textarea.style.setProperty('--phone-input-height','36px');
      textarea.style.setProperty('--phone-input-height',Math.min(140,Math.max(36,textarea.scrollHeight))+'px');
      measureComposer();
    }
    textarea?.addEventListener('input',resizeInput);
    const composerResize=typeof ResizeObserver==='function'?new ResizeObserver(measureComposer):null;
    composerResize?.observe(dialog);
    addEventListener('pagehide',()=>composerResize?.disconnect(),{once:true});
    dialog.addEventListener('focusin',event=>{record.focused=event.target});
    function update(){
      const composing=mq.matches&&dialog.open;
      // The native LOG positioner writes important inline coordinates; the phone form flows in its list.
      const geometry=['width','left','right','top','bottom'];
      if(composing){
        if(!record.geometry)record.geometry=geometry.map(name=>[name,dialog.style.getPropertyValue(name),dialog.style.getPropertyPriority(name)]);
        for(const name of geometry)if(dialog.style.getPropertyValue(name))dialog.style.removeProperty(name);
      }else if(record.geometry){
        const saved=record.geometry;record.geometry=null;
        for(const [name,value,priority] of saved)if(value)dialog.style.setProperty(name,value,priority);
      }
      if(record.card&&!record.card.isConnected)record.card=null;
      let reference=requestedEdit;
      if(tool==='log'&&typeof state!=='undefined'&&state.editingCommentId!==undefined)reference=state.editingCommentId||null;
      const card=composing?editCard(reference):null;
      if(record.card&&record.card!==card)record.card.classList.remove('phone-comment-editing');
      record.card=card;
      if(card&&!card.classList.contains('phone-comment-editing'))card.classList.add('phone-comment-editing');
      const detached=!dialog.isConnected;
      if(composing&&list){
        // Keep the same live form and its draft when a remote render replaces the list.
        if(card){if(dialog.parentNode!==card.parentNode||dialog.nextSibling!==card)card.before(dialog)}
        else if(list.firstElementChild!==dialog)list.prepend(dialog);
      }else if(home.isConnected&&home.nextSibling!==dialog)home.after(dialog);
      const action=card?'変更を保存':'送信';if(send.getAttribute('aria-label')!==action)send.setAttribute('aria-label',action);
      const anyOpen=[...composers.keys()].some(item=>mq.matches&&item.open);
      if(root.classList.contains('phone-composing')!==anyOpen)root.classList.toggle('phone-composing',anyOpen);
      if(composing&&!record.wasComposing){
        if(dockLevel<2)setDock(2);
        resizeInput();if(list)list.scrollTop=0;
        if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>{
          if(!dialog.open||!list)return;
          const bounds=list.getBoundingClientRect(),rect=dialog.getBoundingClientRect();
          if(rect.top<bounds.top)list.scrollTop+=rect.top-bounds.top;
          else if(rect.bottom>bounds.bottom)list.scrollTop+=rect.bottom-bounds.bottom;
        });
      }
      if(composing&&detached&&record.focused&&document.activeElement===document.body)record.focused.focus({preventScroll:true});
      record.wasComposing=composing;
    }
    record.update=update;
    new MutationObserver(update).observe(dialog,{attributes:true,attributeFilter:['open','style']});
    dialog.addEventListener('close',()=>{requestedEdit=null;update()});mq.addEventListener('change',update);update();
  }
  function findComposer(){
    const dialog=document.querySelector(composerSelector);if(dialog)attachComposer(dialog);
    for(const record of composers.values())record.update();
  }
  new MutationObserver(findComposer).observe(document.body,{childList:true,subtree:true});findComposer();
  function viewport(){
    if(!mq.matches){root.style.removeProperty('--phone-visible-height');return}
    const height=Math.round(window.visualViewport?.height||innerHeight);
    root.style.setProperty('--phone-visible-height',height+'px');
    if(!dockDrag)setDock(dockLevel);
  }
  window.visualViewport?.addEventListener('resize',viewport);addEventListener('resize',viewport);
  mq.addEventListener('change',()=>{dockDrag=null;root.classList.remove('phone-composing');viewport();setDock(dockLevel)});viewport();
  if(tool==='matrix')window.addEventListener('matrix-point-comments-open',()=>{if(mq.matches&&dockLevel<2)setDock(2)});
  // Observe a stationary press, cancel on scroll/drag; never synthesize a save.
  function clearHold(){clearTimeout(hold);hold=null}
  function beginComment(el){
    if(!document.querySelector(composerSelector)?.open)requestedEdit=null;
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
  workspaceInstalled=true;settleMatrix();revealLog();
  return true;
  }
  // Sheets may create its comment panel only after the first remote snapshot arrives.
  if(!installWorkspace()){
    const waiting=new MutationObserver(()=>{if(installWorkspace())waiting.disconnect()});
    waiting.observe(document.body,{childList:true,subtree:true});
    addEventListener('pagehide',()=>waiting.disconnect(),{once:true});
  }
})();
