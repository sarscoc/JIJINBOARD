"use strict";

// Final safety rail for room-scoped PC data.
// A transient empty array is never allowed to overwrite durable personas locally
// or on the board server. Only an explicit last-PC deletion, recorded by
// profile-data-integrity.js, may persist an empty participant list.
(()=>{
  if(typeof state==="undefined"||typeof saveProfile!=="function")return;

  const params=new URL(location.href).searchParams;
  const boardId=params.get("board")||"";
  const VAULT_KEY="jijinboardPersonaVault.v1";
  const BACKUP_KEY="jijinboardPersonaLastGood.v1";
  const baseSaveProfile=saveProfile;
  const baseApi=typeof api==="function"?api:null;

  const valid=value=>Array.isArray(value)?value.filter(persona=>persona&&typeof persona==="object"):[];
  const named=value=>valid(value).filter(persona=>String(persona.name||persona.personaName||"").trim());
  const clone=value=>{try{return structuredClone(value)}catch{try{return JSON.parse(JSON.stringify(value))}catch{return value}}};
  const roomId=()=>String(state.roomId||params.get("room")||"");
  const authorId=()=>String(state.profile?.id||"");
  const slotKey=(room=roomId(),author=authorId())=>`${room}::${author}`;
  const participantSyncKey=room=>`jijinboardParticipantSync:${boardId}:${room}`;

  function readObject(key){try{const value=JSON.parse(localStorage.getItem(key)||"{}");return value&&typeof value==="object"?value:{}}catch{return{}}}
  function vaultEntry(room=roomId(),author=authorId()){if(!room||!author)return null;return readObject(VAULT_KEY)[slotKey(room,author)]||null}
  function explicitEmpty(room=roomId(),author=authorId()){return !!vaultEntry(room,author)?.explicitEmpty}

  function writeBackups(value){try{localStorage.setItem(BACKUP_KEY,JSON.stringify(value))}catch(error){console.warn("Persona last-good backup failed",error)}}
  function storeLastGood(room,personas,author=authorId()){
    const list=named(personas);if(!room||!author||!list.length)return false;
    const backups=readObject(BACKUP_KEY);
    backups[slotKey(room,author)]={personas:clone(list),updatedAt:Date.now()};
    writeBackups(backups);return true;
  }
  function clearLastGood(room,author=authorId()){
    if(!room||!author)return;
    const backups=readObject(BACKUP_KEY),key=slotKey(room,author);
    if(key in backups){delete backups[key];writeBackups(backups)}
  }

  function recoveryCandidate(room=roomId(),author=authorId()){
    if(!room||!author||explicitEmpty(room,author))return [];
    let list=[];
    try{list=named(JSON.parse(localStorage.getItem(`personas:${room}`)||"[]"));if(list.length)return list}catch{}
    const vault=vaultEntry(room,author);list=named(vault?.personas);if(list.length)return list;
    if(boardId){
      try{
        const signature=JSON.parse(localStorage.getItem(participantSyncKey(room))||"null");
        if(String(signature?.authorId||"")===author){list=named(signature?.personas);if(list.length)return list}
      }catch{}
    }
    list=named(readObject(BACKUP_KEY)[slotKey(room,author)]?.personas);if(list.length)return list;
    return [];
  }

  function restoreLastGood(room=roomId(),author=authorId()){
    if(!room||!author||explicitEmpty(room,author)||named(state.profile?.personas).length)return false;
    const list=recoveryCandidate(room,author);if(!list.length)return false;
    state.profile.personas=clone(list);
    try{localStorage.setItem(`personas:${room}`,JSON.stringify(state.profile.personas))}catch{}
    storeLastGood(room,state.profile.personas,author);
    try{renderPersonas?.()}catch{}
    try{fillPersonaSelect?.()}catch{}
    try{emitIntegratedProfile?.()}catch{}
    return true;
  }

  saveProfile=function saveProfileWithoutTransientEmpty(...args){
    const room=roomId(),author=authorId(),personas=named(state.profile?.personas);
    if(personas.length)storeLastGood(room,state.profile.personas,author);

    const suppressPersonaWrite=!!room&&!personas.length;
    const originalRoom=state.roomId;
    if(suppressPersonaWrite)state.roomId=null;
    let result;
    try{result=baseSaveProfile.apply(this,args)}
    finally{if(suppressPersonaWrite)state.roomId=originalRoom}

    if(suppressPersonaWrite){
      if(explicitEmpty(room,author))clearLastGood(room,author);
      else queueMicrotask(()=>restoreLastGood(room,author));
    }
    return result;
  };

  if(baseApi){
    api=async function guardedPersonaApi(path,options={}){
      const text=String(path||"");
      const match=text.match(/^\/api\/boards\/[^/]+\/logs\/([^/?]+)\/participants(?:\?|$)/);
      if(match&&String(options.method||"GET").toUpperCase()==="POST"){
        let payload=null;
        try{payload=typeof options.body==="string"?JSON.parse(options.body):options.body}catch{}
        if(payload&&Array.isArray(payload.personas)){
          const room=decodeURIComponent(match[1]),author=String(payload.authorId||authorId());
          let personas=named(payload.personas);
          if(!personas.length&&!explicitEmpty(room,author)){
            try{await window.jijinEnsurePersonas?.()}catch{}
            restoreLastGood(room,author);
            if(room===roomId()&&author===authorId())personas=named(state.profile?.personas);
            if(!personas.length){
              console.warn("Blocked transient empty participant sync",{room,author});
              return {guarded:true,personas:[]};
            }
            payload={...payload,personas:clone(personas)};
            options={...options,body:JSON.stringify(payload)};
          }
          if(personas.length)storeLastGood(room,personas,author);
          else if(explicitEmpty(room,author))clearLastGood(room,author);
        }
      }
      return baseApi(path,options);
    };
  }

  window.jijinPersonaEmptyIsExplicit=(room=roomId(),author=authorId())=>explicitEmpty(String(room||""),String(author||""));
  window.jijinRestorePersonas=()=>restoreLastGood();

  const initialRoom=roomId(),initialAuthor=authorId();
  if(named(state.profile?.personas).length)storeLastGood(initialRoom,state.profile.personas,initialAuthor);
  else if(initialRoom&&!explicitEmpty(initialRoom,initialAuthor)){
    Promise.resolve(window.jijinEnsurePersonas?.()).catch(()=>{}).finally(()=>restoreLastGood(initialRoom,initialAuthor));
  }
})();

// The durable PL/PC master is loaded after all legacy persona guards so room data
// becomes a reference/cache, never the source of truth.
(()=>{
  if(document.querySelector('script[data-jijin-player-master]'))return;
  const script=document.createElement('script');script.src='/shared/player-master.js?v=20260830-1';script.dataset.jijinPlayerMaster='1';document.body.append(script);
})();
