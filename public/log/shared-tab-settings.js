"use strict";

// Board-wide tab order/visibility. Local tab hiding remains in state.hiddenTabs
// and localStorage; shared-hidden tabs are removed from every tab list entirely.
(() => {
  let pending = null;
  let retryTimer = null;
  let lastSignature = "";

  function unique(values) {
    return [...new Set((values || []).map(value => String(value || "").trim()).filter(Boolean))];
  }

  function allRoomTabs(order) {
    const fromMessages = unique((state.room?.messages || []).map(message => message.tab));
    const current = unique(state.room?.tabs || []);
    return unique([...(order || []), ...current, ...fromMessages]);
  }

  function rebuildTabSelector() {
    const select = document.querySelector("#tabFilter");
    if (!select) return;
    const tabs = state.room?.tabs || [];
    const previous = state.mainTab || "";
    select.innerHTML = '<option value="">メインタブを選択</option>' + tabs.map(tab => `<option>${esc(tab)}</option>`).join("");
    if (previous && tabs.includes(previous)) state.mainTab = previous;
    else state.mainTab = tabs.find(tab => /^メイン$/i.test(tab)) || tabs[0] || "";
    select.value = state.mainTab;
  }

  function applyPending(attempt = 0) {
    clearTimeout(retryTimer);
    if (!pending) return;
    if (!state.room || state.roomId !== pending.roomId) {
      if (attempt < 40) retryTimer = setTimeout(() => applyPending(attempt + 1), 100);
      return;
    }

    const allTabs = allRoomTabs(pending.order);
    const hidden = new Set(unique(pending.hidden).filter(tab => allTabs.includes(tab)));
    const ordered = unique(pending.order).filter(tab => allTabs.includes(tab));
    allTabs.forEach(tab => { if (!ordered.includes(tab)) ordered.push(tab); });
    let visible = ordered.filter(tab => !hidden.has(tab));
    if (!visible.length && ordered.length) visible = [ordered[0]];

    const signature = JSON.stringify([pending.roomId, visible, [...hidden]]);
    if (signature === lastSignature && JSON.stringify(state.room.tabs || []) === JSON.stringify(visible)) return;
    lastSignature = signature;

    const currentTab = state.room.tabs?.[state.activeTabIndex] || "";
    state.room.tabs = visible;
    if (state.mainTab && hidden.has(state.mainTab)) state.mainTab = visible[0] || "";
    const nextIndex = currentTab ? visible.indexOf(currentTab) : -1;
    state.activeTabIndex = nextIndex >= 0 ? nextIndex : 0;
    rebuildTabSelector();

    const anchor = typeof currentReadingTime === "function" ? currentReadingTime() : "";
    if (typeof renderLog === "function") renderLog(anchor);
  }

  addEventListener("message", event => {
    if (event.origin !== location.origin) return;
    const message = event.data || {};
    if (message.type !== "jijinboard-shared-tabs" || !message.roomId) return;
    pending = {
      roomId: String(message.roomId),
      order: Array.isArray(message.order) ? message.order.map(String) : [],
      hidden: Array.isArray(message.hidden) ? message.hidden.map(String) : []
    };
    applyPending();
  });
})();
