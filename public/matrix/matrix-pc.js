"use strict";

// Template-follow scaling is now a fixed MATRIX behavior rather than a user option.
(() => {
  if (typeof appState !== "function" || typeof saveState !== "function") return;
  const rawAppState = appState;
  const rawSaveState = saveState;

  appState = function() {
    const state = rawAppState();
    state.display ||= {};
    state.display.scaleWithTemplate = true;
    return state;
  };

  saveState = function(state) {
    if (state) {
      state.display ||= {};
      state.display.scaleWithTemplate = true;
    }
    return rawSaveState(state);
  };

  const checkbox = document.querySelector("#scaleWithTemplate");
  if (checkbox) {
    checkbox.checked = true;
    checkbox.disabled = true;
  }

  const state = appState();
  saveState(state);
})();

(()=>{
  const params=new URL(location.href).searchParams,boardId=params.get("board");
  if(!boardId)return;
  let activeRoom=params.get("room")||boardId,participants=[],draggingPcId="",participantsSignature="";
  let participantRevision=-1;
  let loadPromise=null,loadKey="",lastLoadedAt=0,loadSeq=0,activePaintFrame=0;
   const verifiedRooms=new Set();
  const api=async(path,options={})=>{const response=await fetch(path,{headers:{"content-type":"application/json",...(options.headers||{})},...options}),body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||`通信エラー (${response.status})`);return body};
  const me=()=>{try{return JSON.parse(localStorage.getItem("trpgMarkerProfile")||"null")}catch{return null}};
  const participantPath=room=>room===boardId?`/api/boards/${encodeURIComponent(boardId)}/participants`:`/api/boards/${encodeURIComponent(boardId)}/logs/${encodeURIComponent(room)}/participants`;
  const preferredImage=person=>person?.matrixIcon||person?.baseIcon||person?.icon||"";
  const fallbackImage=person=>person?.baseIcon||person?.icon||"";
  const mine=()=>{const profile=me();if(!profile)return[];const byId=participants.filter(person=>person.authorId===profile.id);return byId.length?byId:participants.filter(person=>person.plName&&profile.plName&&person.plName===profile.plName)};
  const escHtml=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const clone=value=>{if(value===undefined)return undefined;try{return structuredClone(value)}catch{try{return JSON.parse(JSON.stringify(value))}catch{return value}}};
  const placementOnlyKeys=new Set(["placed","x","y","templateX","templateY","coordVersion","scaleBaseWidth","mobileSelected"]);
  const participantKey=list=>(list||[]).map(person=>[
    person?.authorId||"",person?.plName||"",person?.personaId||"",person?.name||"",preferredImage(person),fallbackImage(person),person?.color||"",person?.textColor||""
  ].join("\u001f")).sort().join("\u001e");

  const participantCacheKey=room=>`board:${encodeURIComponent(boardId)}:matrix-pcs:${encodeURIComponent(room||boardId)}`;
  function saveParticipants(){
    try{localStorage.setItem(participantCacheKey(activeRoom),JSON.stringify({generation:localStorage.getItem('jijin.dataset.generation.v1'),participants,revision:participantRevision}))}catch{}
  }
  function restoreParticipants(room){
    try{const saved=JSON.parse(localStorage.getItem(participantCacheKey(room))||'null');if(saved?.generation!==localStorage.getItem('jijin.dataset.generation.v1')||!Array.isArray(saved.participants))return false;setParticipants(saved.participants,{forcePaint:true});return true}catch{return false}
  }
  function setupBoardUi(){
    document.querySelector("#exportIconsBtn")?.remove();
    const settingsBody=document.querySelector("#displaySettingsBody");
    const deleteButton=document.querySelector("#deleteCurrentTemplateBtn");
    if(settingsBody&&deleteButton&&deleteButton.parentNode!==settingsBody)settingsBody.append(deleteButton);
  }

  function savedItemState(id){
    try{
      if(typeof currentTemplateId!=="function"||typeof templateStates!=="function")return null;
      const tid=currentTemplateId();if(!tid)return null;
      return templateStates()?.[tid]?.items?.[id]||null;
    }catch{return null}
  }

  function annotationStateForPlacement(id){
    const live=appState()?.items?.[id]||null;
    const saved=savedItemState(id);
    const source=saved||live;
    if(!source)return null;
    const preserved={};
    Object.entries(source).forEach(([key,value])=>{
      if(!placementOnlyKeys.has(key))preserved[key]=clone(value);
    });
    return preserved;
  }

  function placePcPreservingState(id,x,y){
    if(typeof placeItem!=="function")return;
    const preserved=annotationStateForPlacement(id);
    const sourceItem=items.find(entry=>entry.id===id);
    const placementImage=String(sourceItem?.placementImage||sourceItem?.baseImage||sourceItem?.imageFallback||"");
    placeItem(id,x,y);

    const state=appState();
    state.items||={};
    const local=state.items[id]||(state.items[id]=makeLocalItemState(id));
    if(preserved)Object.assign(local,preserved);
    if(placementImage)local.placedImage=placementImage;
    saveState(state);
    if(typeof saveCurrentTemplateState==="function")saveCurrentTemplateState(state);
    const item=items.find(entry=>entry.id===id);
    if(item){
      item.local=local;
      if(placementImage){
        item.baseImage=placementImage;
        item.imageFallback=item.imageFallback||placementImage;
      }
    }
    if(typeof renderPlaced==="function")renderPlaced();
  }

  function paintParticipants(){
    try{renderLibrary()}catch{}
    try{renderPlaced()}catch{}
    try{renderPcSources()}catch{}
  }

  function paintAfterLayout(){
    if(activePaintFrame)cancelAnimationFrame(activePaintFrame);
    activePaintFrame=requestAnimationFrame(()=>requestAnimationFrame(()=>{
      activePaintFrame=0;
      paintParticipants();
    }));
  }

  function setParticipants(list,{forcePaint=false}={}){
    const next=Array.isArray(list)?list:[],signature=participantKey(next);
    participants=next;
    if(signature===participantsSignature){if(forcePaint)paintParticipants();return false}
    participantsSignature=signature;
    const state=appState();state.items||={};
    let stateChanged=false;
    items=participants.map(person=>{
      const id=`participant:${person.authorId}:${person.personaId}`,image=preferredImage(person),fallback=fallbackImage(person);
      if(!state.items[id]){state.items[id]=clone(savedItemState(id))||makeLocalItemState(id);stateChanged=true}
      const placedImage=String(state.items[id]?.placedImage||"");
      const displayImage=window.JijinDesktop?image:placedImage||image;
      return{id,name:person.name,url:"",baseImage:displayImage,imageFallback:fallback||displayImage,placementImage:window.JijinDesktop?(image||fallback):(person.serverIcon||image||fallback),imageSignature:`participant:${person.personaId}:${displayImage}:${fallback}`,color:/^#[0-9a-f]{6}$/i.test(person.textColor||'')?person.textColor:null,...(window.JijinDesktop?{markerColor:person.color||"#ffe66b",markerColorDark:person.colorDark||person.color||"#ffe66b"}:{}),order:null,ownerId:person.authorId,personaId:person.personaId,local:state.items[id]};
    });
    if(stateChanged)saveState(state);
    paintParticipants();
    if(typeof hydrateCharacterImages==='function')hydrateCharacterImages(items).catch(error=>console.warn('PC image hydration failed',error));
    saveParticipants();
    return true;
  }

  async function load(room,force=false){
    const nextRoom=room||activeRoom||"";
    activeRoom=nextRoom;
    if(!nextRoom){setParticipants([]);return}
    // Fetch each room once; subsequent reads require an actual change event.
    if(!force&&loadKey===nextRoom){
      if(loadPromise)return loadPromise;
      if(verifiedRooms.has(nextRoom))return;
    }
    const seq=++loadSeq;
    loadKey=nextRoom;
    const task=(async()=>{
      const result=await api(participantPath(nextRoom));let list=result.participants||[];
      if(Number.isFinite(result.revision)&&result.revision<participantRevision)return;
      if(Number.isFinite(result.revision))participantRevision=result.revision;
      if(seq!==loadSeq||activeRoom!==nextRoom)return;
      const changed=setParticipants(list);
      lastLoadedAt=Date.now();
      verifiedRooms.add(nextRoom);
      if(changed)paintAfterLayout();
    })();
    loadPromise=task;
    try{return await task}finally{if(loadPromise===task)loadPromise=null}
  }

  function sourceHtml(person){
    const id=`participant:${person.authorId}:${person.personaId}`,item=items.find(item=>item.id===id),image=item&&typeof displayImage==="function"?displayImage(item):preferredImage(person),fallback=fallbackImage(person),name=person.name||"PC";
    return `<span class="matrix-pc-source" draggable="true" data-matrix-pc-id="${escHtml(id)}" title="${escHtml(name)}をドラッグして配置" aria-label="${escHtml(name)}をドラッグして配置">${image?`<img data-matrix-image-id="${escHtml(id)}" src="${escHtml(image)}" data-fallback-src="${escHtml(fallback)}" alt="" draggable="false">`:'<span class="matrix-pc-empty">PC</span>'}</span>`;
  }

  function renderPcSources(){
    const strip=document.querySelector("#matrixPcStrip");if(!strip)return;
    const own=mine();
    strip.innerHTML=own.length?own.map(sourceHtml).join(""):'<span class="matrix-pc-menu-empty">PCなし</span>';
  }

  function installImageFallback(){
    if(document.documentElement.dataset.matrixPcImageFallback)return;
    document.documentElement.dataset.matrixPcImageFallback="1";
    document.addEventListener("error",event=>{
      const image=event.target;if(!(image instanceof HTMLImageElement))return;
      let fallback=image.dataset.fallbackSrc||"";
      if(!fallback){
        const placed=image.closest?.(".placed[data-id]");
        const itemId=String(placed?.dataset?.id||"");
        const item=(typeof items!=="undefined"&&Array.isArray(items))?items.find(entry=>String(entry?.id||"")===itemId):null;
        fallback=String(item?.imageFallback||"");
      }
      if(fallback&&image.src!==new URL(fallback,location.href).href&&!image.dataset.fallbackTried){
        image.dataset.fallbackTried="1";
        image.src=fallback;
      }
    },true);
  }

  function dropPercent(event,canvas){
    const rect=canvas.getBoundingClientRect();
    let left=0,top=0,width=rect.width,height=rect.height;
    try{
      const geom=typeof templateGeometry==="function"?templateGeometry():null;
      if(geom?.visible&&Number(geom.visible.width)>0&&Number(geom.visible.height)>0){
        left=Number(geom.visible.left)||0;
        top=Number(geom.visible.top)||0;
        width=Number(geom.visible.width);
        height=Number(geom.visible.height);
      }
    }catch{}
    const clamp=n=>Math.max(0,Math.min(100,n));
    return {
      x:clamp(((event.clientX-rect.left-left)/Math.max(1,width))*100),
      y:clamp(((event.clientY-rect.top-top)/Math.max(1,height))*100)
    };
  }

  function isPcDrag(event){
    if(draggingPcId)return true;
    const types=Array.from(event.dataTransfer?.types||[]);
    return types.includes("text/x-matrix-pc");
  }

  function stopPcDropEvent(event){
    event.preventDefault();
    event.stopPropagation();
    if(typeof event.stopImmediatePropagation==="function")event.stopImmediatePropagation();
  }

  function setupCanvasDrop(){
    const canvas=document.querySelector(".canvas");if(!canvas||canvas.dataset.matrixPcDropReady)return;
    canvas.dataset.matrixPcDropReady="1";

    canvas.addEventListener("dragenter",event=>{
      if(!isPcDrag(event))return;
      stopPcDropEvent(event);
      canvas.classList.add("matrix-pc-dragover");
    },true);
    canvas.addEventListener("dragover",event=>{
      if(!isPcDrag(event))return;
      stopPcDropEvent(event);
      if(event.dataTransfer)event.dataTransfer.dropEffect="move";
      canvas.classList.add("matrix-pc-dragover");
    },true);
    canvas.addEventListener("drop",event=>{
      if(!isPcDrag(event))return;
      const id=draggingPcId||event.dataTransfer?.getData("text/x-matrix-pc")||"";
      stopPcDropEvent(event);
      canvas.classList.remove("matrix-pc-dragover");
      if(id){
        const pos=dropPercent(event,canvas);
        placePcPreservingState(id,pos.x,pos.y);
      }
      draggingPcId="";
    },true);
    canvas.addEventListener("dragleave",event=>{
      if(!isPcDrag(event))return;
      if(!canvas.contains(event.relatedTarget))canvas.classList.remove("matrix-pc-dragover");
    },true);
  }

  function setupPcControls(){
    setupBoardUi();
    const toolbar=document.querySelector(".stage-toolbar-primary");if(!toolbar)return;
    toolbar.querySelector(".stage-area-label")?.remove();
    toolbar.querySelector(".matrix-pc-controls")?.remove();
    const controls=document.createElement("div");
    controls.className="matrix-pc-controls";
    controls.innerHTML='<div id="matrixPcStrip" class="matrix-pc-strip" aria-label="配置するPC"></div>';
    toolbar.prepend(controls);

    controls.addEventListener("dragstart",event=>{
      const source=event.target.closest("[data-matrix-pc-id]");if(!source)return;
      draggingPcId=source.dataset.matrixPcId||"";
      source.classList.add("dragging");
      if(event.dataTransfer){
        event.dataTransfer.effectAllowed="move";
        event.dataTransfer.clearData();
        event.dataTransfer.setData("text/x-matrix-pc",draggingPcId);
      }
    });
    controls.addEventListener("dragend",event=>{
      event.target.closest("[data-matrix-pc-id]")?.classList.remove("dragging");
      document.querySelector(".canvas")?.classList.remove("matrix-pc-dragover");
      draggingPcId="";
    });
    setupCanvasDrop();
    renderPcSources();
  }

  installImageFallback();
  setupBoardUi();
  setupPcControls();

  items=[];
  if(!restoreParticipants(activeRoom))setParticipants([],{forcePaint:true});

  window.addEventListener("matrix-board-room",event=>{
    activeRoom=event.detail?.roomId||boardId;
    restoreParticipants(activeRoom);
    load(activeRoom,true).catch(console.warn);
  });
  window.addEventListener("matrix-board-participants-changed",event=>{
    const data=event.detail?.data;
    if(Array.isArray(data?.participants)&&Number.isFinite(data.revision)){
      if(data.revision<participantRevision)return;
      participantRevision=data.revision;++loadSeq;lastLoadedAt=Date.now();setParticipants(data.participants);return;
    }
    load(activeRoom,true).catch(console.warn);
  });
  window.addEventListener("jijinboard-player-master-updated",()=>load(activeRoom).catch(console.warn));
  window.addEventListener("matrix-board-active",()=>{
    if(!verifiedRooms.has(activeRoom))load(activeRoom).catch(console.warn);
  });

  window.addEventListener("message",event=>{if(event.origin===location.origin&&event.data?.type==="jijinboard-participants-saved")load(activeRoom,true).catch(console.warn)});
  // Visibility alone is not a data change. Reconnect notifications refresh participants.
  queueMicrotask(()=>load(activeRoom).catch(console.warn));
})();
