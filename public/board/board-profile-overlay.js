"use strict";

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
// deletion is persisted directly by LOGCOMMENTS' participant editor, so the board's
// passive synchronization only needs to forward non-empty PC snapshots.
(()=>{
  if(typeof syncParticipants!=="function")return;
  const baseSyncParticipants=syncParticipants;
  syncParticipants=async function safeSyncParticipants(profile,roomId){
    const personas=Array.isArray(profile?.personas)?profile.personas.filter(persona=>persona?.type==="PC"&&String(persona?.name||"").trim()):[];
    if(!personas.length)return;
    return baseSyncParticipants(profile,roomId);
  };
})();
