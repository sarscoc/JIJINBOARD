(()=>{
  const params=new URL(location.href).searchParams;
  if(params.get('embedded')!=='1'||parent===window)return;
  const roomId=params.get('room')||'';
  let sent=false,domReady=document.readyState!=='loading',themeReady=!roomId;
  function send(){
    if(sent||!domReady||!themeReady)return;
    sent=true;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      try{parent.postMessage({type:'jijinboard-log-ready',roomId},location.origin)}catch{}
    }));
  }
  if(!domReady)addEventListener('DOMContentLoaded',()=>{domReady=true;send()},{once:true});
  addEventListener('message',event=>{
    if(event.origin!==location.origin||event.data?.type!=='jijinboard-set-room-theme')return;
    themeReady=true;
    send();
  });
  send();
})();
