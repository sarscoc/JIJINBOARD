"use strict";

// Keep the complete room data in memory, but only keep the visible vertical slice
// (plus a small overscan before/after it) in the DOM. This leaves comments,
// search, tab switching and exports working against the full data set.
(() => {
  const compactEstimate = message => {
    const length = String(message?.speaker || "").length + String(message?.text || "").length;
    return Math.max(30, 30 + Math.min(6, Math.floor(length / 72)) * 18);
  };
  const matchesSearch = (message, search) => !search || `${message.speaker} ${message.text}`.toLowerCase().includes(search);
  const streamIncomplete = () => !!state.room?.stream?.streamed && new Set((state.room.stream.loaded || []).map(Number)).size < Number(state.room.stream.chunkCount || 0);
  const messagesForTab = tab => {
    const indexed = state.__jijinMessagesByTab;
    if (indexed instanceof Map) return indexed.get(tab) || [];
    return state.room?.messages?.filter(message => message.tab === tab) || [];
  };
  const tabPending = (tab, search) => !search && streamIncomplete() && messagesForTab(tab).length === 0;
  const prefixFor = meta => {
    if (meta.prefix && meta.prefix.length === meta.heights.length + 1) return meta.prefix;
    const prefix = new Array(meta.heights.length + 1); prefix[0] = 0;
    for (let i = 0; i < meta.heights.length; i++) prefix[i + 1] = prefix[i] + meta.heights[i];
    meta.prefix = prefix;
    return prefix;
  };
  const indexAtOffset = (prefix, offset) => {
    let lo = 0, hi = Math.max(0, prefix.length - 2);
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (prefix[mid + 1] < offset) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const metaFor = panel => state.virtualPanels?.get(panel?.dataset.virtualKey || "");

  function compactRow(meta, index) {
    const m = meta.items[index];
    return `<div class="page-row" data-virtual-index="${index}" data-time="${esc(m.time)}"><time>${esc(m.time)}</time>${messageHtml(m, meta.grouped)}</div>`;
  }
  function timelineRow(meta, index) {
    const slot = meta.items[index], list = (slot.byTab.get(meta.tab) || []).filter(m => matchesSearch(m, meta.search));
    const previewCount = list.length ? 0 : Math.min(3, [...slot.byTab.entries()].filter(([otherTab]) => otherTab !== meta.tab).reduce((sum, [, messages]) => sum + messages.filter(m => matchesSearch(m, meta.search)).length, 0));
    const minHeight = list.length ? 24 : previewCount ? previewCount * 24 + 6 : 20;
    return `<div class="page-row timeline-slot ${list.length ? "has-message" : "empty-slot"}" data-virtual-index="${index}" data-slot-index="${index}" data-time="${esc(slot.time)}" style="min-height:${minHeight}px"><time>${esc(slot.time)}</time><div class="timeline-slot-content">${list.map(m => messageHtml(m, meta.grouped)).join("")}</div></div>`;
  }
  function rowHtml(meta, index) { return meta.mode === "timeline" ? timelineRow(meta, index) : compactRow(meta, index); }

  function updateSpacers(panel, meta) {
    const prefix = prefixFor(meta), top = panel.querySelector(".virtual-spacer-top"), bottom = panel.querySelector(".virtual-spacer-bottom");
    if (top) top.style.height = `${prefix[meta.start || 0] || 0}px`;
    if (bottom) bottom.style.height = `${Math.max(0, prefix.at(-1) - (prefix[meta.end || 0] || 0))}px`;
  }

  function measureWindow(panel, meta, start) {
    const scroll = panel.querySelector(".page-scroll"), rows = [...panel.querySelectorAll(".virtual-rows > .page-row")];
    if (!scroll || !rows.length) return;
    const oldPrefix = prefixFor(meta), oldTop = oldPrefix[start] || 0;
    let changed = false;
    rows.forEach((row, offset) => {
      const index = start + offset, height = Math.max(20, row.getBoundingClientRect().height || row.offsetHeight || meta.heights[index]);
      if (Math.abs(height - meta.heights[index]) > .5) { meta.heights[index] = height; changed = true; }
    });
    if (!changed) return;
    meta.prefix = null;
    const prefix = prefixFor(meta), newTop = prefix[start] || 0;
    if (start > 0 && Math.abs(newTop - oldTop) > .5) {
      meta.adjusting = true;
      scroll.scrollTop += newTop - oldTop;
      meta.adjusting = false;
    }
    updateSpacers(panel, meta);
  }

  function renderWindow(panel, focusIndex = null, force = false) {
    const meta = metaFor(panel), scroll = panel?.querySelector(".page-scroll"), rowsBox = panel?.querySelector(".virtual-rows");
    if (!meta || !scroll || !rowsBox || !meta.items.length) return;
    const prefix = prefixFor(meta), viewport = Math.max(320, scroll.clientHeight || 640);
    let topY = Math.max(0, scroll.scrollTop - viewport), bottomY = scroll.scrollTop + viewport * 2.5;
    if (focusIndex != null && Number.isFinite(focusIndex)) {
      const focusY = prefix[Math.max(0, Math.min(meta.items.length - 1, focusIndex))] || 0;
      topY = Math.max(0, Math.min(topY, focusY - viewport));
      bottomY = Math.max(bottomY, focusY + viewport * 1.5);
    }
    let start = indexAtOffset(prefix, topY), end = Math.min(meta.items.length, indexAtOffset(prefix, bottomY) + 2);
    if (end - start < 32) {
      const missing = 32 - (end - start), before = Math.min(start, Math.floor(missing / 2));
      start -= before; end = Math.min(meta.items.length, end + missing - before);
    }
    if (end - start > 160) {
      const center = focusIndex != null ? focusIndex : indexAtOffset(prefix, scroll.scrollTop + viewport / 2);
      start = Math.max(0, center - 65); end = Math.min(meta.items.length, start + 160); start = Math.max(0, end - 160);
    }
    if (!force && meta.start === start && meta.end === end && rowsBox.childElementCount) return;
    meta.start = start; meta.end = end;
    rowsBox.innerHTML = Array.from({ length: end - start }, (_, offset) => rowHtml(meta, start + offset)).join("");
    updateSpacers(panel, meta);
    requestAnimationFrame(() => measureWindow(panel, meta, start));
  }

  function scheduleWindow(panel) {
    const meta = metaFor(panel); if (!meta || meta.adjusting) return;
    cancelAnimationFrame(meta.frame);
    meta.frame = requestAnimationFrame(() => renderWindow(panel));
  }

  function mountPanel(panel) {
    const meta = metaFor(panel), scroll = panel?.querySelector(".page-scroll"); if (!meta || !scroll) return;
    if (!scroll.dataset.virtualMounted) {
      scroll.dataset.virtualMounted = "1";
      scroll.addEventListener("scroll", () => scheduleWindow(panel), { passive: true });
    }
    if (!panel.querySelector(".virtual-rows")?.childElementCount) renderWindow(panel, null, true);
  }

  function mountAllPanels() {
    document.querySelectorAll(".log-page[data-virtual-key]").forEach(mountPanel);
  }

  function mountCurrentPanel() {
    mountPanel(document.querySelector(`.log-page[data-track-index="${state.carouselPosition}"][data-virtual-key]`));
  }

  function revealIndex(panel, index, align = .28) {
    const meta = metaFor(panel), scroll = panel?.querySelector(".page-scroll"); if (!meta || !scroll || index < 0) return false;
    const prefix = prefixFor(meta), viewport = Math.max(320, scroll.clientHeight || 640);
    scroll.scrollTop = Math.max(0, (prefix[index] || 0) - viewport * align);
    renderWindow(panel, index, true);
    return true;
  }

  const originalPagePanelHtml = pagePanelHtml;
  const originalTimelinePagePanelHtml = timelinePagePanelHtml;
  const originalSyncPanelToTime = syncPanelToTime;
  const originalRenderLog = renderLog;
  const originalJumpToMessage = jumpToMessage;

  state.virtualPanels = new Map();
  state.virtualGeneration = 0;

  renderLog = function(anchorTime = "") {
    state.virtualGeneration += 1;
    state.virtualPanels.clear();
    const result = originalRenderLog(anchorTime);
    // First paint only needs the panel the user can actually see. Adjacent tabs
    // stay as spacer shells and are mounted when navigation reaches them.
    queueMicrotask(mountCurrentPanel);
    return result;
  };

  pagePanelHtml = function(tab, realIndex, trackIndex, grouped, search, clone = "") {
    if (state.archiveMode) return originalPagePanelHtml(tab, realIndex, trackIndex, grouped, search, clone);
    const source = messagesForTab(tab);
    const items = search ? source.filter(m => matchesSearch(m, search)) : source;
    const key = `${state.virtualGeneration}:compact:${trackIndex}`;
    state.virtualPanels.set(key, { mode: "compact", tab, grouped, search, items, heights: items.map(compactEstimate), prefix: null, start: 0, end: 0, frame: 0 });
    const body = items.length ? '<div class="virtual-spacer-top" aria-hidden="true"></div><div class="virtual-rows"></div><div class="virtual-spacer-bottom" aria-hidden="true"></div>' : tabPending(tab,search) ? '<p class="empty jijin-stream-pending">読み込み中…</p>' : '<p class="empty">このタブに表示できる発言がありません。</p>';
    return `<section class="log-page virtual-page" data-virtual-key="${key}" data-real-index="${realIndex}" data-track-index="${trackIndex}" data-clone="${clone}"><div class="page-scroll">${body}</div></section>`;
  };

  timelinePagePanelHtml = function(tab, realIndex, trackIndex, slots, grouped, search, clone = "") {
    if (state.archiveMode) return originalTimelinePagePanelHtml(tab, realIndex, trackIndex, slots, grouped, search, clone);
    const key = `${state.virtualGeneration}:timeline:${trackIndex}`;
    const heights = slots.map(slot => Math.max(20, Number(slot.height) || 30));
    state.virtualPanels.set(key, { mode: "timeline", tab, grouped, search, items: slots, heights, prefix: null, start: 0, end: 0, frame: 0 });
    return `<section class="log-page virtual-page" data-virtual-key="${key}" data-real-index="${realIndex}" data-track-index="${trackIndex}" data-clone="${clone}"><div class="page-scroll timeline-page"><div class="virtual-spacer-top" aria-hidden="true"></div><div class="virtual-rows"></div><div class="virtual-spacer-bottom" aria-hidden="true"></div></div></section>`;
  };

  syncPanelToTime = function(panel, time) {
    const meta = metaFor(panel);
    if (!meta) return originalSyncPanelToTime(panel, time);
    mountPanel(panel);
    if (!time) return;
    const slotMatch = String(time).match(/^@slot:(\d+)\|(.*)$/), fallbackTime = slotMatch ? decodeURIComponent(slotMatch[2] || "") : time;
    let index = slotMatch && meta.mode === "timeline" ? Number(slotMatch[1]) : meta.items.findIndex(item => String(item.time || "") === String(fallbackTime || ""));
    if (!Number.isFinite(index) || index < 0 || index >= meta.items.length) return;
    revealIndex(panel, index);
  };

  jumpToMessage = function(id, annotationId) {
    const indexed = state.__jijinMessageIndex?.get?.(id);
    const message = Number.isInteger(indexed) ? state.room?.messages?.[indexed] : state.room?.messages?.find(m => m.id === id);
    if (!message) return;
    const index = state.room.tabs.indexOf(message.tab);
    if (state.hiddenTabs.has(message.tab)) {
      state.hiddenTabs.delete(message.tab); localStorage.setItem(`hiddenTabs:${state.roomId}`, JSON.stringify([...state.hiddenTabs])); state.activeTabIndex = index; renderLog(message.time);
    } else if (index !== state.activeTabIndex) {
      if (state.viewMode === "timeline") goToTab(index); else { state.activeTabIndex = index; renderLog(message.time); }
    }
    const panel = document.querySelector(`.log-page[data-track-index="${state.carouselPosition}"]`), meta = metaFor(panel);
    if (meta) {
      const virtualIndex = meta.mode === "timeline" ? meta.items.findIndex(slot => (slot.byTab.get(message.tab) || []).some(m => m.id === id)) : meta.items.findIndex(m => m.id === id);
      if (virtualIndex >= 0) revealIndex(panel, virtualIndex);
    }
    const el = panel?.querySelector(`[data-message="${CSS.escape(id)}"]`); if (!el) return;
    const annotation = annotationId && state.annotations.find(item => item.id === annotationId), color = markerColor(annotation?.color || "#ffe66b");
    el.style.setProperty("--flash-color", color); el.querySelector(".annotation-count")?.style.setProperty("--flash-color", color); el.scrollIntoView({ behavior: "smooth", block: "center" }); el.classList.remove("flash"); requestAnimationFrame(() => el.classList.add("flash"));
    if (annotationId) setTimeout(() => { const mark = el.querySelector(`[data-ann="${CSS.escape(annotationId)}"]`); mark?.style.setProperty("--flash-color", color); mark?.classList.add("flash"); }, 400);
  };

  queueMicrotask(mountAllPanels);

  addEventListener("resize", () => document.querySelectorAll(".log-page[data-virtual-key]").forEach(panel => renderWindow(panel, null, true)), { passive: true });
  document.addEventListener("input", event => {
    if (event.target?.id !== "fontSize") return;
    state.virtualPanels.forEach(meta => { meta.heights = meta.items.map(item => meta.mode === "compact" ? compactEstimate(item) : Math.max(20, Number(item.height) || 30)); meta.prefix = null; });
    document.querySelectorAll(".log-page[data-virtual-key]").forEach(panel => renderWindow(panel, null, true));
  });
})();
