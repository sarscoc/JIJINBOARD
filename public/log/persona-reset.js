"use strict";
(()=>{
  const params=new URL(location.href).searchParams;
  const boardId=params.get("board")||"";
  const VAULT_KEY="jijinboardPersonaVault.v1";

  function roomId(){return String(state?.roomId||params.get("room")||"")}
  function authorId(){return String(state?.profile?.id||"")}

  function markExplicitEmpty(room,author){
    try{
      const vault=JSON.parse(localStorage.getItem(VAULT_KEY)||"{}")||{};
      for(const key of Object.keys(vault))if(key.startsWith(`${room}::`))delete vault[key];
      vault[`${room}::${author}`]={personas:[],explicitEmpty:true,updatedAt:Date.now()};
      localStorage.setItem(VAULT_KEY,JSON.stringify(vault));
    }catch{}
    try{localStorage.setItem(`personas:${room}`,"[]")}catch{}
    if(boardId&&room)try{localStorage.removeItem(`jijinboardParticipantSync:${boardId}:${room}`)}catch{}
  }

  async function resetAllPersonas(button){
    const room=roomId(),author=authorId(),plName=String(state?.profile?.plName||"").trim();
    if(!room||!author)return alert("この部屋の発言者情報を読み込めませんでした。");
    if(!confirm("この部屋で登録したPCをすべて削除しますか？\n\n見えていない古いPCデータもまとめて削除します。\n過去のCOMMENTS本文は残ります。"))return;
    button.disabled=true;
    const old=button.textContent;button.textContent="削除中…";
    try{
      if(boardId){
        const response=await fetch(`/api/boards/${encodeURIComponent(boardId)}/logs/${encodeURIComponent(room)}/participants`,{
          method:"DELETE",
          headers:{"content-type":"application/json"},
          body:JSON.stringify({authorId:author,plName,clearLegacy:true})
        });
        const data=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(data.error||"共有PCデータを削除できませんでした");
      }
      markExplicitEmpty(room,author);
      state.legacyPersonas=[];
      state.profile.personas=[];
      try{saveProfile()}catch{}
      try{renderPersonas()}catch{}
      try{fillPersonaSelect()}catch{}
      try{emitIntegratedProfile()}catch{}
      try{window.dispatchEvent(new CustomEvent("jijinboard-personas-reset",{detail:{roomId:room,authorId:author}}))}catch{}
      alert("この部屋のPCをすべて削除しました。");
    }catch(error){
      alert(error.message||"PCを削除できませんでした");
    }finally{
      button.disabled=false;button.textContent=old;
    }
  }

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
