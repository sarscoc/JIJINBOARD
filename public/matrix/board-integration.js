"use strict";
(()=>{
  const params=new URL(location.href).searchParams,boardId=params.get("board");if(!boardId)return;
  let roomId=params.get("room")||"",lastState="",saving=false,saveQueued=false,saveTimer=0,active=true,applyingRemote=false;
  const api=async(path,options={})=>{const response=await fetch(path,{headers:{"content-type":"application/json",...(options.headers||{})},...options}),body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||`通信エラー (${response.status})`);return body};
  const profile=()=>{try{return JSON.parse(localStorage.getItem("trpgMarkerProfile")||"null")}catch{return null}};
  const matrixPath=()=>`/api/boards/${encodeURIComponent(boardId)}/matrix/${encodeURIComponent(roomId)}`;
  window.matrixBoardContext={boardId,get roomId(){return roomId},api,profile,isActive:()=>active,saveNow:()=>requestSave(0)};

  async function loadRoom(nextRoom){
    roomId=nextRoom||"";
    window.dispatchEvent(new CustomEvent("matrix-board-room",{detail:{roomId}}));
    if(!roomId)return;
    const matrix=await api(matrixPath());
    applyingRemote=true;
    try{
      if(matrix.state&&Object.keys(matrix.state).length){saveState(matrix.state);restoreDisplay();restorePaneWidth();renderLibrary();renderPlaced()}
      lastState=JSON.stringify(matrix.state||{});
    }finally{
      applyingRemote=false;
    }
  }

  async function save(){
    if(!roomId||applyingRemote)return;
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
    if(applyingRemote)return;
    clearTimeout(saveTimer);
    saveTimer=setTimeout(()=>save(),Math.max(0,delay));
  }

  function saveOnPagehide(){
    if(!roomId||applyingRemote)return;
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

  // MATRIX's original editor commits icon comments and placement data through
  // saveState(). Mirror every completed local state write to the shared board
  // immediately so a quick reload cannot restore an older blank item.comment.
  if(typeof window.saveState==="function"&&!window.saveState.__jijinboardImmediateSync){
    const rawSaveState=window.saveState;
    const syncedSaveState=function(state){
      const result=rawSaveState(state);
      if(!applyingRemote)requestSave(0);
      return result;
    };
    syncedSaveState.__jijinboardImmediateSync=true;
    window.saveState=syncedSaveState;
  }

  // Keep the explicit visibility hook too; it also covers browsers where the
  // control event fires before another UI helper finishes its own redraw.
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

  // Load board-only behavior after the original MATRIX scripts are ready.
  // Dynamic scripts are marked non-async so persistence/delete hooks are installed
  // before the click/right-click interaction override starts handling input.
  window.addEventListener("load",()=>{
    const helpers=[
      ["matrix-display-comment-persistence.js","matrixDisplayCommentPersistence"],
      ["matrix-template-comment-cleanup.js","matrixTemplateCommentCleanup"],
      ["matrix-icon-interactions.js","matrixIconInteractions"]
    ];
    helpers.forEach(([src,key])=>{
      if(document.querySelector(`script[data-${key.replace(/[A-Z]/g,m=>"-"+m.toLowerCase())}]`))return;
      const script=document.createElement("script");
      script.src=src;
      script.async=false;
      script.dataset[key]="1";
      document.body.append(script);
    });
  },{once:true});
})();
