(()=>{
  const params=new URL(location.href).searchParams;
  if(params.get('embedded')!=='1'||parent===window)return;
  const roomId=params.get('room')||'';
  let sent=false;
  function send(){
    if(sent)return;
    sent=true;
    try{parent.postMessage({type:'jijinboard-log-ready',roomId},location.origin)}catch{}
  }
  if(document.readyState==='loading'){
    addEventListener('DOMContentLoaded',()=>requestAnimationFrame(send),{once:true});
  }else requestAnimationFrame(send);
})();
