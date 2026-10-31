"use strict";
(()=>{
  const params=new URL(location.href).searchParams;
  const boardId=params.get("board")||"";
  const VAULT_KEY="jijinboardPersonaVault.v1";
  const RESET_CHANNEL="jijinboard-persona-reset-v1";
  let channel=null;
  try{channel=new BroadcastChannel(RESET_CHANNEL)}catch{}

  function roomId(){return String(state?.roomId||params.get("room")||"")}
  function authorId(){return String(state?.profile?.id||"")}

  function readVault(){try{return JSON.parse(localStorage.getItem(VAULT_KEY)||"{}")||{}}catch{return{}}}
  function isExplicitEmpty(room=roomId(),author=authorId()){
    return !!readVault()[`${room}::${author}`]?.explicitEmpty;
  }
  function clearExplicitEmpty(room=roomId(),author=authorId()){
    if(!room||!author)return;
    try{
      const vault=readVault(),key=`${room}::${author}`;
      if(vault[key]?.explicitEmpty){delete vault[key];localStorage.setItem(VAULT_KEY,JSON.stringify(vault))}
    }catch{}
  }

  function markExplicitEmpty(room,author){
    try{
      const vault=readVault();
      for(const key of Object.keys(vault))if(key.startsWith(`${room}::`))delete vault[key];
      vault[`${room}::${author}`]={personas:[],explicitEmpty:true,updatedAt:Date.now()};
      localStorage.setItem(VAULT_KEY,JSON.stringify(vault));
    }catch{}
    try{localStorage.setItem(`personas:${room}`,"[]")}catch{}
    if(boardId&&room)try{localStorage.removeItem(`jijinboardParticipantSync:${boardId}:${room}`)}catch{}
  }

  function clearCurrentMemory(room){
    if(room!==roomId()||!state?.profile)return;
    state.legacyPersonas=[];
    state.profile.personas=[];
    try{localStorage.setItem(`personas:${room}`,"[]")}catch{}
    try{renderPersonas()}catch{}
    try{fillPersonaSelect()}catch{}
  }

  async function deleteRemote(room,author,plName){
    if(!boardId)return;
    const response=await fetch(`/api/boards/${encodeURIComponent(boardId)}/logs/${encodeURIComponent(room)}/participants`,{
      method:"DELETE",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({authorId:author,plName,clearLegacy:true})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"共有PCデータを削除できませんでした");
  }

  const inheritedSave=typeof saveProfile==="function"?saveProfile:null;
  if(inheritedSave){
    saveProfile=function saveProfileRespectingReset(){
      const room=roomId(),author=authorId();
      if(room&&author&&isExplicitEmpty(room,author)&&(state.profile?.personas||[]).length){
        state.profile.personas=[];
      }
      return inheritedSave();
    };
  }

  async function resetAllPersonas(button){
    const room=roomId(),author=authorId(),plName=String(state?.profile?.plName||"").trim();
    if(!room||!author)return alert("この部屋の発言者情報を読み込めませんでした。");
    if(!confirm("この部屋で登録したPCをすべて削除しますか？\n\n見えていない古いPCデータもまとめて削除します。\n過去のCOMMENTS本文は残ります。"))return;
    button.disabled=true;
    const old=button.textContent;button.textContent="削除中…";
    try{
      await deleteRemote(room,author,plName);
      markExplicitEmpty(room,author);
      clearCurrentMemory(room);
      try{channel?.postMessage({type:"reset",roomId:room,authorId:author,plName})}catch{}
      try{saveProfile()}catch{}
      try{emitIntegratedProfile()}catch{}
      try{window.dispatchEvent(new CustomEvent("jijinboard-personas-reset",{detail:{roomId:room,authorId:author}}))}catch{}
      // A second pass removes any stale non-empty sync that was already in flight
      // from another settings/log iframe before the reset broadcast arrived.
      await new Promise(resolve=>setTimeout(resolve,400));
      await deleteRemote(room,author,plName);
      alert("この部屋のPCをすべて削除しました。");
    }catch(error){
      alert(error.message||"PCを削除できませんでした");
    }finally{
      button.disabled=false;button.textContent=old;
    }
  }

  channel?.addEventListener("message",event=>{
    const data=event.data||{};
    if(data.type!=="reset"||data.roomId!==roomId())return;
    markExplicitEmpty(data.roomId,authorId());
    clearCurrentMemory(data.roomId);
    try{saveProfile()}catch{}
    try{emitIntegratedProfile()}catch{}
  });

  // Explicitly starting a new PC or importing a transferred profile ends the tombstone.
  document.addEventListener("click",event=>{
    if(event.target.closest?.("#savePersonaBtn,#redeemTransferBtn"))clearExplicitEmpty();
  },true);

  function install(){
    const form=document.querySelector("#profileForm");if(!form||form.querySelector("#resetAllPersonasBtn"))return;
    const wrap=document.createElement("div");wrap.className="profile-reset-all-wrap";
    wrap.innerHTML='<button id="resetAllPersonasBtn" type="button" class="profile-reset-all">PCをすべて削除</button>';
    const transfer=form.querySelector(".profile-transfer");
    if(transfer)form.insertBefore(wrap,transfer);else form.append(wrap);
    wrap.querySelector("button").addEventListener("click",event=>resetAllPersonas(event.currentTarget));

    const style=document.createElement("style");
    style.textContent=`
      .profile-reset-all-wrap{display:flex;justify-content:flex-end;margin:1px 0 0;padding:0}
      .profile-reset-all{border:0;background:transparent;color:#c8525b;font-size:8px;line-height:1.2;padding:3px 1px;cursor:pointer}
      .profile-reset-all:hover{text-decoration:underline}
      .profile-reset-all:disabled{opacity:.5;cursor:default}
    `;
    document.head.append(style);
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install();
})();
