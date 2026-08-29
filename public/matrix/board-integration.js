"use strict";
(()=>{
  const params=new URL(location.href).searchParams,boardId=params.get("board");if(!boardId)return;
  let roomId=params.get("room")||"",lastState="",saving=false,saveQueued=false,saveTimer=0,active=true;
  const api=async(path,options={})=>{const response=await fetch(path,{headers:{"content-type":"application/json",...(options.headers||{})},...options}),body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||`通信エラー (${response.status})`);return body};
  const profile=()=>{try{return JSON.parse(localStorage.getItem("trpgMarkerProfile")||"null")}catch{return null}};
  const matrixPath=()=>`/api/boards/${encodeURIComponent(boardId)}/matrix/${encodeURIComponent(roomId)}`;
  window.matrixBoardContext={boardId,get roomId(){return roomId},api,profile,isActive:()=>active,saveNow:()=>requestSave(0)};

  async function loadRoom(nextRoom){
    roomId=nextRoom||"";
    window.dispatchEvent(new CustomEvent("matrix-board-room",{detail:{roomId}}));
    if(!roomId)return;
    const matrix=await api(matrixPath());
    if(matrix.state&&Object.keys(matrix.state).length){saveState(matrix.state);restoreDisplay();restorePaneWidth();renderLibrary();renderPlaced()}
    lastState=JSON.stringify(matrix.state||{});
  }

  async function save(){
    if(!roomId)return;
    if(saving){saveQueued=true;return}
    const me=profile();if(!me?.plName)return;
    const state=appState(),serial=JSON.stringify(state);
    if(serial===lastState)return;
    saving=true;
    try{
      await api(matrixPath(),{method:"POST",keepalive:true,body:JSON.stringify({authorId:me.id,authorName:me.plName,state})});
      lastState=serial;
    }catch{}finally{
      saving=false;
      if(saveQueued){saveQueued=false;requestSave(0)}
    }
  }

  function requestSave(delay=80){
    clearTimeout(saveTimer);
    saveTimer=setTimeout(()=>save(),Math.max(0,delay));
  }

  function saveOnPagehide(){
    if(!roomId)return;
    const me=profile();if(!me?.plName)return;
    const state=appState(),serial=JSON.stringify(state);
    if(serial===lastState)return;
    const payload=JSON.stringify({authorId:me.id,authorName:me.plName,state});
    try{
      if(navigator.sendBeacon){
        const queued=navigator.sendBeacon(matrixPath(),new Blob([payload],{type:"application/json"}));
        if(queued)return;
      }
    }catch{}
    try{fetch(matrixPath(),{method:"POST",headers:{"content-type":"application/json"},body:payload,keepalive:true}).catch(()=>{})}catch{}
  }

  // Display visibility is a shared MATRIX setting. Persist it immediately rather
  // than waiting for the periodic saver, otherwise a quick reload can restore an
  // older server-side `showComment:false` state over the newly selected value.
  const showComment=document.querySelector("#showComment");
  if(showComment){
    showComment.addEventListener("input",()=>requestSave(0));
    showComment.addEventListener("change",()=>requestSave(0));
  }

  window.addEventListener("message",event=>{
    if(event.origin!==location.origin)return;
    if(event.data?.type==="jijinboard-active-room")loadRoom(event.data.roomId).catch(console.warn);
    if(event.data?.type==="jijinboard-matrix-active"){
      active=!!event.data.active;
      if(active){window.dispatchEvent(new CustomEvent("matrix-board-active"));requestSave(0)}
    }
  });
  setTimeout(()=>loadRoom(roomId).catch(console.warn),300);
  setInterval(()=>{if(active)save()},5000);
  window.addEventListener("pagehide",saveOnPagehide);
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden")requestSave(0)});

  // Load interaction overrides only after the original MATRIX scripts are ready.
  window.addEventListener("load",()=>{
    if(document.querySelector('script[data-matrix-icon-interactions]'))return;
    const script=document.createElement("script");
    script.src="matrix-icon-interactions.js";
    script.dataset.matrixIconInteractions="1";
    document.body.append(script);
  },{once:true});
})();
