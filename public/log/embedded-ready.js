(()=>{
  const params=new URL(location.href).searchParams;
  if(params.get('embedded')!=='1'||parent===window)return;
  const roomId=params.get('room')||'';
  let sent=false,queued=false,domReady=document.readyState!=='loading',themeReady=!roomId||!!window.__jijinLogThemeReady;
  let observer=null;
  function contentReady(){
    if(!roomId)return !!document.querySelector('#homeView');
    const view=document.querySelector('#roomView'),pane=document.querySelector('#logPane');
    if(!view||view.classList.contains('hidden')||!pane)return false;
    const status=document.querySelector('#roomStatus')?.textContent?.trim()||'';
    const loaded=typeof state!=='undefined'&&state.room&&String(state.roomId)===roomId;
    const painted=!!pane.querySelector('.log-page,.log-message');
    // A completed error view must also be visible so it can be recovered from.
    const failed=status&&!status.includes('読み込')&&!status.includes('準備');
    return !!(loaded&&painted||failed);
  }
  function send(){
    if(sent||queued||!domReady||!themeReady||!contentReady())return;
    queued=true;
    Promise.resolve(window.JijinLogWaitForFirstTab?.()).then(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
      queued=false;if(sent||!contentReady())return;
      sent=true;observer?.disconnect();
      parent.postMessage({type:'jijinboard-log-ready',roomId},location.origin);
    })));
  }
  addEventListener("jijinboard-log-theme-ready",()=>{themeReady=true;send()});
  function watch(){
    domReady=true;
    observer=new MutationObserver(send);
    for(const id of ['roomView','homeView']){const node=document.getElementById(id);if(node)observer.observe(node,{childList:true,subtree:true,attributes:true,attributeFilter:['class']})}
    send();
  }
  if(!domReady)addEventListener('DOMContentLoaded',watch,{once:true});else watch();
  addEventListener('message',event=>{
    if(event.origin!==location.origin||event.data?.type!=='jijinboard-set-room-theme')return;
    themeReady=true;send();
  });
})();
