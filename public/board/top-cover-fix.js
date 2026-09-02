"use strict";
(()=>{
  const frame=document.getElementById("logFrame"),welcome=document.getElementById("welcome");
  if(!frame||!welcome)return;

  function sourceState(){
    const src=frame.getAttribute("src")||"";
    if(!src)return {src:"",room:"",prewarm:false,uploader:false};
    try{
      const url=new URL(src,location.href),room=url.searchParams.get("room")||"",prewarm=url.searchParams.get("prewarm")==="1";
      return {src,room,prewarm,uploader:!room&&!prewarm};
    }catch{return {src,room:"",prewarm:false,uploader:false}}
  }

  function sync(){
    const currentTool=typeof state!=="undefined"?state.tool:"log";
    if(currentTool!=="log")return;
    const source=sourceState(),activeRoom=typeof state!=="undefined"?String(state.activeRoom||""):"",ready=frame.dataset.ready==="1";
    const showRoom=ready&&!!source.room&&source.room===activeRoom;
    const showUploader=ready&&source.uploader;
    if(showRoom||showUploader){
      frame.classList.remove("hidden");
      welcome.classList.add("hidden");
    }else{
      frame.classList.add("hidden");
      welcome.classList.remove("hidden");
    }
  }

  const observer=new MutationObserver(()=>queueMicrotask(sync));
  observer.observe(frame,{attributes:true,attributeFilter:["src","class","data-ready","data-room"]});
  addEventListener("message",event=>{if(event.origin===location.origin&&event.source===frame.contentWindow)queueMicrotask(sync)});
  document.addEventListener("click",()=>queueMicrotask(sync));
  requestAnimationFrame(sync);
})();
