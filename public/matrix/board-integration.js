"use strict";
(()=>{
  const params=new URL(location.href).searchParams,boardId=params.get("board");if(!boardId)return;
  const embedded=params.get("embedded")==="1";
  let roomId=params.get("room")||"",lastState="",saving=false,saveQueued=false,saveTimer=0,active=!embedded,applyingRemote=false;
  let saveLoopTimer=0,loadRequested=false,loadSeq=0,readySent=false,helpersQueued=false,helpersLoaded=false,loadedRoom="";
  const api=async(path,options={})=>{const response=await fetch(path,{headers:{"content-type":"application/json",...(options.headers||{})},...options}),body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||`通信エラー (${response.status})`);return body};
  const profile=()=>{try{return JSON.parse(localStorage.getItem("trpgMarkerProfile")||"null")}catch{return null}};
  const matrixPath=()=>`/api/boards/${encodeURIComponent(boardId)}/matrix/${encodeURIComponent(roomId)}`;
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  window.matrixBoardContext={boardId,get roomId(){return roomId},api,profile,isActive:()=>active,saveNow:()=>requestSave(0)};

  function notifyReady(){
    if(readySent)return;
    readySent=true;
    try{parent.postMessage({type:"jijinboard-matrix-ready",roomId},location.origin)}catch{}
    if(active)queueHelpers();
  }

  async function loadRoom(nextRoom){
    loadRequested=true;
    const seq=++loadSeq;
    const previousRoom=roomId;
    roomId=nextRoom||"";
    readySent=false;
    loadedRoom="";
    if(roomId!==previousRoom)window.dispatchEvent(new CustomEvent("matrix-board-room",{detail:{roomId}}));
    if(!roomId){requestAnimationFrame(()=>requestAnimationFrame(notifyReady));return}
    try{
      const [matrix]=await Promise.all([api(matrixPath()),wait(180)]);
      if(seq!==loadSeq)return;
      applyingRemote=true;
      try{
        if(matrix.state&&Object.keys(matrix.state).length){
          saveState(matrix.state);
          restoreDisplay();
          restorePaneWidth();
          renderLibrary();
          renderPlaced();
        }
        lastState=JSON.stringify(matrix.state||{});
        loadedRoom=roomId;
      }finally{
        applyingRemote=false;
      }
    }catch(error){
      console.warn(error);
    }finally{
      if(seq===loadSeq)requestAnimationFrame(()=>requestAnimationFrame(notifyReady));
    }
  }

  async function save(){
    if(!roomId||applyingRemote||loadedRoom!==roomId)return;
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

  function stopSaveLoop(){clearTimeout(saveLoopTimer);saveLoopTimer=0}
  function startSaveLoop(){
    stopSaveLoop();
    if(!active)return;
    saveLoopTimer=setTimeout(async()=>{
      if(!active)return;
      await save();
      startSaveLoop();
    },5000);
  }

  function saveOnPagehide(){
    if(!roomId||applyingRemote||loadedRoom!==roomId)return;
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

  const showComment=document.querySelector("#showComment");
  if(showComment){
    showComment.addEventListener("input",()=>requestSave(0));
    showComment.addEventListener("change",()=>requestSave(0));
  }

  function loadHelpers(){
    if(helpersLoaded)return;
    helpersLoaded=true;
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
  }

  function queueHelpers(){
    if(helpersQueued||helpersLoaded||!active)return;
    helpersQueued=true;
    const run=()=>{helpersQueued=false;if(active)loadHelpers()};
    if("requestIdleCallback" in window)requestIdleCallback(run,{timeout:900});
    else setTimeout(run,80);
  }

  function setActive(next){
    const wasActive=active;
    active=!!next;
    if(active){
      window.dispatchEvent(new CustomEvent("matrix-board-active"));
      if(loadedRoom!==roomId)loadRoom(roomId).catch(console.warn);else requestSave(0);
      startSaveLoop();
      if(readySent)queueHelpers();
    }else{
      stopSaveLoop();
      if(wasActive)requestSave(0);
    }
  }

  window.addEventListener("message",event=>{
    if(event.origin!==location.origin)return;
    if(event.data?.type==="jijinboard-active-room"){
      const nextRoom=event.data.roomId||"";
      if(active||!embedded)loadRoom(nextRoom).catch(console.warn);
      else{
        loadRequested=true;
        const changed=roomId!==nextRoom;
        roomId=nextRoom;
        loadedRoom="";
        readySent=false;
        if(changed)window.dispatchEvent(new CustomEvent("matrix-board-room",{detail:{roomId}}));
      }
    }
    if(event.data?.type==="jijinboard-matrix-active")setActive(event.data.active);
  });

  setTimeout(()=>{if(!loadRequested)loadRoom(roomId).catch(console.warn)},80);
  if(active){startSaveLoop();if(readySent)queueHelpers()}
  window.addEventListener("pagehide",saveOnPagehide);
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden")requestSave(0)});
})();