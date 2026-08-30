"use strict";
(()=>{
  const params=new URL(location.href).searchParams,boardId=params.get("board");if(!boardId)return;
  const embedded=params.get("embedded")==="1";
  let roomId=params.get("room")||"",lastState="",saving=false,saveQueued=false,saveTimer=0,active=!embedded,applyingRemote=false;
  let loadRequested=false,loadSeq=0,readySent=false,helpersQueued=false,helpersLoaded=false,loadedRoom="";
  let realtime=null,realtimeRoom="",dirtyState=false,dirtyParticipants=false,dirtyComments=false;
  const pendingActions=new Set();
  const realtimeClientId=(crypto.randomUUID&&crypto.randomUUID())||`${Date.now()}-${Math.random()}`;
  const api=async(path,options={})=>{
    const response=await fetch(path,{headers:{"content-type":"application/json","x-realtime-client":realtimeClientId,...(options.headers||{})},...options});
    const body=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(body.error||`通信エラー (${response.status})`);
    return body;
  };
  const profile=()=>{try{return JSON.parse(localStorage.getItem("trpgMarkerProfile")||"null")}catch{return null}};
  const matrixPath=()=>`/api/boards/${encodeURIComponent(boardId)}/matrix/${encodeURIComponent(roomId)}`;
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

  function realtimeUrl(targetRoom=roomId){
    const protocol=location.protocol==="https:"?"wss:":"ws:";
    return `${protocol}//${location.host}/api/rooms/${encodeURIComponent(targetRoom)}/realtime`;
  }

  function disconnectRealtimeEvents(){
    const socket=realtime;
    realtime=null;realtimeRoom="";
    if(socket&&socket.readyState<2)try{socket.close()}catch{}
  }

  function dispatchRefresh(action){
    if(action==="matrix-state"){
      if(active&&roomId)loadRoom(roomId).catch(console.warn);else dirtyState=true;
      return;
    }
    if(action==="participants"){
      if(active)window.dispatchEvent(new CustomEvent("matrix-board-participants-changed",{detail:{roomId}}));else dirtyParticipants=true;
      return;
    }
    if(String(action||"").startsWith("matrix-")){
      if(active)window.dispatchEvent(new CustomEvent("matrix-board-comments-changed",{detail:{roomId,action}}));else dirtyComments=true;
    }
  }

  function flushPendingActions(socket){
    if(socket!==realtime||socket.readyState!==WebSocket.OPEN)return;
    for(const action of [...pendingActions]){
      try{socket.send(JSON.stringify({type:"change",action}));pendingActions.delete(action)}catch{break}
    }
  }

  function connectRealtimeEvents(){
    if(!roomId)return;
    if(realtime&&realtimeRoom===roomId&&(realtime.readyState===WebSocket.OPEN||realtime.readyState===WebSocket.CONNECTING))return;
    disconnectRealtimeEvents();
    let socket;
    try{socket=new WebSocket(realtimeUrl(roomId))}catch{return}
    realtime=socket;realtimeRoom=roomId;
    socket.addEventListener("open",()=>{
      if(realtime!==socket)return;
      try{socket.send(JSON.stringify({type:"join",clientId:realtimeClientId}))}catch{}
      flushPendingActions(socket);
    });
    socket.addEventListener("message",event=>{
      if(realtime!==socket)return;
      let data;try{data=JSON.parse(event.data)}catch{return}
      if(data?.type==="refresh")dispatchRefresh(String(data.action||""));
    });
    socket.addEventListener("close",()=>{if(realtime===socket){realtime=null;realtimeRoom=""}});
    socket.addEventListener("error",()=>{try{socket.close()}catch{}});
  }

  function notifyChange(action){
    if(!action)return false;
    const socket=realtime;
    if(!socket||socket.readyState!==WebSocket.OPEN){pendingActions.add(action);connectRealtimeEvents();return false}
    try{socket.send(JSON.stringify({type:"change",action}));return true}catch{pendingActions.add(action);return false}
  }

  window.matrixBoardContext={boardId,get roomId(){return roomId},api,profile,isActive:()=>active,saveNow:()=>requestSave(0),notifyChange};

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
    if(roomId!==previousRoom){
      disconnectRealtimeEvents();
      dirtyState=dirtyParticipants=dirtyComments=false;
      window.dispatchEvent(new CustomEvent("matrix-board-room",{detail:{roomId}}));
    }
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
        dirtyState=false;
      }finally{
        applyingRemote=false;
      }
    }catch(error){
      console.warn(error);
    }finally{
      if(seq===loadSeq){
        connectRealtimeEvents();
        requestAnimationFrame(()=>requestAnimationFrame(notifyReady));
      }
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
      notifyChange("matrix-state");
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
    try{fetch(matrixPath(),{method:"POST",headers:{"content-type":"application/json","x-realtime-client":realtimeClientId},body:payload,keepalive:true}).catch(()=>{})}catch{}
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
    active=!!next;
    if(active){
      window.dispatchEvent(new CustomEvent("matrix-board-active"));
      if(loadedRoom!==roomId){loadRoom(roomId).catch(console.warn)}
      else{
        connectRealtimeEvents();
        if(dirtyState)loadRoom(roomId).catch(console.warn);
        if(dirtyParticipants){dirtyParticipants=false;window.dispatchEvent(new CustomEvent("matrix-board-participants-changed",{detail:{roomId}}))}
        if(dirtyComments){dirtyComments=false;window.dispatchEvent(new CustomEvent("matrix-board-comments-changed",{detail:{roomId,action:"matrix-change"}}))}
      }
      if(readySent)queueHelpers();
    }else{
      requestSave(0);
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
        disconnectRealtimeEvents();
        dirtyState=dirtyParticipants=dirtyComments=false;
        if(changed)window.dispatchEvent(new CustomEvent("matrix-board-room",{detail:{roomId}}));
      }
    }
    if(event.data?.type==="jijinboard-matrix-active")setActive(event.data.active);
  });

  setTimeout(()=>{if(!loadRequested)loadRoom(roomId).catch(console.warn)},80);
  if(active)connectRealtimeEvents();
  window.addEventListener("online",()=>{if(roomId&&loadedRoom===roomId)connectRealtimeEvents()});
  window.addEventListener("pagehide",()=>{saveOnPagehide();disconnectRealtimeEvents()});
  document.addEventListener("visibilitychange",()=>{
    if(document.visibilityState==="hidden")requestSave(0);
    else if(roomId&&loadedRoom===roomId)connectRealtimeEvents();
  });
})();
