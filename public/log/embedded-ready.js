(()=>{
  const params=new URL(location.href).searchParams;
  if(params.get('embedded')!=='1'||parent===window)return;

  const roomId=params.get('room')||'';
  let sent=false,observer=null;

  function visible(el){return !!el&&!el.classList.contains('hidden')}
  function ready(){
    if(sent)return true;
    const room=document.getElementById('roomView');
    const home=document.getElementById('homeView');
    const pane=document.getElementById('logPane');

    const roomReady=!!roomId&&visible(room)&&!!pane&&(pane.childElementCount>0||pane.textContent.trim().length>0);
    const homeReady=!roomId&&visible(home);
    if(!roomReady&&!homeReady)return false;

    sent=true;
    observer?.disconnect();
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      try{parent.postMessage({type:'jijinboard-log-ready',roomId},location.origin)}catch{}
    }));
    return true;
  }

  if(ready())return;
  observer=new MutationObserver(ready);
  observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  addEventListener('load',ready,{once:true});
  setTimeout(()=>{
    if(sent)return;
    const room=document.getElementById('roomView');
    const home=document.getElementById('homeView');
    if((roomId&&visible(room))||(!roomId&&visible(home))){
      sent=true;
      observer?.disconnect();
      try{parent.postMessage({type:'jijinboard-log-ready',roomId},location.origin)}catch{}
    }
  },2500);
})();