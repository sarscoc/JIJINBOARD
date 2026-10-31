"use strict";

// Shared tab settings live on the board. The existing in-log hide action remains
// localStorage-only inside LOGCOMMENTS; these settings are the common layer.
(() => {
  state.sharedTabSettings = state.sharedTabSettings || {};
  let editTabs = [];
  let editHidden = new Set();
  let editTabsLoaded = false;
  let draggedIndex = -1;

  const endpoint = roomId => `/api/boards/${encodeURIComponent(boardId)}/log-tab-settings/${encodeURIComponent(roomId)}`;

  function ensureEditorUi() {
    if ($("#sharedTabSettings")) return;
    const participantLabel = $("#logScenarioParticipants")?.closest("label");
    if (!participantLabel) return;
    const section = document.createElement("section");
    section.id = "sharedTabSettings";
    section.className = "shared-tab-settings";
    section.innerHTML = `<div class="shared-tab-head"><strong>タブ設定</strong><small>ここでの非表示・順番は全員に共通</small></div><div id="sharedTabList" class="shared-tab-list"><p class="shared-tab-loading">タブを読み込み中…</p></div>`;
    participantLabel.after(section);
  }

  function renderSharedTabs() {
    ensureEditorUi();
    const list = $("#sharedTabList");
    if (!list) return;
    if (!editTabsLoaded) {
      list.innerHTML = '<p class="shared-tab-loading">タブを読み込み中…</p>';
      return;
    }
    if (!editTabs.length) {
      list.innerHTML = '<p class="shared-tab-loading">タブ情報がありません。</p>';
      return;
    }
    list.innerHTML = editTabs.map((tab, index) => {
      const visible = !editHidden.has(tab);
      return `<div class="shared-tab-row ${visible ? "" : "is-hidden"}" draggable="true" data-tab-row="${index}">
        <span class="shared-tab-grip" title="ドラッグして並び替え">⋮⋮</span>
        <strong>${esc(tab)}</strong>
        <div class="shared-tab-order">
          <button type="button" data-tab-move="${index}" data-dir="-1" aria-label="上へ" ${index===0?"disabled":""}>↑</button>
          <button type="button" data-tab-move="${index}" data-dir="1" aria-label="下へ" ${index===editTabs.length-1?"disabled":""}>↓</button>
        </div>
        <label class="shared-tab-visible"><input type="checkbox" data-tab-visible="${index}" ${visible?"checked":""}><span>表示</span></label>
      </div>`;
    }).join("");

    list.querySelectorAll("[data-tab-move]").forEach(button => button.onclick = () => {
      const from = Number(button.dataset.tabMove), to = from + Number(button.dataset.dir);
      if (to < 0 || to >= editTabs.length) return;
      [editTabs[from], editTabs[to]] = [editTabs[to], editTabs[from]];
      renderSharedTabs();
    });
    list.querySelectorAll("[data-tab-visible]").forEach(input => input.onchange = () => {
      const tab = editTabs[Number(input.dataset.tabVisible)];
      if (!input.checked) {
        const visibleCount = editTabs.filter(name => !editHidden.has(name)).length;
        if (visibleCount <= 1) {
          input.checked = true;
          alert("少なくとも1つのタブを表示してください。");
          return;
        }
        editHidden.add(tab);
      } else editHidden.delete(tab);
      renderSharedTabs();
    });
    list.querySelectorAll("[data-tab-row]").forEach(row => {
      row.addEventListener("dragstart", event => {
        draggedIndex = Number(row.dataset.tabRow);
        row.classList.add("dragging");
        event.dataTransfer.effectAllowed = "move";
      });
      row.addEventListener("dragend", () => { draggedIndex = -1; row.classList.remove("dragging"); });
      row.addEventListener("dragover", event => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; });
      row.addEventListener("drop", event => {
        event.preventDefault();
        const to = Number(row.dataset.tabRow);
        if (draggedIndex < 0 || draggedIndex === to) return;
        const [moved] = editTabs.splice(draggedIndex, 1);
        editTabs.splice(to, 0, moved);
        draggedIndex = -1;
        renderSharedTabs();
      });
    });
  }

  async function getSettings(roomId, fresh = false) {
    if (!fresh && state.sharedTabSettings[roomId]) return state.sharedTabSettings[roomId];
    const settings = await api(endpoint(roomId));
    state.sharedTabSettings[roomId] = settings;
    return settings;
  }

  function sendSettings(roomId, settings) {
    const frame = $("#logFrame");
    if (!frame?.contentWindow || frame.dataset.room !== roomId) return;
    frame.contentWindow.postMessage({
      type: "jijinboard-shared-tabs",
      roomId,
      order: settings?.order || [],
      hidden: settings?.hidden || []
    }, location.origin);
  }

  async function sendCurrentSettings(roomId, fresh = false) {
    try { sendSettings(roomId, await getSettings(roomId, fresh)); } catch {}
  }

  const baseOpenLog = openLog;
  openLog = async function(roomId, title = "") {
    const settingsPromise = getSettings(roomId).catch(() => null);
    const result = await baseOpenLog(roomId, title);
    const settings = await settingsPromise;
    if (settings) sendSettings(roomId, settings);
    return result;
  };

  openLogEdit = async function(roomId) {
    closeSpoiler();
    const item = state.board?.logs?.find(log => log.roomId === roomId);
    if (!item) return;
    state.editingRoom = roomId;
    $("#logSpoilerInput").checked = !!item.spoiler;
    $("#logScenarioTitle").value = item.scenarioTitle || item.title || "";
    $("#logScenarioParticipants").value = item.scenarioParticipants || "";
    ensureEditorUi();
    editTabs = [];
    editHidden = new Set();
    editTabsLoaded = false;
    renderSharedTabs();
    $("#logEditDialog").showModal();
    try {
      const settings = await getSettings(roomId, true);
      if (state.editingRoom !== roomId || !$("#logEditDialog").open) return;
      editTabs = [...(settings.order?.length ? settings.order : settings.sourceTabs || [])];
      editHidden = new Set(settings.hidden || []);
      editTabsLoaded = true;
      renderSharedTabs();
    } catch (error) {
      const list = $("#sharedTabList");
      if (list) list.innerHTML = `<p class="shared-tab-loading error">${esc(error.message)}</p>`;
    }
  };

  async function saveEditor(event) {
    event.preventDefault();
    const roomId = state.editingRoom;
    if (!roomId) return;
    const item = state.board?.logs?.find(log => log.roomId === roomId);
    const spoiler = $("#logSpoilerInput").checked;
    const hidden = editTabs.filter(tab => editHidden.has(tab));
    if (editTabsLoaded && editTabs.length && hidden.length >= editTabs.length) return alert("少なくとも1つのタブを表示してください。");
    try {
      let shared = state.sharedTabSettings[roomId] || null;
      if (editTabsLoaded) {
        shared = await api(endpoint(roomId), {
          method: "PATCH",
          headers: { "x-board-admin-token": adminToken() },
          body: JSON.stringify({ order: editTabs, hidden })
        });
      }
      await api(`/api/boards/${encodeURIComponent(boardId)}/logs/${encodeURIComponent(roomId)}`, {
        method: "PATCH",
        headers: { "x-board-admin-token": adminToken() },
        body: JSON.stringify({
          spoiler,
          scenarioTitle: $("#logScenarioTitle").value,
          scenarioParticipants: $("#logScenarioParticipants").value
        })
      });
      if (shared) state.sharedTabSettings[roomId] = shared;
      state.board = await api(`/api/boards/${encodeURIComponent(boardId)}`);
      if (spoiler && !item?.spoiler) { delete state.opened[roomId]; saveOpened(); }
      renderLogs();
      $("#logEditDialog").close();
      if (shared) sendSettings(roomId, shared);
      if (spoiler && !item?.spoiler && state.activeRoom === roomId) requestOpen(roomId);
    } catch (error) { alert(error.message); }
  }

  ensureEditorUi();
  $("#logEditForm").onsubmit = saveEditor;
  $("#logFrame").addEventListener("load", () => {
    const roomId = $("#logFrame").dataset.room;
    if (roomId) sendCurrentSettings(roomId);
  });
  addEventListener("message", event => {
    if (event.origin !== location.origin) return;
    const message = event.data || {};
    if (message.type === "jijinboard-refresh-shared-tabs" && message.roomId) sendCurrentSettings(String(message.roomId), true);
  });
})();
