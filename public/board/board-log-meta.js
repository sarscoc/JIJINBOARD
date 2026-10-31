"use strict";

// Keep the room's original log title as a fallback for older board entries, but
// present one canonical scenario title everywhere in the board shell.
// The white / black LOGCOMMENTS appearance is stored per log and can only be
// changed from owner-facing log settings (or while uploading a new log).
(() => {
  const displayModes=new Map();
  const endpoint=roomId=>`/api/boards/${encodeURIComponent(boardId)}/logs/${encodeURIComponent(roomId)}/display-mode`;

  // Keep a comfortable gap between the room title and the login/presence list.
  // The header stylesheet already contributes ~6px via flex gap, so 34px here
  // gives roughly 40px total without reserving a fixed title column.
  const presenceBar=$(".topbar>.presence-bar");
  if(presenceBar)presenceBar.style.marginLeft="34px";

  function ensureDisplayModeUi(){
    const form=$("#logEditForm");
    if(!form||form.querySelector("#logDisplayModeField"))return;
    const field=document.createElement("fieldset");
    field.id="logDisplayModeField";
    field.className="log-display-mode-field";
    field.innerHTML='<legend>ログ背景</legend><div class="log-display-mode-options"><label><input type="radio" name="logDisplayMode" value="light" checked><span>白</span></label><label><input type="radio" name="logDisplayMode" value="dark"><span>黒</span></label></div>';
    const actions=form.lastElementChild;
    form.insertBefore(field,actions||null);
    if(!document.getElementById("jijinLogDisplayModeStyle")){
      const style=document.createElement("style");
      style.id="jijinLogDisplayModeStyle";
      style.textContent=`
        .log-display-mode-field{margin:0;padding:0;border:0;display:grid;gap:5px}.log-display-mode-field legend{padding:0;color:#6d7480;font-size:9px;font-weight:700}.log-display-mode-options{display:grid;grid-template-columns:1fr 1fr;gap:6px}.log-display-mode-options label{display:flex;align-items:center;justify-content:center;gap:5px;min-height:31px;padding:0 9px;border:1px solid #dfe3e8;border-radius:8px;background:#fff;color:rgb(75,75,75);font-size:10px;font-weight:700;cursor:pointer}.log-display-mode-options input{margin:0;accent-color:#596168}
      `;
      document.head.append(style);
    }
  }
  function setEditMode(mode){
    ensureDisplayModeUi();
    const input=$("#logEditForm")?.querySelector(`input[name="logDisplayMode"][value="${mode==="dark"?"dark":"light"}"]`);
    if(input)input.checked=true;
  }
  function selectedEditMode(){return $("#logEditForm")?.querySelector('input[name="logDisplayMode"]:checked')?.value==="dark"?"dark":"light"}
  async function loadDisplayMode(roomId,refresh=false){
    if(!refresh&&displayModes.has(roomId))return displayModes.get(roomId);
    try{
      const data=await api(endpoint(roomId));
      const mode=data.displayMode==="dark"?"dark":"light";
      displayModes.set(roomId,mode);
      return mode;
    }catch{return displayModes.get(roomId)||"light"}
  }
  function applyDisplayMode(mode){
    const frame=$("#logFrame"),bridge=logBridge?.();
    if(bridge?.setDisplayMode)bridge.setDisplayMode(mode);
    else frame?.contentWindow?.postMessage({type:"jijinboard-set-room-theme",displayMode:mode},location.origin);
  }
  async function saveDisplayMode(roomId,mode){
    mode=mode==="dark"?"dark":"light";
    displayModes.set(roomId,mode);
    try{
      const data=await api(endpoint(roomId),{method:"POST",headers:{"x-board-admin-token":adminToken()},body:JSON.stringify({displayMode:mode})});
      displayModes.set(roomId,data.displayMode==="dark"?"dark":"light");
    }catch(error){console.warn("Log display mode save failed",error)}
    if(state.activeRoom===roomId)applyDisplayMode(mode);
  }

  renderLogs = function() {
    const logs = state.board?.logs || [], owner = !!adminToken();
    $("#emptyLogs").hidden = logs.length > 0;
    $("#logList").innerHTML = logs.map(item => {
      const known = state.opened[item.roomId], active = item.roomId === state.activeRoom;
      const title = item.scenarioTitle || item.title || known || "ログ";
      return `<div class="log-entry"><button class="log-item ${item.spoiler&&!known?"unopened":""} ${active?"active":""}" data-room="${esc(item.roomId)}"><strong>${esc(title)}</strong></button>${owner?`<button class="log-edit" data-edit-log="${esc(item.roomId)}" title="ログの編集">✎</button>`:""}</div>`;
    }).join("");
    $("#logList").querySelectorAll("[data-room]").forEach(button => button.onclick = () => requestOpen(button.dataset.room));
    $("#logList").querySelectorAll("[data-edit-log]").forEach(button => button.onclick = event => { event.stopPropagation(); openLogEdit(button.dataset.editLog); });
  };

  openLogEdit = function(roomId) {
    closeSpoiler();
    const item = state.board?.logs?.find(log => log.roomId === roomId);
    if (!item) return;
    state.editingRoom = roomId;
    $("#logSpoilerInput").checked = !!item.spoiler;
    $("#logScenarioTitle").value = item.scenarioTitle || item.title || "";
    $("#logScenarioParticipants").value = item.scenarioParticipants || "";
    ensureDisplayModeUi();
    setEditMode(displayModes.get(roomId)||"light");
    $("#logEditDialog").showModal();
    loadDisplayMode(roomId,true).then(mode=>{if(state.editingRoom===roomId)setEditMode(mode)});
  };

  ensureDisplayModeUi();
  $("#logEditForm")?.addEventListener("submit",()=>{
    const roomId=state.editingRoom;if(!roomId)return;
    saveDisplayMode(roomId,selectedEditMode());
  });

  addEventListener("message",event=>{
    if(event.origin!==location.origin||event.data?.type!=="jijinboard-room-created")return;
    const roomId=event.data.roomId;if(!roomId)return;
    let mode="light";
    try{mode=$("#logFrame")?.contentDocument?.querySelector('input[name="jijinRoomDisplayMode"]:checked')?.value==="dark"?"dark":"light"}catch{}
    saveDisplayMode(roomId,mode);
  });

  $("#logFrame")?.addEventListener("load",()=>{
    const roomId=$("#logFrame")?.dataset.room;if(!roomId)return;
    loadDisplayMode(roomId).then(applyDisplayMode);
  });
})();
