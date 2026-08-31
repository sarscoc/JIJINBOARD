(()=>{
  const params=new URL(location.href).searchParams;
  if(params.get('embedded')!=='1'||parent===window)return;

  const roomId=params.get('room')||'';
  let sent=false,observer=null,settleTimer=0,annotationGraceTimer=0;
  let annotationsReady=!roomId||!!window.__jijinInitialAnnotations;

  function visible(el){return !!el&&!el.classList.contains('hidden')}
  function baseReady(){
    const room=document.getElementById('roomView');
    const home=document.getElementById('homeView');
    const pane=document.getElementById('logPane');
    return roomId
      ? visible(room)&&!!pane&&(pane.childElementCount>0||pane.textContent.trim().length>0)
      : visible(home);
  }
  function send(){
    if(sent||!baseReady())return false;
    sent=true;
    clearTimeout(settleTimer);clearTimeout(annotationGraceTimer);
    observer?.disconnect();
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      try{parent.postMessage({type:'jijinboard-log-ready',roomId},location.origin)}catch{}
    }));
    return true;
  }
  function schedule(){
    if(sent||!baseReady())return false;
    clearTimeout(settleTimer);
    // LOG streaming and initial marker hydration may redraw the same pane a few
    // times. Keep those internal while the iframe is still hidden, and reveal
    // only after the first paint has been quiet briefly.
    settleTimer=setTimeout(()=>{
      if(!roomId||annotationsReady)send();
    },140);
    return true;
  }
  function changed(){schedule()}

  if(roomId){
    addEventListener('jijinboard-initial-annotations',()=>{
      annotationsReady=true;
      schedule();
    });
    // A failed/slow comment request must never keep the LOG hidden forever.
    annotationGraceTimer=setTimeout(()=>{annotationsReady=true;schedule()},700);
  }

  observer=new MutationObserver(changed);
  observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  addEventListener('load',schedule,{once:true});
  schedule();

  setTimeout(()=>{
    if(sent)return;
    annotationsReady=true;
    if(!schedule()&&baseReady())send();
  },2500);
})();
