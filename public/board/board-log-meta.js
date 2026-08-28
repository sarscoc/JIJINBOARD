"use strict";

// Keep the room's original log title as a fallback for older board entries, but
// present one canonical scenario title everywhere in the board shell.
(() => {
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
    $("#logEditDialog").showModal();
  };
})();
