"use strict";

// Send a one-shot realtime event only after an actual room-scoped mutation.
// There is no idle connection here: the socket exists only long enough to carry
// the change signal, then closes immediately.
window.jijinboardNotifyRoomChange=function(roomId,action){
  const room=String(roomId||""),kind=String(action||"");
  if(!room||!kind)return;
  const protocol=location.protocol==="https:"?"wss:":"ws:";
  let socket;
  try{socket=new WebSocket(`${protocol}//${location.host}/api/rooms/${encodeURIComponent(room)}/realtime`)}catch{return}
  const close=()=>{try{if(socket.readyState<2)socket.close()}catch{}};
  socket.addEventListener("open",()=>{
    try{socket.send(JSON.stringify({type:"change",action:kind}))}catch{}
    setTimeout(close,0);
  },{once:true});
  socket.addEventListener("error",close,{once:true});
};

// The full profile editor lives in LOGCOMMENTS. When another board tool is active,
// temporarily surface that same editor above the current iframe instead of duplicating it.
(() => {
  const button = document.querySelector("#profileButton");
  const frame = document.querySelector("#logFrame");
  if (!button || !frame) return;

  let cleanup = null;

  function logTabActive() {
    return !!document.querySelector('[data-tool="log"].active');
  }

  function roomId() {
    return new URL(location.href).searchParams.get("room") || frame.dataset.room || "";
  }

  function boardId() {
    return new URL(location.href).searchParams.get("id") || "";
  }

  function clearOverlay() {
    if (cleanup) {
      cleanup();
      cleanup = null;
    }
  }

  function openInsideLoadedFrame() {
    let doc;
    try { doc = frame.contentDocument; } catch { return false; }
    const dialog = doc?.querySelector("#profileDialog");
    if (!doc?.head || !dialog) return false;

    if (logTabActive()) {
      frame.contentWindow?.postMessage({ type:"jijinboard-open-profile" }, location.origin);
      return true;
    }

    clearOverlay();
    frame.classList.remove("hidden");
    frame.classList.add("profile-overlay-frame");

    const style = doc.createElement("style");
    style.id = "jijinboard-profile-overlay-style";
    style.textContent = `
      html,body{background:transparent!important;overflow:hidden!important}
      body>*:not(#profileDialog){visibility:hidden!important;pointer-events:none!important}
      #profileDialog,#profileDialog *{visibility:visible!important;pointer-events:auto!important}
      #profileDialog::backdrop{background:rgba(15,19,26,.34)!important;backdrop-filter:blur(5px)!important;-webkit-backdrop-filter:blur(5px)!important}
    `;
    doc.head.append(style);

    let closed = false;
    const finish = () => {
      if (closed) return;
      closed = true;
      dialog.removeEventListener("close", finish);
      style.remove();
      frame.classList.remove("profile-overlay-frame");
      if (!logTabActive()) frame.classList.add("hidden");
      cleanup = null;
    };
    dialog.addEventListener("close", finish, { once:true });
    cleanup = finish;

    frame.contentWindow?.postMessage({ type:"jijinboard-open-profile" }, location.origin);
    requestAnimationFrame(() => {
      if (!dialog.open) setTimeout(() => { if (!dialog.open) finish(); }, 300);
    });
    return true;
  }

  function openProfileAnywhere() {
    clearOverlay();
    if (openInsideLoadedFrame()) return;

    const room = roomId();
    const board = boardId();
    if (!room || !board) {
      const setup = document.querySelector("#boardProfileDialog");
      if (setup && !setup.open) setup.showModal();
      return;
    }

    const onLoad = () => {
      frame.removeEventListener("load", onLoad);
      setTimeout(openInsideLoadedFrame, 0);
    };
    frame.addEventListener("load", onLoad);
    frame.dataset.room = room;
    frame.src = `/log/?room=${encodeURIComponent(room)}&embedded=1&board=${encodeURIComponent(board)}`;
  }

  button.onclick = event => {
    event.preventDefault();
    openProfileAnywhere();
  };

  document.querySelectorAll("[data-tool]").forEach(tab => tab.addEventListener("click", clearOverlay));
})();

// Automatic profile broadcasts happen during iframe startup and autosave. A transient
// empty persona list must never be interpreted as "delete every PC". Explicit PC
// deletion is persisted directly by LOGCOMMENTS. Also coalesce rapid profile broadcasts
// so typing a PC name does not cause one participant API write per keystroke.
(()=>{
  if(typeof syncParticipants!=="function")return;
  const baseSyncParticipants=syncParticipants;
  const pending=new Map();

  function settle(slot,error){
    const waiters=slot.waiters.splice(0);
    for(const waiter of waiters)error?waiter.reject(error):waiter.resolve();
  }

  syncParticipants=function safeSyncParticipants(profile,roomId){
    const room=String(roomId||"");
    const personas=Array.isArray(profile?.personas)?profile.personas.filter(persona=>persona?.type==="PC"&&String(persona?.name||"").trim()):[];
    let slot=pending.get(room);

    if(!personas.length){
      if(slot){clearTimeout(slot.timer);pending.delete(room);settle(slot)}
      return Promise.resolve();
    }

    if(!slot){slot={timer:0,profile:null,waiters:[]};pending.set(room,slot)}
    slot.profile=profile;
    clearTimeout(slot.timer);

    const promise=new Promise((resolve,reject)=>slot.waiters.push({resolve,reject}));
    slot.timer=setTimeout(async()=>{
      pending.delete(room);
      try{
        const key=typeof participantSyncKey==="function"?participantSyncKey(room):"";
        const before=key?localStorage.getItem(key):null;
        await baseSyncParticipants(slot.profile,room);
        const after=key?localStorage.getItem(key):null;
        if(after&&after!==before)window.jijinboardNotifyRoomChange?.(room,"participants");
        settle(slot);
      }catch(error){settle(slot,error)}
    },280);
    return promise;
  };
})();
