"use strict";

// Persona data is the most important local state in JIJINBOARD.
// Keep an independent per-room/per-author vault and recover from every durable
// source before accepting a transient empty PC list.
(()=>{
  if(typeof state==="undefined"||typeof saveProfile!=="function"||typeof loadRoomPersonas!=="function")return;

  const params=new URL(location.href).searchParams;
  const boardId=params.get("board")||"";
  const VAULT_KEY="jijinboardPersonaVault.v1";
  const CHANNEL="jijinboard-personas-v1";
  const baseSaveProfile=saveProfile;
  const baseLoadRoomPersonas=loadRoomPersonas;
  const baseEmitIntegratedProfile=typeof emitIntegratedProfile==="function"?emitIntegratedProfile:null;
  const baseOpenProfile=typeof openProfile==="function"?openProfile:null;
  let recoveryPromise=null;
  let applyingRemote=false;
  let explicitDeleteCapture=false;

  const clone=value=>{try{return structuredClone(value)}catch{try{return JSON.parse(JSON.stringify(value))}catch{return value}}};
  const validList=value=>Array.isArray(value)?value.filter(persona=>persona&&typeof persona==="object"):[];
  const namedList=value=>validList(value).filter(persona=>String(persona.name||"").trim());
  const authorId=()=>String(state.profile?.id||"");
  const currentRoom=()=>String(state.roomId||params.get("room")||"");
  const slotKey=room=>`${room}::${authorId()}`;
  const participantSyncKey=room=>`jijinboardParticipantSync:${boardId}:${room}`;

  function readVault(){try{const value=JSON.parse(localStorage.getItem(VAULT_KEY)||"{}");return value&&typeof value==="object"?value:{}}catch{return{}}}
  function writeVaultObject(value){try{localStorage.setItem(VAULT_KEY,JSON.stringify(value))}catch(error){console.warn("Persona vault save failed",error)}}
  function entryFor(room=currentRoom()){if(!room||!authorId())return null;return readVault()[slotKey(room)]||null}

  function normalize(personas){
    return validList(personas).map(persona=>({
      ...clone(persona),
      id:String(persona.id||persona.personaId||((crypto.randomUUID&&crypto.randomUUID())||Math.random().toString(36).slice(2))),
      name:String(persona.name||persona.personaName||""),
      type:String(persona.type||"PC"),
      icon:String(persona.icon||persona.baseIcon||""),
      color:String(persona.color||"#ffe66b"),
      colorDark:String(persona.colorDark||persona.color||"#ffe66b")
    }));
  }

  let channel=null;
  try{channel=new BroadcastChannel(CHANNEL)}catch{}

  function broadcast(room,entry){try{channel?.postMessage({room,authorId:authorId(),entry})}catch{}}

  function storeSnapshot(room,personas,{explicitEmpty=false,broadcastChange=true}={}){
    if(!room||!authorId())return;
    const list=normalize(personas);
    if(!list.length&&!explicitEmpty)return;
    const vault=readVault(),key=slotKey(room),entry={personas:list,explicitEmpty:!!explicitEmpty,updatedAt:Date.now()};
    vault[key]=entry;writeVaultObject(vault);
    try{localStorage.setItem(`personas:${room}`,JSON.stringify(list))}catch{}
    if(broadcastChange)broadcast(room,entry);
  }

  function applyPersonas(room,personas,{persist=true}={}){
    if(room!==currentRoom()||!state.profile)return false;
    const list=normalize(personas);
    if(!namedList(list).length)return false;
    applyingRemote=true;
    state.profile.personas=list;
    try{localStorage.setItem(`personas:${room}`,JSON.stringify(list))}catch{}
    if(persist)storeSnapshot(room,list,{broadcastChange:false});
    applyingRemote=false;
    try{renderPersonas?.()}catch{}
    try{fillPersonaSelect?.()}catch{}
    return true;
  }

  function recoverParticipantSignature(room){
    if(!boardId||!room)return false;
    try{
      const saved=JSON.parse(localStorage.getItem(participantSyncKey(room))||"null");
      const rows=namedList(saved?.personas);
      if(rows.length)return applyPersonas(room,rows);
    }catch{}
    return false;
  }

  function recoverLocal(room=currentRoom()){
    if(!room||!state.profile)return false;
    const current=namedList(state.profile.personas);
    if(current.length){storeSnapshot(room,state.profile.personas,{broadcastChange:false});return true}

    let roomLocal=[];
    try{roomLocal=validList(JSON.parse(localStorage.getItem(`personas:${room}`)||"[]"))}catch{}
    if(namedList(roomLocal).length)return applyPersonas(room,roomLocal);

    const entry=entryFor(room);
    if(entry?.explicitEmpty)return false;
    if(namedList(entry?.personas).length)return applyPersonas(room,entry.personas,{persist:false});
    if(recoverParticipantSignature(room))return true;
    return false;
  }

  function colorFromAnnotations(persona){
    const annotation=(state.annotations||[]).find(item=>item?.author_id===authorId()&&item?.persona_name===persona.name&&item?.persona_type==="PC"&&item?.color);
    return String(annotation?.color||"#ffe66b");
  }

  function recoverAnnotations(room=currentRoom()){
    if(!room||entryFor(room)?.explicitEmpty)return false;
    const byKey=new Map();
    for(const item of state.annotations||[]){
      if(item?.author_id!==authorId()||item?.persona_type!=="PC"||!String(item?.persona_name||"").trim())continue;
      const key=`${item.persona_type}:${item.persona_name}`;
      if(byKey.has(key))continue;
      byKey.set(key,{
        id:item.persona_id||((crypto.randomUUID&&crypto.randomUUID())||Math.random().toString(36).slice(2)),
        name:item.persona_name,
        type:"PC",
        icon:item.persona_icon||"",
        color:item.color||"#ffe66b",
        colorDark:item.color||"#ffe66b"
      });
    }
    return byKey.size?applyPersonas(room,[...byKey.values()]):false;
  }

  async function recoverServer(room=currentRoom()){
    if(!boardId||!room||!authorId()||entryFor(room)?.explicitEmpty)return false;
    try{
      const response=await fetch(`/api/boards/${encodeURIComponent(boardId)}`,{cache:"no-store"});
      if(!response.ok)return false;
      const board=await response.json();
      const log=(board.logs||[]).find(item=>item.roomId===room);
      const rows=(log?.participants||[]).filter(person=>person.authorId===authorId());
      if(!rows.length)return false;
      const recovered=rows.map(person=>({
        id:person.personaId||((crypto.randomUUID&&crypto.randomUUID())||Math.random().toString(36).slice(2)),
        name:person.name||"",
        type:"PC",
        icon:person.baseIcon||person.icon||"",
        color:colorFromAnnotations(person),
        colorDark:colorFromAnnotations(person)
      })).filter(person=>person.name);
      if(!recovered.length)return false;
      const applied=applyPersonas(room,recovered);
      if(applied){
        try{baseSaveProfile()}catch{}
        try{baseEmitIntegratedProfile?.()}catch{}
      }
      return applied;
    }catch(error){console.warn("Persona server recovery failed",error);return false}
  }

  async function ensurePersonas(){
    const room=currentRoom();
    if(!room||!state.profile)return false;
    if(recoverLocal(room))return true;
    if(entryFor(room)?.explicitEmpty)return true;
    if(recoveryPromise)return recoveryPromise;
    recoveryPromise=(async()=>{
      if(await recoverServer(room))return true;
      if(recoverAnnotations(room))return true;
      // Room annotations are loaded after the room request. Retry them briefly so an
      // old comment can still rescue a PC if both local snapshots were lost.
      for(const wait of [250,700,1400]){
        await new Promise(resolve=>setTimeout(resolve,wait));
        if(namedList(state.profile?.personas).length)return true;
        if(entryFor(room)?.explicitEmpty)return true;
        if(recoverAnnotations(room))return true;
      }
      return false;
    })().finally(()=>{recoveryPromise=null});
    return recoveryPromise;
  }

  saveProfile=function saveProfileWithPersonaVault(){
    const room=currentRoom(),personas=normalize(state.profile?.personas||[]),explicitEmpty=!!(room&&explicitDeleteCapture&&personas.length===0);
    baseSaveProfile();
    if(applyingRemote||!room)return;
    if(personas.length)storeSnapshot(room,personas);
    else if(explicitEmpty)storeSnapshot(room,[],{explicitEmpty:true});
  };

  loadRoomPersonas=function loadRoomPersonasWithRecovery(roomId){
    baseLoadRoomPersonas(roomId);
    recoverLocal(String(roomId||""));
    ensurePersonas().then(()=>{try{renderPersonas?.();fillPersonaSelect?.()}catch{}});
  };

  if(baseEmitIntegratedProfile){
    emitIntegratedProfile=function emitIntegratedProfileAfterPersonaReady(){
      const room=currentRoom();
      if(room&&!namedList(state.profile?.personas).length&&!entryFor(room)?.explicitEmpty){
        ensurePersonas().then(()=>baseEmitIntegratedProfile());
        return;
      }
      baseEmitIntegratedProfile();
    };
  }

  if(baseOpenProfile){
    openProfile=function openProfileWithPersonaRecovery(){
      recoverLocal();
      baseOpenProfile();
      const list=document.querySelector("#personaList");
      if(!namedList(state.profile?.personas).length&&!entryFor()?.explicitEmpty&&list){
        list.innerHTML='<div class="profile-persona-loading" style="padding:8px 4px;color:#8a929d;font-size:9px">PCを読み込んでいます…</div>';
      }
      ensurePersonas().then(()=>{if(document.querySelector("#profileDialog")?.open)try{renderPersonas?.()}catch{}});
    };
  }

  // Capture an intentional removal before the legacy click handler mutates the array.
  document.addEventListener("click",event=>{
    const remove=event.target.closest?.("[data-remove-persona]");
    if(!remove)return;
    explicitDeleteCapture=state.profile?.personas?.length===1;
    if(explicitDeleteCapture){
      const room=currentRoom();
      setTimeout(()=>{
        if(room===currentRoom()&&state.profile?.personas?.length===0)storeSnapshot(room,[],{explicitEmpty:true});
        explicitDeleteCapture=false;
      },0);
    }
  },true);

  channel?.addEventListener("message",event=>{
    const data=event.data||{},room=currentRoom();
    if(data.room!==room||data.authorId!==authorId()||!data.entry)return;
    if(data.entry.explicitEmpty)return;
    if(namedList(data.entry.personas).length&&!namedList(state.profile?.personas).length)applyPersonas(room,data.entry.personas,{persist:false});
  });

  addEventListener("storage",event=>{
    const room=currentRoom();
    if(event.key===VAULT_KEY){
      const entry=entryFor(room);
      if(entry&&!entry.explicitEmpty&&namedList(entry.personas).length&&!namedList(state.profile?.personas).length)applyPersonas(room,entry.personas,{persist:false});
      return;
    }
    if(event.key===`personas:${room}`&&!namedList(state.profile?.personas).length)recoverLocal(room);
  });

  // app.js has already assigned roomId before its first network await. Capture any
  // valid room personas immediately, or repair an empty iframe before it is shown.
  if(currentRoom()){
    if(namedList(state.profile?.personas).length)storeSnapshot(currentRoom(),state.profile.personas,{broadcastChange:false});
    ensurePersonas().then(()=>{try{renderPersonas?.();fillPersonaSelect?.()}catch{}});
  }
  window.jijinEnsurePersonas=ensurePersonas;
})();
