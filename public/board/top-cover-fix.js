"use strict";
(()=>{
  const frame=document.getElementById("logFrame"),welcome=document.getElementById("welcome"),addButton=document.getElementById("addLogButton");
  if(!frame||!welcome||typeof state==="undefined")return;

  let mode="home",readyRoom="",uploaderReady=false,lastSrc=frame.getAttribute("src")||"";
  const baseOpenLog=typeof openLog==="function"?openLog:null;
  const baseSelectTool=typeof selectTool==="function"?selectTool:null;
  const baseSetToolFrameReady=typeof setToolFrameReady==="function"?setToolFrameReady:null;
  const baseShowUploader=typeof showUploader==="function"?showUploader:null;

  function showHome(){
    frame.classList.add("hidden");
    welcome.classList.remove("hidden");
  }
  function showFrame(){
    frame.classList.remove("hidden");
    welcome.classList.add("hidden");
  }
  function sync(){
    if(state.tool!=="log")return;
    const room=String(frame.dataset.room||"");
    const showRoom=mode==="room"&&!!state.activeRoom&&room===state.activeRoom&&readyRoom===state.activeRoom;
    const showUploader=mode==="uploader"&&!room&&uploaderReady;
    if(showRoom||showUploader)showFrame();else showHome();
  }
  function resetHome(){
    mode="home";readyRoom="";uploaderReady=false;
    state.activeRoom="";state.profile=null;
    try{setLogActive?.(frame,false)}catch{}
    frame.removeAttribute("src");
    delete frame.dataset.room;
    frame.dataset.ready="";
    frame.style.visibility="";
    lastSrc="";
    const url=new URL(location.href);
    if(url.searchParams.has("room")){
      url.searchParams.delete("room");
      history.replaceState(null,"",url.pathname+url.search);
    }
    showHome();
  }

  if(baseOpenLog){
    openLog=async function(roomId,title=""){
      mode="room";readyRoom="";uploaderReady=false;showHome();
      const result=await baseOpenLog.call(this,roomId,title);
      sync();
      return result;
    };
  }
  if(baseSelectTool){
    selectTool=function(tool){
      const result=baseSelectTool.call(this,tool);
      sync();
      return result;
    };
  }
  if(baseSetToolFrameReady){
    setToolFrameReady=function(target){
      const result=baseSetToolFrameReady.call(this,target);
      if(target===frame)sync();
      return result;
    };
  }
  if(baseShowUploader){
    const showUploader=function(){
      mode="uploader";readyRoom="";uploaderReady=false;showHome();
      const result=baseShowUploader.call(this);
      sync();
      return result;
    };
    if(addButton)addButton.onclick=showUploader;
  }

  addEventListener("message",event=>{
    if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.type!=="jijinboard-log-ready")return;
    const currentRoom=String(frame.dataset.room||""),messageRoom=String(event.data.roomId||"");
    if(messageRoom!==currentRoom)return;
    if(currentRoom)readyRoom=currentRoom;else uploaderReady=true;
    sync();
  });

  new MutationObserver(()=>{
    const src=frame.getAttribute("src")||"";
    if(src!==lastSrc){
      lastSrc=src;readyRoom="";uploaderReady=false;
      if(!src&&!state.activeRoom)mode="home";
    }
    queueMicrotask(sync);
  }).observe(frame,{attributes:true,attributeFilter:["src","class","data-room","data-ready"]});

  document.querySelector('[data-tool="log"]')?.addEventListener("click",()=>queueMicrotask(sync));
  addEventListener("pageshow",event=>{if(event.persisted)resetHome()});
  queueMicrotask(resetHome);
})();
