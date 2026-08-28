"use strict";
(()=>{
  const params=new URL(location.href).searchParams,boardId=params.get("board");
  if(!boardId)return;
  let activeRoom=params.get("room")||"",participants=[],selectedPersonaId="";
  const api=async(path,options={})=>{const response=await fetch(path,{headers:{"content-type":"application/json",...(options.headers||{})},...options}),body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||`通信エラー (${response.status})`);return body};
  const me=()=>{try{return JSON.parse(localStorage.getItem("trpgMarkerProfile")||"null")}catch{return null}};
  const localPcs=()=>{try{return (JSON.parse(localStorage.getItem(`personas:${activeRoom}`)||"[]")||[]).filter(person=>String(person?.type||"PC")==="PC"&&String(person?.name||"").trim())}catch{return[]}};
  const preferredImage=person=>person?.matrixIcon||person?.baseIcon||person?.icon||"";
  const mine=()=>{const profile=me();if(!profile)return[];const byId=participants.filter(person=>person.authorId===profile.id);return byId.length?byId:participants.filter(person=>person.plName&&profile.plName&&person.plName===profile.plName)};
  const escHtml=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

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
    saveState(state);renderLibrary();renderPlaced();renderPcControls();
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

  function selected(){const own=mine();return own.find(person=>person.personaId===selectedPersonaId)||own[0]}
  function placeSelected(){const person=selected();if(!person)return alert("先にLOGCOMMENTSの発言者設定からPCを追加してください。");selectedPersonaId=person.personaId;placeItem(`participant:${person.authorId}:${person.personaId}`,50,50);renderPcControls()}

  function pcOptionHtml(person){const image=preferredImage(person);return `<button type="button" class="matrix-pc-option" data-persona="${escHtml(person.personaId)}">${image?`<img src="${escHtml(image)}" alt="">`:'<span class="matrix-pc-empty">PC</span>'}<b>${escHtml(person.name||"PC")}</b></button>`}
  function currentButtonHtml(person){const image=preferredImage(person);return `${image?`<img src="${escHtml(image)}" alt="">`:'<span class="matrix-pc-empty">PC</span>'}<b>${escHtml(person?.name||"PCなし")}</b><i>⌄</i>`}

  function renderPcControls(){
    const controls=document.querySelector(".matrix-pc-controls");if(!controls)return;
    const own=mine();
    if(!own.some(person=>person.personaId===selectedPersonaId))selectedPersonaId=own[0]?.personaId||"";
    const current=selected();
    const picker=document.querySelector("#matrixPcPickerBtn"),menu=document.querySelector("#matrixPcMenu"),place=document.querySelector("#matrixPlacePc");
    if(picker)picker.innerHTML=currentButtonHtml(current);
    if(menu)menu.innerHTML=own.map(pcOptionHtml).join("")||'<span class="matrix-pc-menu-empty">PCがありません</span>';
    if(place)place.disabled=!current;
    controls.classList.toggle("empty",!current);
  }

  function closePicker(){document.querySelector("#matrixPcMenu")?.classList.remove("open");document.querySelector("#matrixPcPickerBtn")?.setAttribute("aria-expanded","false")}
  function setupPcControls(){
    const toolbar=document.querySelector(".stage-toolbar-primary");if(!toolbar||document.querySelector(".matrix-pc-controls"))return;
    toolbar.querySelector(".stage-area-label")?.remove();
    const controls=document.createElement("div");controls.className="matrix-pc-controls";
    controls.innerHTML='<div class="matrix-pc-picker"><button id="matrixPcPickerBtn" type="button" aria-haspopup="listbox" aria-expanded="false"><span class="matrix-pc-empty">PC</span><b>PCなし</b><i>⌄</i></button><div id="matrixPcMenu" class="matrix-pc-menu" role="listbox"></div></div><button id="matrixPlacePc" type="button">配置</button>';
    toolbar.prepend(controls);
    document.querySelector("#matrixPlacePc").onclick=placeSelected;
    document.querySelector("#matrixPcPickerBtn").onclick=event=>{event.stopPropagation();const menu=document.querySelector("#matrixPcMenu"),open=!menu.classList.contains("open");menu.classList.toggle("open",open);event.currentTarget.setAttribute("aria-expanded",String(open))};
    document.querySelector("#matrixPcMenu").onclick=event=>{const option=event.target.closest("[data-persona]");if(!option)return;selectedPersonaId=option.dataset.persona;closePicker();renderPcControls()};
    document.addEventListener("click",event=>{if(!event.target.closest(".matrix-pc-picker"))closePicker()});
    renderPcControls();
  }

  setupPcControls();
  window.addEventListener("message",event=>{if(event.origin===location.origin&&event.data?.type==="jijinboard-active-room")load(event.data.roomId).catch(console.warn)});
  window.addEventListener("matrix-board-room",event=>load(event.detail?.roomId||activeRoom).catch(console.warn));
  window.addEventListener("matrix-board-active",()=>load(activeRoom).catch(console.warn));
  window.addEventListener("focus",()=>load(activeRoom).catch(()=>{}));
  setTimeout(()=>load(activeRoom).catch(console.warn),500);
})();
