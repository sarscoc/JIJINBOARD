/* Phone navigation uses the existing tools and participant editors. */
(()=>{
  'use strict';
  const mq=matchMedia('(max-width:760px)'),menu=document.getElementById('mobileMenu');
  const sidebar=document.getElementById('logSidebar'),backdrop=document.getElementById('mobileLogsBackdrop');
  const stage=document.querySelector('.tool-stage');
  if(!menu||!sidebar||!backdrop||!stage)return;
  // The fixed board layout creates a stacking context. Keep the scrim inside it,
  // behind the drawer, so it cannot cover the log buttons on the phone.
  sidebar.parentElement.insertBefore(backdrop,sidebar);
  const frames=[...document.querySelectorAll('.tool-frame')];
  const activeFrame=()=>frames.find(frame=>!frame.classList.contains('hidden'));
  let listOpen=false;
  function showLogs(value){
    listOpen=!!value&&mq.matches;
    document.body.classList.toggle('mobile-logs-open',listOpen);backdrop.hidden=!listOpen;
    sidebar.inert=mq.matches&&!listOpen;stage.inert=listOpen;
    document.getElementById('mobileLogsButton')?.setAttribute('aria-expanded',String(listOpen));
    if(listOpen)(sidebar.querySelector('.log-item.active,.log-item,button:not(.hidden)'))?.focus();
  }
  function openMenu(){if(mq.matches&&!menu.open)menu.showModal()}
  const closeMenu=()=>{if(menu.open)menu.close()};
  document.getElementById('mobileMenuButton').onclick=openMenu;
  document.getElementById('mobileMenuClose').onclick=closeMenu;
  menu.addEventListener('click',event=>{if(event.target===menu)closeMenu()});
  document.getElementById('mobileMenuLogs').onclick=()=>{closeMenu();if(activeFrame()?.id==='matrixFrame')activeFrame().contentWindow?.postMessage({type:'jijin-phone-collection'},location.origin);else showLogs(true)};
  document.getElementById('mobileMenuPeople').onclick=()=>{closeMenu();document.getElementById('boardSettingsButton')?.click()};
  document.getElementById('mobileMenuOptions').onclick=()=>{closeMenu();activeFrame()?.contentWindow?.postMessage({type:'jijin-phone-options'},location.origin)};
  menu.querySelectorAll('[data-phone-action]').forEach(button=>button.onclick=()=>{closeMenu();activeFrame()?.contentWindow?.postMessage({type:'jijin-phone-action',action:button.dataset.phoneAction},location.origin)});
  document.getElementById('mobileLogsButton').onclick=()=>showLogs(!listOpen);
  backdrop.onclick=()=>showLogs(false);
  sidebar.addEventListener('click',event=>{if(event.target.closest('[data-room],[data-edit-log],#addLogButton'))showLogs(false)});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&listOpen){event.preventDefault();showLogs(false)}});
  document.querySelectorAll('[data-tool]').forEach(tab=>tab.addEventListener('click',()=>{showLogs(false);closeMenu()}));
  function syncTabs(){
    document.querySelectorAll('[data-tool]').forEach(tab=>{if(tab.classList.contains('active'))tab.setAttribute('aria-current','page');else tab.removeAttribute('aria-current')});
    const collection=document.getElementById('mobileMenuLogs'),frame=activeFrame();
    collection.textContent=frame?.id==='matrixFrame'?'テンプレ一覧':'ログ一覧';collection.hidden=frame?.id==='spreadsheetFrame';
    menu.querySelectorAll('[data-phone-action]').forEach(button=>button.hidden=frame?.id!=='matrixFrame'||button.dataset.phoneAction==='new-template');
    document.getElementById('mobileMenuOptions').hidden=frame?.id==='matrixFrame';
    document.getElementById('mobileMenuPeople').textContent='PL・PC設定';
    document.body.classList.toggle('phone-frame-docked',frame?.dataset.phoneDocked==='1');
  }
  new MutationObserver(syncTabs).observe(document.querySelector('.app-tabs'),{subtree:true,attributes:true,attributeFilter:['class']});
  mq.addEventListener('change',()=>{showLogs(false);closeMenu()});showLogs(false);syncTabs();
  addEventListener('message',event=>{
    const matrix=document.getElementById('matrixFrame');
    if(event.origin===location.origin&&event.source===matrix?.contentWindow&&event.data?.type==='jijin-phone-matrix-ready')matrix.dataset.phoneReady='1';
    const log=document.getElementById('logFrame');
    if(event.origin===location.origin&&event.source===log?.contentWindow&&event.data?.type==='jijin-phone-log-ready')log.dataset.phoneReady='1';
    if(event.origin!==location.origin||event.source!==activeFrame()?.contentWindow||!mq.matches)return;
    if(event.data?.type==='jijin-phone-menu')openMenu();
    if(event.data?.type==='jijin-phone-log-list')showLogs(true);
    if(event.data?.type==='jijin-phone-docked'){activeFrame().dataset.phoneDocked=event.data.visible?'1':'';syncTabs()}
  });
  // Swiping back closes the log drawer. Selection, scrolling and taps are separate.
  let start=null;
  sidebar.addEventListener('pointerdown',event=>{if(event.pointerType!=='mouse')start={x:event.clientX,y:event.clientY}});
  sidebar.addEventListener('pointerup',event=>{if(start&&event.clientX-start.x<-70&&Math.abs(event.clientY-start.y)<45)showLogs(false);start=null});
  sidebar.addEventListener('pointercancel',()=>{start=null});
  let homeStart=null;
  const home=document.getElementById('welcome');
  home?.addEventListener('pointerdown',event=>{if(mq.matches&&!event.target.closest('input,button,label,a'))homeStart={x:event.clientX,y:event.clientY}});
  home?.addEventListener('pointerup',event=>{if(homeStart&&Math.abs(event.clientX-homeStart.x)>75&&Math.abs(event.clientY-homeStart.y)<40)showLogs(true);homeStart=null});
  home?.addEventListener('pointercancel',()=>{homeStart=null});
  for(const frame of frames){
    const install=()=>{
      if(!mq.matches)return;
      try{
        const doc=frame.contentDocument;
        if(!doc?.head||!frame.getAttribute('src')||doc.getElementById('mobileWorkspaceScript'))return;
        if(frame.id==='logFrame'){
          const style=doc.createElement('style');style.textContent='@media(max-width:760px){body>.topbar{display:none!important}}';doc.head.append(style);
        }
        const script=doc.createElement('script');script.id='mobileWorkspaceScript';script.src='/board/mobile-workspace.js?v=20261105-display8';doc.head.append(script);
      }catch{}
    };
    frame.addEventListener('load',()=>{if(['matrixFrame','logFrame'].includes(frame.id))delete frame.dataset.phoneReady;install()});
    if(['matrixFrame','logFrame'].includes(frame.id))new MutationObserver(()=>{delete frame.dataset.phoneReady}).observe(frame,{attributes:true,attributeFilter:['src']});
    mq.addEventListener('change',install);
    if(frame.contentDocument?.readyState==='complete')install();
  }
})();
