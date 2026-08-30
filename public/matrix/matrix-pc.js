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
  let activeRoom=params.get("room")||"",participants=[],draggingPcId="",participantsSignature="";
  let loadPromise=null,loadKey="",lastLoadedAt=0,loadSeq=0,activePaintFrame=0;
  const api=async(path,options={})=>{const response=await fetch(path,{headers:{"content-type":"application/json",...(options.headers||{})},...options}),body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||`通信エラー (${response.status})`);return body};
  const me=()=>{try{return JSON.parse(localStorage.getItem("trpgMarkerProfile")||"null")}catch{return null}};
  const localPcs=(room=activeRoom)=>{try{return (JSON.parse(localStorage.getItem(`personas:${room}`)||"[]")||[]).filter(person=>String(person?.type||"PC")==="PC"&&String(person?.name||"").trim())}catch{return[]}};
  const preferredImage=person=>person?.matrixIcon||person?.baseIcon||person?.icon||"";
  const fallbackImage=person=>person?.baseIcon||person?.icon||"";
  const mine=()=>{const profile=me();if(!profile)return[];const byId=participants.filter(person=>person.authorId===profile.id);return byId.length?byId:participants.filter(person=>person.plName&&profile.plName&&person.plName===profile.plName)};
  const escHtml=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const clone=value=>{if(value===undefined)return undefined;try{return structuredClone(value)}catch{try{return JSON.parse(JSON.stringify(value))}catch{return value}}};
  const placementOnlyKeys=new Set(["placed","x","y","templateX","templateY","coordVersion","scaleBaseWidth","mobileSelected"]);
  const participantKey=list=>(list||[]).map(person=>[
    person?.authorId||"",person?.plName||"",person?.personaId||"",person?.name||"",preferredImage(person),fallbackImage(person)
  ].join("\u001f")).sort().join("\u001e");

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
    placeItem(id,x,y);
    if(!preserved)return;

    const state=appState();
    state.items||={};
    const local=state.items[id]||(state.items[id]=makeLocalItemState(id));
    Object.assign(local,preserved);
    saveState(state);
    if(typeof saveCurrentTemplateState==="function")saveCurrentTemplateState(state);
    const item=items.find(entry=>entry.id===id);
    if(item)item.local=local;
    if(typeof renderPlaced==="function")renderPlaced();
  }

  // Participant sync is eventually consistent. A short-lived missing participant
  // must never erase a PC that is already placed on a template. Keep the last
  // known participant record until the user explicitly removes the placed item.
  function retainPlacedParticipants(list){
    const next=Array.isArray(list)?[...list]:[];
    const known=new Set(next.map(person=>`participant:${person.authorId}:${person.personaId}`));
    const state=appState();
    for(const person of participants){
      const id=`participant:${person.authorId}:${person.personaId}`;
      if(known.has(id))continue;
      const local=state?.items?.[id]||savedItemState(id);
      if(!local?.placed)continue;
      next.push(person);
      known.add(id);
    }
    return next;
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
    const next=retainPlacedParticipants(list),signature=participantKey(next);
    participants=next;
    if(signature===participantsSignature){if(forcePaint)paintParticipants();return false}
    participantsSignature=signature;
    const state=appState();state.items||={};
    let stateChanged=false;
    items=participants.map(person=>{
      const id=`participant:${person.authorId}:${person.personaId}`,image=preferredImage(person),fallback=fallbackImage(person);
      if(!state.items[id]){state.items[id]=clone(savedItemState(id))||makeLocalItemState(id);stateChanged=true}
      return{id,name:person.name,url:"",baseImage:image,imageFallback:fallback,imageSignature:`participant:${person.personaId}:${image}:${fallback}`,color:null,order:null,ownerId:person.authorId,personaId:person.personaId,local:state.items[id]};
    });
    if(stateChanged)saveState(state);
    paintParticipants();
    return true;
  }

  function localParticipantRows(room=activeRoom){
    const profile=me();if(!profile?.id)return[];
    return localPcs(room).map((person,index)=>({authorId:profile.id,plName:profile.plName||"",personaId:person.id||`persona-${index}`,name:person.name,icon:person.icon||"",baseIcon:person.icon||"",matrixIcon:person.matrixIcon||""}));
  }

  function mergeOwnLocalImages(list,room){
    const profile=me();if(!profile?.id)return list||[];
    const local=localPcs(room),byId=new Map(),byName=new Map();
    for(const person of local){
      const id=String(person?.id||person?.projectPersonId||"");if(id)byId.set(id,person);
      const name=String(person?.name||"");if(name&&!byName.has(name))byName.set(name,person);
    }
    return (list||[]).map(person=>{
      if(String(person?.authorId||"")!==String(profile.id))return person;
      const localPerson=byId.get(String(person?.personaId||""))||byName.get(String(person?.name||""));
      if(!localPerson)return person;
      const localBase=String(localPerson.icon||"");
      const localMatrix=String(localPerson.matrixIcon||"");
      return {...person,icon:localBase||person.icon||"",baseIcon:localBase||person.baseIcon||person.icon||"",matrixIcon:localMatrix||person.matrixIcon||""};
    });
  }

  async function syncLocalPcsIfNeeded(entry,room){
    const profile=me(),local=localPcs(room);if(!profile?.id||!profile?.plName||!local.length||!room)return false;
    const current=(entry?.participants||[]).filter(person=>person.authorId===profile.id);
    // Server icons are normalized to /api/... URLs while local icons are data URLs.
    // Comparing image strings therefore makes the same PC look changed forever and
    // causes POST -> realtime refresh -> reload loops. Identity/name are enough here;
    // actual icon changes are synchronized by the LOG/profile save path.
    const currentKey=current.map(person=>`${person.personaId}:${person.name}`).sort().join("|");
    const localKey=local.map((person,index)=>`${person.id||`persona-${index}`}:${person.name}`).sort().join("|");
    if(currentKey===localKey)return false;
    await api(`/api/boards/${encodeURIComponent(boardId)}/logs/${encodeURIComponent(room)}/participants`,{method:"POST",body:JSON.stringify({authorId:profile.id,plName:profile.plName,personas:local.map((person,index)=>({id:person.id||`persona-${index}`,name:person.name,type:"PC",icon:person.icon||""}))})});
    window.matrixBoardContext?.notifyChange?.("participants");
    return true;
  }

  async function load(room,force=false){
    const nextRoom=room||activeRoom||"";
    activeRoom=nextRoom;
    if(!nextRoom){setParticipants([]);return}
    const now=Date.now();
    if(!force&&loadKey===nextRoom){
      if(loadPromise)return loadPromise;
      if(now-lastLoadedAt<1200)return;
    }
    const seq=++loadSeq;
    loadKey=nextRoom;
    const task=(async()=>{
      let board=await api(`/api/boards/${encodeURIComponent(boardId)}`),entry=(board.logs||[]).find(log=>log.roomId===nextRoom);
      if(await syncLocalPcsIfNeeded(entry,nextRoom).catch(()=>false)){
        board=await api(`/api/boards/${encodeURIComponent(boardId)}`);entry=(board.logs||[]).find(log=>log.roomId===nextRoom);
      }
      if(seq!==loadSeq||activeRoom!==nextRoom)return;
      let list=mergeOwnLocalImages(entry?.participants||[],nextRoom);
      const profile=me();
      if(profile?.id&&!list.some(person=>person.authorId===profile.id))list=[...list,...localParticipantRows(nextRoom)];
      setParticipants(list,{forcePaint:true});
      lastLoadedAt=Date.now();
      paintAfterLayout();
    })();
    loadPromise=task;
    try{return await task}finally{if(loadPromise===task)loadPromise=null}
  }

  function sourceHtml(person){
    const image=preferredImage(person),fallback=fallbackImage(person),id=`participant:${person.authorId}:${person.personaId}`,name=person.name||"PC";
    return `<span class="matrix-pc-source" draggable="true" data-matrix-pc-id="${escHtml(id)}" title="${escHtml(name)}をドラッグして配置" aria-label="${escHtml(name)}をドラッグして配置">${image?`<img src="${escHtml(image)}" data-fallback-src="${escHtml(fallback)}" alt="" draggable="false">`:'<span class="matrix-pc-empty">PC</span>'}</span>`;
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

  // Paint known local PCs immediately. Server participants then replace/merge them.
  const immediate=localParticipantRows(activeRoom);
  if(immediate.length)setParticipants(immediate,{forcePaint:true});

  window.addEventListener("matrix-board-room",event=>{
    activeRoom=event.detail?.roomId||activeRoom;
    participantsSignature="";
    const local=localParticipantRows(activeRoom);
    if(local.length)setParticipants(local,{forcePaint:true});
    load(activeRoom,true).catch(console.warn);
  });
  window.addEventListener("matrix-board-participants-changed",()=>load(activeRoom,true).catch(console.warn));
  window.addEventListener("jijinboard-player-master-updated",()=>load(activeRoom).catch(console.warn));
  window.addEventListener("matrix-board-active",()=>{
    paintParticipants();
    paintAfterLayout();
    load(activeRoom).catch(console.warn);
  });

  // Do not wait 500ms before the first participant request.
  queueMicrotask(()=>load(activeRoom).catch(console.warn));
})();