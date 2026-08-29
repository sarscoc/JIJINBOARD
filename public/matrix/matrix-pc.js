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
  let activeRoom=params.get("room")||"",participants=[],draggingPcId="";
  const api=async(path,options={})=>{const response=await fetch(path,{headers:{"content-type":"application/json",...(options.headers||{})},...options}),body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||`通信エラー (${response.status})`);return body};
  const me=()=>{try{return JSON.parse(localStorage.getItem("trpgMarkerProfile")||"null")}catch{return null}};
  const localPcs=()=>{try{return (JSON.parse(localStorage.getItem(`personas:${activeRoom}`)||"[]")||[]).filter(person=>String(person?.type||"PC")==="PC"&&String(person?.name||"").trim())}catch{return[]}};
  const preferredImage=person=>person?.matrixIcon||person?.baseIcon||person?.icon||"";
  const mine=()=>{const profile=me();if(!profile)return[];const byId=participants.filter(person=>person.authorId===profile.id);return byId.length?byId:participants.filter(person=>person.plName&&profile.plName&&person.plName===profile.plName)};
  const escHtml=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  function setupBoardUi(){
    // Board mode no longer needs the icon ZIP export in the top toolbar.
    document.querySelector("#exportIconsBtn")?.remove();

    // Keep destructive template removal at the very bottom of Display Settings,
    // after every visual option, rather than beside the settings heading.
    const settingsBody=document.querySelector("#displaySettingsBody");
    const deleteButton=document.querySelector("#deleteCurrentTemplateBtn");
    if(settingsBody&&deleteButton&&deleteButton.parentNode!==settingsBody)settingsBody.append(deleteButton);
  }

  function pruneRemovedParticipants(validIds,state){
    state.items||={};
    let changed=false;
    Object.keys(state.items).forEach(id=>{
      if(id.startsWith("participant:")&&!validIds.has(id)){delete state.items[id];changed=true}
    });
    if(typeof templateStates==="function"&&typeof setTemplateStates==="function"){
      const all=templateStates();let templatesChanged=false;
      Object.values(all||{}).forEach(saved=>{
        const stored=saved?.items;if(!stored)return;
        Object.keys(stored).forEach(id=>{
          if(id.startsWith("participant:")&&!validIds.has(id)){delete stored[id];templatesChanged=true}
        });
      });
      if(templatesChanged)setTemplateStates(all);
    }
    return changed;
  }

  function setParticipants(list){
    participants=list||[];
    const state=appState();state.items||={};
    const validIds=new Set(participants.map(person=>`participant:${person.authorId}:${person.personaId}`));
    pruneRemovedParticipants(validIds,state);
    items=participants.map(person=>{
      const id=`participant:${person.authorId}:${person.personaId}`,image=preferredImage(person);
      if(!state.items[id])state.items[id]=makeLocalItemState(id);
      return{id,name:person.name,url:"",baseImage:image,imageSignature:`participant:${person.personaId}:${image}`,color:null,order:null,ownerId:person.authorId,personaId:person.personaId,local:state.items[id]};
    });
    saveState(state);renderLibrary();renderPlaced();renderPcSources();
  }

  function localParticipantRows(){
    const profile=me();if(!profile?.id)return[];
    return localPcs().map((person,index)=>({authorId:profile.id,plName:profile.plName||"",personaId:person.id||`persona-${index}`,name:person.name,icon:person.icon||"",baseIcon:person.icon||"",matrixIcon:""}));
  }

  async function syncLocalPcsIfNeeded(entry){
    const profile=me(),local=localPcs();if(!profile?.id||!profile?.plName||!local.length||!activeRoom)return false;
    const current=(entry?.participants||[]).filter(person=>person.authorId===profile.id);
    const currentKey=current.map(person=>`${person.personaId}:${person.name}`).sort().join("|");
    const localKey=local.map((person,index)=>`${person.id||`persona-${index}`}:${person.name}`).sort().join("|");
    if(currentKey===localKey)return false;
    await api(`/api/boards/${encodeURIComponent(boardId)}/logs/${encodeURIComponent(activeRoom)}/participants`,{method:"POST",body:JSON.stringify({authorId:profile.id,plName:profile.plName,personas:local.map((person,index)=>({id:person.id||`persona-${index}`,name:person.name,type:"PC",icon:person.icon||""}))})});
    return true;
  }

  async function load(room){
    activeRoom=room||activeRoom||"";
    if(!activeRoom){setParticipants([]);return}
    let board=await api(`/api/boards/${encodeURIComponent(boardId)}`),entry=(board.logs||[]).find(log=>log.roomId===activeRoom);
    if(await syncLocalPcsIfNeeded(entry).catch(()=>false)){
      board=await api(`/api/boards/${encodeURIComponent(boardId)}`);entry=(board.logs||[]).find(log=>log.roomId===activeRoom);
    }
    let list=entry?.participants||[];
    const profile=me();
    if(profile?.id&&!list.some(person=>person.authorId===profile.id))list=[...list,...localParticipantRows()];
    setParticipants(list);
  }

  function sourceHtml(person){
    const image=preferredImage(person),id=`participant:${person.authorId}:${person.personaId}`,name=person.name||"PC";
    return `<span class="matrix-pc-source" draggable="true" data-matrix-pc-id="${escHtml(id)}" title="${escHtml(name)}をドラッグして配置" aria-label="${escHtml(name)}をドラッグして配置">${image?`<img src="${escHtml(image)}" alt="" draggable="false">`:'<span class="matrix-pc-empty">PC</span>'}</span>`;
  }

  function renderPcSources(){
    const strip=document.querySelector("#matrixPcStrip");if(!strip)return;
    const own=mine();
    strip.innerHTML=own.length?own.map(sourceHtml).join(""):'<span class="matrix-pc-menu-empty">PCなし</span>';
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

    // Capture PC drags before the original template-image drop handler can see them.
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
        if(typeof placeItem==="function")placeItem(id,pos.x,pos.y);
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

  setupBoardUi();
  setupPcControls();
  window.addEventListener("message",event=>{if(event.origin===location.origin&&event.data?.type==="jijinboard-active-room")load(event.data.roomId).catch(console.warn)});
  window.addEventListener("matrix-board-room",event=>load(event.detail?.roomId||activeRoom).catch(console.warn));
  window.addEventListener("matrix-board-active",()=>load(activeRoom).catch(console.warn));
  window.addEventListener("focus",()=>load(activeRoom).catch(()=>{}));
  setTimeout(()=>load(activeRoom).catch(console.warn),500);
})();
