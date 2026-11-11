"use strict";

// Reduce uploaded raster template images before MATRIX stores them. Keep vector /
// animated formats untouched, preserve the original filename for the existing UI,
// and never replace the source when WebP would actually be larger.
(()=>{
  if(typeof window.saveTemplateFile!=="function"||window.saveTemplateFile.__jijinTemplateOptimized)return;
  const rawSaveTemplateFile=window.saveTemplateFile;
  const MAX_SIDE=2560;
  const WEBP_QUALITY=.88;

  async function optimizeTemplateFile(file){
    if(!(file instanceof Blob))return file;
    const type=String(file.type||"").toLowerCase();
    if(!type.startsWith("image/")||type==="image/svg+xml"||type==="image/gif")return file;
    if(typeof createImageBitmap!=="function")return file;

    let bitmap=null;
    try{
      bitmap=await createImageBitmap(file);
      const sourceWidth=Math.max(1,Number(bitmap.width)||1),sourceHeight=Math.max(1,Number(bitmap.height)||1);
      const scale=Math.min(1,MAX_SIDE/Math.max(sourceWidth,sourceHeight));
      const width=Math.max(1,Math.round(sourceWidth*scale)),height=Math.max(1,Math.round(sourceHeight*scale));
      const canvas=document.createElement("canvas");
      canvas.width=width;canvas.height=height;
      const context=canvas.getContext("2d",{alpha:true});
      if(!context)return file;
      context.drawImage(bitmap,0,0,width,height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/webp",WEBP_QUALITY));
      if(!blob)return file;
      if(scale===1&&Number(file.size)>0&&blob.size>=file.size)return file;
      const name=typeof file.name==="string"&&file.name?file.name:"template.webp";
      try{return new File([blob],name,{type:"image/webp",lastModified:file.lastModified||Date.now()})}
      catch{blob.name=name;return blob}
    }catch(error){
      console.warn("Template image optimization skipped",error);
      return file;
    }finally{
      try{bitmap?.close?.()}catch{}
    }
  }

  const optimizedSave=async function(file,...args){
    const optimized=await optimizeTemplateFile(file);
    return rawSaveTemplateFile.call(this,optimized,...args);
  };
  optimizedSave.__jijinTemplateOptimized=true;
  optimizedSave.__jijinRaw=rawSaveTemplateFile;
  window.saveTemplateFile=optimizedSave;
})();

(()=>{
  const params=new URL(location.href).searchParams,boardId=params.get("board");if(!boardId)return;
  const embedded=params.get("embedded")==="1";
  let roomId=params.get("room")||boardId,lastState="",saving=false,saveQueued=false,saveTimer=0,active=!embedded,applyingRemote=false,fullStateDirty=false;
  let loadRequested=false,loadSeq=0,readySent=false,helpersQueued=false,helpersLoaded=false,loadedRoom="";
  let realtime=null,realtimeRoom="",dirtyState=false,dirtyParticipants=false,dirtyComments=false;
  const pendingActions=new Map(),pointRequests=new Map(),pointChains=new Map();
  const realtimeClientId=(crypto.randomUUID&&crypto.randomUUID())||`${Date.now()}-${Math.random()}`;
  const api=async(path,options={})=>{
    const controller=new AbortController();let timer;
    try{
      return await Promise.race([
        (async()=>{const response=await fetch(path,{...options,signal:options.signal||controller.signal,headers:{"content-type":"application/json","x-realtime-client":realtimeClientId,...(options.headers||{})}});const body=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(new Error(body.error||`通信エラー (${response.status})`),{status:response.status,code:body.code,point:body.point});return body})(),
        new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('MATRIXの通信がタイムアウトしました。編集内容はこの端末に残っています。'))},15000)})
      ]);
    }finally{clearTimeout(timer)}
  };
  const profile=()=>{try{return JSON.parse(localStorage.getItem("trpgMarkerProfile")||"null")}catch{return null}};
  const matrixPath=()=>`/api/boards/${encodeURIComponent(boardId)}/matrix/${encodeURIComponent(roomId)}`;
  const pointPath=itemId=>`${matrixPath()}/points/${encodeURIComponent(itemId)}`;
  const pointKeys=new Set(["placed","x","y","templateX","templateY","coordVersion","scaleBaseWidth"]);

  function realtimeUrl(targetRoom=roomId){
    const protocol=location.protocol==="https:"?"wss:":"ws:";
    return targetRoom===boardId?`${protocol}//${location.host}/api/boards/${encodeURIComponent(boardId)}/realtime`:`${protocol}//${location.host}/api/rooms/${encodeURIComponent(targetRoom)}/realtime`;
  }

  function disconnectRealtimeEvents(){
    const socket=realtime;
    realtime=null;realtimeRoom="";
    if(socket&&socket.readyState<2)try{socket.close()}catch{}
  }

  function pointPayload(itemId,item){
    const payload={itemId:String(itemId||""),placed:!!item?.placed};
    for(const key of ["x","y","templateX","templateY","coordVersion","scaleBaseWidth"]){
      const value=Number(item?.[key]);
      if(Number.isFinite(value))payload[key]=value;
    }
    return payload;
  }

  function updatePlacedPoint(itemId,item){
    let el=null;
    for(const node of document.querySelectorAll(".placed[data-id]")){if(node.dataset.id===itemId){el=node;break}}
    if(!item?.placed){
      if(el){el.remove();if(typeof renderMobilePlacementTray==="function")renderMobilePlacementTray()}
      return true;
    }
    if(!el)return false;
    const overlay=document.querySelector("#templateOverlay");
    const inTemplate=!!overlay&&el.parentElement===overlay;
    if(inTemplate&&typeof templateGeometry==="function"&&typeof getTemplatePoint==="function"){
      const point=getTemplatePoint(item,templateGeometry());
      el.style.left=point.x+"%";
      el.style.top=point.y+"%";
      if(typeof currentTemplateUiScale==="function")el.style.transform=`translate(-50%,-50%) scale(${currentTemplateUiScale(appState())})`;
    }else{
      el.style.left=(item.x??50)+"%";
      el.style.top=(item.y??50)+"%";
    }
    const z=Number(item.zOrder);if(Number.isFinite(z)&&z>0)el.style.zIndex=String(z);
    return true;
  }

  function applyRemotePoint(data){
    const itemId=String(data?.itemId||"");
    if(pointRequests.has(String(data?.templateId||window.currentTemplateId?.()||'')+':'+itemId))return;
    if(!itemId||!roomId||data?.templateId&&data.templateId!==window.currentTemplateId?.())return;
    const state=appState();state.items||={};
    const item=state.items[itemId]||(state.items[itemId]=typeof makeLocalItemState==="function"?makeLocalItemState(itemId):{});
    for(const key of ['comment','commentPosition'])if(data?.[key]!==undefined)item[key]=String(data[key]);
    for(const key of pointKeys){if(["comment","commentPosition"].includes(key))continue;if(data?.[key]!==undefined)item[key]=key==="placed"?!!data[key]:Number(data[key])}
    applyingRemote=true;
    try{
      saveJSON(STATE,state);
      saveCurrentTemplateState(state);
      const live=items?.find?.(entry=>entry.id===itemId);if(live)live.local=item;
      if(data?.comment!==undefined){if(!document.querySelector(".placed.comment-editing")&&typeof renderPlaced==="function")renderPlaced()}
      else if(!updatePlacedPoint(itemId,item)&&typeof renderPlaced==="function")renderPlaced();
    }finally{applyingRemote=false}
  }

  function dispatchRefresh(action,data=null){
    if(action==="matrix-typing"){window.dispatchEvent(new CustomEvent("matrix-board-typing",{detail:data}));return}
    if(action==="matrix-point"){
      if(active){
        if(data?.templateId&&data.templateId!==window.currentTemplateId?.())window.dispatchEvent(new CustomEvent("matrix-board-comments-changed",{detail:{roomId,action:"matrix-template-state"}}));
        else applyRemotePoint(data);
      }else dirtyComments=true;
      return;
    }
    if(action==="matrix-state"){
      if(active&&roomId)loadRoom(roomId).catch(console.warn);else dirtyState=true;
      return;
    }
    if(action==="participants"){
      if(active)window.dispatchEvent(new CustomEvent("matrix-board-participants-changed",{detail:{roomId,data}}));else dirtyParticipants=true;
      return;
    }
    if(String(action||"").startsWith("matrix-")){
      if(active)window.dispatchEvent(new CustomEvent("matrix-board-comments-changed",{detail:{roomId,action}}));else dirtyComments=true;
    }
  }

  function actionKey(action,data){return action==="matrix-point"&&data?.itemId?`${action}:${data.itemId}`:action}
  function flushPendingActions(socket){
    if(socket!==realtime||socket.readyState!==WebSocket.OPEN)return;
    for(const [key,payload] of [...pendingActions]){
      try{socket.send(JSON.stringify({type:"change",action:payload.action,data:payload.data??null}));pendingActions.delete(key)}catch{break}
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
      dispatchRefresh("participants");dispatchRefresh("matrix-state");
      if(window.matrixTemplateSync?.isHydrated?.())window.dispatchEvent(new CustomEvent("matrix-board-comments-changed",{detail:{roomId,action:"matrix-template-state"}}));
    });
    socket.addEventListener("message",event=>{
      if(realtime!==socket)return;
      let data;try{data=JSON.parse(event.data)}catch{return}
      if(data?.type==="refresh")dispatchRefresh(String(data.action||""),data.data??null);
    });
    socket.addEventListener("close",()=>{if(realtime===socket){realtime=null;realtimeRoom="";if(active)setTimeout(()=>{if(active&&!realtime)connectRealtimeEvents()},1000)}});
    socket.addEventListener("error",()=>{try{socket.close()}catch{}});
  }

  function notifyChange(action,data=null){
    if(!action)return false;
    const key=actionKey(action,data),socket=realtime;
    if(!socket||socket.readyState!==WebSocket.OPEN){pendingActions.set(key,{action,data});connectRealtimeEvents();return false}
    try{socket.send(JSON.stringify({type:"change",action,data}));return true}catch{pendingActions.set(key,{action,data});return false}
  }

  const saveNote=window.JijinComments?.serialize();
  async function savePoint(itemId,item,commentOnly=false){
    if(!roomId||(!commentOnly&&(loadedRoom!==roomId||applyingRemote))||!itemId)return;
    const me=profile();if(!me?.plName)return;
    if(commentOnly){
      const templateId=item.templateId||window.currentTemplateId?.()||'',target=JijinComments.target.matrix(boardId,templateId,itemId);
      const payload={target,authorId:me.id,authorName:me.plName,body:String(item.comment||''),commentPosition:item.commentPosition||'top',recoverIfEmpty:!!item.recoverIfEmpty};
      if(Object.hasOwn(item,'baseComment'))payload.baseComment=item.baseComment;
      return saveNote(target,async()=>{
        const result=await JijinComments.request(boardId,'/note',{method:'PUT',body:JSON.stringify(payload)});
        if(payload.recoverIfEmpty&&result.point)applyRemotePoint(result.point);
        return true;
      });
    }
    const point=pointPayload(itemId,item);point.templateId=item.templateId||window.currentTemplateId?.()||'';const key=point.templateId+':'+itemId;
    pointRequests.set(key,point);
    const path=pointPath(itemId),body=JSON.stringify({authorId:me.id,authorName:me.plName,...point});
    const task=(pointChains.get(key)||Promise.resolve()).catch(()=>{}).then(()=>api(path,{method:"PATCH",body}));
    pointChains.set(key,task);
    try{
      const result=await task;
      if(pointRequests.get(key)!==point)return;
      pointRequests.delete(key);
      // Server publishes the saved point; pending local drags retain priority.
      return true;
    }catch(error){
      if(pointRequests.get(key)!==point)return false;
      pointRequests.delete(key);
      console.warn('MATRIX placement save failed',error);
      window.dispatchEvent(new CustomEvent('matrix-save-error',{detail:{message:error.message,itemId,templateId:point.templateId}}));
      if(typeof window.alert==='function')window.alert('配置を保存できませんでした：'+error.message);
      return false;
    }finally{
      if(pointChains.get(key)===task)pointChains.delete(key);
    }
  }

  window.matrixBoardContext={boardId,get roomId(){return roomId},isApplyingRemote:()=>applyingRemote,api,profile,isActive:()=>active,saveNow:()=>requestSave(0),notifyChange,savePoint,applyRemotePoint};

  function notifyReady(){
    if(readySent)return;
    readySent=true;
    try{parent.postMessage({type:"jijinboard-matrix-ready",roomId},location.origin)}catch{}
    if(active)queueHelpers();
  }

  function emptyRoomState(){
    const current=typeof appState==="function"?appState():{};
    const display=current?.display&&typeof current.display==="object"?{...current.display}:{};
    return {items:{},display};
  }

  function normalizedRoomState(remoteState){
    if(remoteState&&typeof remoteState==="object"&&!Array.isArray(remoteState)&&Object.keys(remoteState).length)return remoteState;
    return emptyRoomState();
  }

  function rebindLiveItems(state){
    if(typeof items==="undefined"||!Array.isArray(items))return;
    const stateItems=state?.items&&typeof state.items==="object"?state.items:{};
    for(const entry of items){
      if(!entry?.id)continue;
      entry.local=stateItems[entry.id]||(typeof makeLocalItemState==="function"?makeLocalItemState(entry.id):{});
    }
  }

  function redrawMatrix(state=appState(),afterLayout=false){
    rebindLiveItems(state);
    try{restoreDisplay()}catch(error){console.warn("MATRIX display restore failed",error)}
    try{restorePaneWidth()}catch(error){console.warn("MATRIX pane restore failed",error)}
    try{renderLibrary()}catch(error){console.warn("MATRIX library render failed",error)}
    try{renderPlaced()}catch(error){console.warn("MATRIX placement render failed",error)}
    if(!afterLayout)return;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      if(!active)return;
      const liveState=appState();
      rebindLiveItems(liveState);
      try{renderLibrary()}catch{}
      try{renderPlaced()}catch{}
    }));
  }

  async function loadRoom(nextRoom){
    loadRequested=true;
    const seq=++loadSeq;
    const previousRoom=roomId;
    roomId=nextRoom||boardId;
    readySent=false;
    loadedRoom="";
    if(roomId!==previousRoom){
      disconnectRealtimeEvents();
      dirtyState=dirtyParticipants=dirtyComments=false;
      window.dispatchEvent(new CustomEvent("matrix-board-room",{detail:{roomId}}));
    }
    if(!roomId){requestAnimationFrame(()=>requestAnimationFrame(notifyReady));return}
    try{
      const matrix=await api(matrixPath(),{cache:"reload"});
      if(seq!==loadSeq)return;
      applyingRemote=true;
      try{
        const roomState=normalizedRoomState(matrix.state);
        // Room-level refreshes must not blank the selected template's saved layout.
        const selected=window.currentTemplateId?.(),saved=window.templateStates?.()?.[selected];
        roomState.items=JSON.parse(JSON.stringify(saved?.items||appState()?.items||{}));
        if(saved)roomState.display={...roomState.display,...saved.display};
        saveState(roomState);
        redrawMatrix(roomState,active);
        lastState=JSON.stringify(matrix.state||{});
        fullStateDirty=false;
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
    if(!roomId||applyingRemote||loadedRoom!==roomId||!fullStateDirty)return;
    if(saving){saveQueued=true;return}
    const me=profile();if(!me?.plName)return;
    const state=appState(),serial=JSON.stringify(state);
    if(serial===lastState){fullStateDirty=false;return}
    saving=true;
    try{
      await api(matrixPath(),{method:"POST",keepalive:true,body:JSON.stringify({authorId:me.id,authorName:me.plName,state})});
      lastState=serial;
      fullStateDirty=false;
      // The server publishes the committed state change.
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
    if(!roomId||applyingRemote||loadedRoom!==roomId||!fullStateDirty)return;
    const me=profile();if(!me?.plName)return;
    const state=appState(),serial=JSON.stringify(state);
    if(serial===lastState){fullStateDirty=false;return}
    const payload=JSON.stringify({authorId:me.id,authorName:me.plName,state});
    try{fetch(matrixPath(),{method:"POST",headers:{"content-type":"application/json","x-realtime-client":realtimeClientId},body:payload,keepalive:true}).catch(()=>{})}catch{}
  }

  if(typeof window.saveState==="function"&&!window.saveState.__jijinboardImmediateSync){
    const rawSaveState=window.saveState;
    const syncedSaveState=function(state){
      const result=rawSaveState(state);
      if(!applyingRemote&&!window.matrixTemplateSync?.isApplyingRemote?.()){fullStateDirty=true;requestSave(0)}
      return result;
    };
    syncedSaveState.__jijinboardImmediateSync=true;
    window.saveState=syncedSaveState;
  }

  // Most drag/placement code goes through mutate(). Track exactly what the mutation
  // touched. If one existing item changed only point fields, persist locally and send
  // that one point instead of scheduling a complete MATRIX state upload.
  if(typeof window.mutate==="function"&&!window.mutate.__jijinboardPointSync&&typeof saveJSON==="function"){
    const wrap=(value,path,changes,cache)=>{
      if(!value||typeof value!=="object")return value;
      if(cache.has(value))return cache.get(value);
      const proxy=new Proxy(value,{
        get(target,key){const next=target[key];return next&&typeof next==="object"?wrap(next,[...path,String(key)],changes,cache):next},
        set(target,key,next){changes.push([...path,String(key)]);target[key]=next;return true},
        deleteProperty(target,key){changes.push([...path,String(key)]);delete target[key];return true}
      });
      cache.set(value,proxy);return proxy;
    };
    const optimizedMutate=function(fn){
      const state=appState(),changes=[],cache=new WeakMap(),proxy=wrap(state,[],changes,cache);
      const beforePoints=new Map(Object.entries(state.items||{}).map(([id,item])=>[id,pointPayload(id,item)]));
      fn(proxy);
      let itemId="",pointOnly=changes.length>0;
      for(const path of changes){
        if(path.length!==3||path[0]!=="items"||!pointKeys.has(path[2])){pointOnly=false;break}
        if(!itemId)itemId=path[1];else if(itemId!==path[1]){pointOnly=false;break}
      }
      const noteOnly=changes.length>0&&changes.every(path=>path.length===3&&path[0]==='items'&&['comment','commentPosition'].includes(path[2]));
      if(noteOnly){
        saveJSON(STATE,state);applyingRemote=true;
        try{saveCurrentTemplateState(state)}finally{applyingRemote=false}
        return;
      }
      if(pointOnly&&itemId&&state.items?.[itemId]){
        saveJSON(STATE,state);
        applyingRemote=true;
        try{saveCurrentTemplateState(state)}finally{applyingRemote=false}
        const commentOnly=changes.every(path=>["comment","commentPosition"].includes(path[2]));
        savePoint(itemId,state.items[itemId],commentOnly);
        return;
      }
      saveState(state);
      saveCurrentTemplateState(state);
      // Initial placement also initializes commentPosition/crop. Those metadata
      // changes must not divert changed coordinates into the metadata-only save.
      const touched=new Set();
      for(const path of changes)if(path[0]==='items'){
        if(path.length>1)touched.add(path[1]);
        else for(const id of new Set([...beforePoints.keys(),...Object.keys(state.items||{})]))touched.add(id);
      }
      for(const id of touched){
        const next=state.items?.[id]||{...beforePoints.get(id),placed:false};
        if(JSON.stringify(pointPayload(id,next))!==JSON.stringify(beforePoints.get(id)))savePoint(id,next);
      }
    };
    optimizedMutate.__jijinboardPointSync=true;
    window.mutate=optimizedMutate;
  }

  const showComment=document.querySelector("#showComment");
  if(showComment){
    showComment.addEventListener("input",()=>{fullStateDirty=true;requestSave(0)});
    showComment.addEventListener("change",()=>{fullStateDirty=true;requestSave(0)});
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
      script.src=src+(key==="matrixIconInteractions"?"?v=20261108-note-hover":"?v=20261105-pc5");
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
    next=!!next;
    if(active===next)return;
    active=next;
    if(active){
      window.dispatchEvent(new CustomEvent("matrix-board-active"));
      if(loadedRoom!==roomId){loadRoom(roomId).catch(console.warn)}
      else{
        connectRealtimeEvents();
        if(dirtyState)loadRoom(roomId).catch(console.warn);
        else scheduleTemplateOverlaySync();
        if(dirtyParticipants){dirtyParticipants=false;window.dispatchEvent(new CustomEvent("matrix-board-participants-changed",{detail:{roomId}}))}
        if(dirtyComments){dirtyComments=false;window.dispatchEvent(new CustomEvent("matrix-board-comments-changed",{detail:{roomId,action:"matrix-change"}}))}
      }
      if(readySent)queueHelpers();
    }
  }

  window.addEventListener("message",event=>{
    if(event.origin!==location.origin)return;
    if(event.data?.type==="jijinboard-active-room"){
      const nextRoom=event.data.roomId||boardId;
      if(nextRoom===roomId&&(loadedRoom===roomId||loadRequested))return;
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

  queueMicrotask(()=>{if(!loadRequested)loadRoom(roomId).catch(console.warn)});
  if(active)connectRealtimeEvents();
  window.addEventListener("online",()=>{if(roomId&&loadedRoom===roomId)connectRealtimeEvents()});
  window.addEventListener("pagehide",()=>{saveOnPagehide();disconnectRealtimeEvents()});
  document.addEventListener("visibilitychange",()=>{
    if(document.visibilityState==="hidden")saveOnPagehide();
    else if(roomId&&loadedRoom===roomId)connectRealtimeEvents();
  });
  window.addEventListener("jijinboard-cache-updated",event=>{
    const url=new URL(event.detail.url);
    // Template/point/image cache updates are not room-state changes.
    // They are handled by their own event-driven synchronizers; reloading
    // the entire MATRIX for each cache write caused unnecessary D1 reads.
    if(url.pathname!==matrixPath())return;
    if(active&&roomId&&!fullStateDirty&&!saving)loadRoom(roomId).catch(console.warn);
    else dirtyState=true;
  });
  // Refresh thumbnail avatars when participant images arrive after templates.
  if(typeof renderLibrary==="function"){
    const originalLibrary=renderLibrary;let imageSignature="",previewTimer;
    renderLibrary=function(...args){
      const result=originalLibrary.apply(this,args);
      const next=JSON.stringify(items.map(item=>[item.id,displayImage(item)]));
      if(next!==imageSignature){imageSignature=next;clearTimeout(previewTimer);previewTimer=setTimeout(()=>window.renderTemplateTabs?.().catch?.(console.warn),0)}
      return result;
    };
  }
})();
