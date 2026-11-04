/* Same-origin mobile presentation; original controllers own every save. */
(()=>{
  'use strict';
  if(parent===window)return;
  const tool=location.pathname.includes('/matrix')?'matrix':location.pathname.includes('/spreadsheet')?'sheets':'log';
  document.documentElement.dataset.mobileWorkspace=tool;
  const link=document.createElement('link');link.rel='stylesheet';link.href='/board/mobile-workspace.css?v=20261104-display3';document.head.append(link);
  const mq=matchMedia('(max-width:760px)'),root=document.documentElement;
  function installWorkspace(){
  const panel=document.querySelector(tool==='matrix'?'#matrixIconComments':tool==='sheets'?'#sheetComments':'#commentsPane');
  if(!panel)return false;
  const list=panel.querySelector(':scope>section,.comments-list');
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
      root.style.setProperty('--phone-theme',color);
      const hex=/^#[0-9a-f]{6}$/i.test(color)?color.slice(1):'88728e';
      const rgb=[0,2,4].map(at=>parseInt(hex.slice(at,at+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
      root.style.setProperty('--phone-theme-ink',rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722>.179?'#22252b':'#fff');
    }catch{}
  }
  syncHeaderTheme();
  const themeObserver=new MutationObserver(syncHeaderTheme);
  try{themeObserver.observe(parent.document.documentElement,{attributes:true,attributeFilter:['style','class']})}catch{}
  addEventListener('pagehide',()=>themeObserver.disconnect(),{once:true});
  let expanded=false,hold=null,press=null,suppressClick=false,filterTimer=0,cancellingPlacement=false;
  function expand(value){expanded=!!value;root.classList.toggle('phone-comments-expanded',expanded);grip.setAttribute('aria-expanded',String(expanded));grip.setAttribute('aria-label',expanded?'コメント欄を小さくする':'コメント欄を広げる')}
  grip.onclick=()=>expand(!expanded);
  let drag=null;
  grip.addEventListener('pointerdown',event=>{if(!mq.matches)return;drag={x:event.clientX,y:event.clientY};grip.setPointerCapture?.(event.pointerId)});
  grip.addEventListener('pointerup',event=>{if(!drag)return;const dy=event.clientY-drag.y;if(Math.abs(dy)>24){expand(dy<0);suppressClick=true;setTimeout(()=>suppressClick=false,0)}drag=null});
  grip.addEventListener('click',event=>{if(suppressClick){event.preventDefault();event.stopImmediatePropagation()}},true);
  grip.addEventListener('pointercancel',()=>drag=null);
  const noMatches=document.createElement('p');noMatches.className='phone-filter-empty';noMatches.textContent='コメントはまだありません。';noMatches.hidden=true;panel.append(noMatches);
  function applyFilter(){
    if(!list)return;
    const rows=[...list.children].filter(el=>el.matches('.comment-thread,.matrix-comment-thread'));
    let count=0;
    for(const row of rows){
      const card=row.querySelector('[data-target],[data-comment-target],[data-cell]');
      let show=true;
      if(mq.matches&&card){
        const id=card.dataset.target||card.dataset.commentTarget||card.dataset.cell||'';
        if(tool==='log'&&typeof state!=='undefined'&&state.room){
          const tab=typeof activeTabName==='function'?activeTabName():state.mainTab;
          show=state.room.messages.some(message=>message.id===id&&message.tab===tab);
        }
      }
      if(row.hidden===show)row.hidden=!show;
      if(show)count+=row.querySelectorAll('.comment-card,.matrix-comment-card').length;
    }
    const label=`コメント ${count}`;
    if(grip.querySelector('span').textContent!==label)grip.querySelector('span').textContent=label;
    const empty=mq.matches&&rows.length>0&&count===0;
    if(noMatches.hidden===empty)noMatches.hidden=!empty;
  }
  function scheduleFilter(){clearTimeout(filterTimer);filterTimer=setTimeout(applyFilter,0)}
  if(list)new MutationObserver(scheduleFilter).observe(list,{childList:true,subtree:true});
  document.addEventListener('click',scheduleFilter);
  const logPane=document.getElementById('logPane');if(logPane)new MutationObserver(scheduleFilter).observe(logPane,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
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
      if(composing){expand(false);window.visualViewport?.addEventListener('resize',viewport)}
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
  }
  window.visualViewport?.addEventListener('resize',viewport);addEventListener('resize',viewport);
  mq.addEventListener('change',()=>{expand(false);root.classList.remove('phone-composing');viewport();applyFilter()});viewport();applyFilter();
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
    applyFilter();
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
