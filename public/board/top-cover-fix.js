"use strict";
(()=>{
  const frame=document.getElementById("logFrame"),welcome=document.getElementById("welcome");
  if(!frame||!welcome)return;

  function frameRoom(){
    const src=frame.getAttribute("src")||"";
    if(!src)return "";
    try{return new URL(src,location.href).searchParams.get("room")||""}catch{return ""}
  }

  function sync(){
    const currentTool=typeof state!=="undefined"?state.tool:"log";
    if(currentTool!=="log")return;
    const src=frame.getAttribute("src")||"",room=frameRoom(),activeRoom=typeof state!=="undefined"?String(state.activeRoom||""):"",ready=frame.dataset.ready==="1";
    const showLog=!!src&&ready&&((room&&room===activeRoom)||(!room&&!activeRoom));
    frame.classList.toggle("hidden",!showLog);
    welcome.classList.toggle("hidden",showLog);
  }

  new MutationObserver(()=>queueMicrotask(sync)).observe(frame,{attributes:true,attributeFilter:["src","class","data-ready","data-room"]});
  addEventListener("message",event=>{if(event.origin===location.origin&&event.source===frame.contentWindow)queueMicrotask(sync)});
  document.addEventListener("click",()=>queueMicrotask(sync));
  requestAnimationFrame(sync);
})();
