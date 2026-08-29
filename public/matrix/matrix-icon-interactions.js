"use strict";
(() => {
  const TARGET_SEP = "@@matrix-template@@";
  let filter = null;
  let listObserver = null;
  let observedList = null;

  const profile = () => window.matrixBoardContext?.profile?.() || null;
  const currentTemplate = () => typeof currentTemplateId === "function" ? String(currentTemplateId() || "") : "";
  const itemFor = id => (Array.isArray(window.items) ? window.items : items || []).find(item => item?.id === id);

  function targetParts(value) {
    const raw = String(value || "");
    const at = raw.indexOf(TARGET_SEP);
    return at >= 0
      ? { templateId: raw.slice(0, at), itemId: raw.slice(at + TARGET_SEP.length) }
      : { templateId: "", itemId: raw };
  }

  function matchesFilter(value) {
    if (!filter) return true;
    const parts = targetParts(value);
    if (parts.itemId !== filter.itemId) return false;
    // Old MATRIX comments did not store a template id. Keep them visible for
    // the matching icon because their original page cannot be reconstructed.
    return !parts.templateId || parts.templateId === filter.templateId;
  }

  function bindHeaderReset(panel) {
    const head = panel?.querySelector(".matrix-comment-head");
    if (!head || head.dataset.matrixFilterResetReady) return;
    head.dataset.matrixFilterResetReady = "1";
    head.addEventListener("click", event => {
      if (event.target.closest("button")) return;
      if (!filter) return;
      filter = null;
      applyFilter();
    });
  }

  function applyFilter() {
    const panel = document.querySelector("#matrixIconComments");
    const list = document.querySelector("#matrixIconCommentList");
    if (!panel || !list) return false;

    bindHeaderReset(panel);
    panel.hidden = false;

    const head = panel.querySelector(".matrix-comment-head");
    if (head) {
      head.style.cursor = filter ? "pointer" : "";
      head.title = filter ? "クリックで全コメント表示" : "";
    }

    const topThreads = [...list.children].filter(node => node.classList?.contains("matrix-comment-thread"));
    const allCards = [...list.querySelectorAll(".matrix-comment-card")];
    let visibleCount = 0;

    topThreads.forEach(thread => {
      const rootCard = thread.querySelector(":scope > .matrix-comment-card");
      const show = !filter || matchesFilter(rootCard?.dataset.commentTarget || "");
      thread.hidden = !show;
      if (show) visibleCount += thread.querySelectorAll(".matrix-comment-card").length;
    });

    const baseEmpty = list.querySelector(":scope > .matrix-comment-empty:not(.matrix-comment-filter-empty)");
    let filterEmpty = list.querySelector(":scope > .matrix-comment-filter-empty");

    if (filter && allCards.length && visibleCount === 0) {
      if (!filterEmpty) {
        filterEmpty = document.createElement("p");
        filterEmpty.className = "matrix-comment-empty matrix-comment-filter-empty";
        filterEmpty.textContent = "このアイコンへの感想はありません。";
        list.append(filterEmpty);
      }
      if (baseEmpty) baseEmpty.hidden = true;
    } else {
      filterEmpty?.remove();
      if (baseEmpty) baseEmpty.hidden = false;
    }

    const count = panel.querySelector("#matrixIconCommentCount");
    if (count) count.textContent = String(filter ? visibleCount : allCards.length);
    return true;
  }

  function ensureListObserver() {
    const list = document.querySelector("#matrixIconCommentList");
    if (!list) return false;
    if (observedList === list && listObserver) {
      bindHeaderReset(document.querySelector("#matrixIconComments"));
      return true;
    }
    listObserver?.disconnect();
    observedList = list;
    listObserver = new MutationObserver(() => applyFilter());
    listObserver.observe(list, { childList: true, subtree: true });
    bindHeaderReset(document.querySelector("#matrixIconComments"));
    applyFilter();
    return true;
  }

  function filterForIcon(id) {
    filter = { itemId: String(id || ""), templateId: currentTemplate() };
    if (!ensureListObserver()) setTimeout(() => { ensureListObserver(); applyFilter(); }, 80);
    applyFilter();
  }

  function clearFilter() {
    if (!filter) return;
    filter = null;
    applyFilter();
  }

  function placedFromEvent(event) {
    if (!(event.target instanceof Element)) return null;
    if (event.target.closest(".inline-comment-editor")) return null;
    return event.target.closest(".placed[data-id]");
  }

  function stopPlacedAction(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }

  // Left click = filter the right COMMENTS rail to this icon on this template.
  document.addEventListener("click", event => {
    const placed = placedFromEvent(event);
    if (!placed || placed._draggedByPointer) return;
    stopPlacedAction(event);
    filterForIcon(placed.dataset.id || "");
  }, true);

  // The old double-click editor is intentionally retired; right-click owns
  // the editing/comment action now, while left-click is reserved for filtering.
  document.addEventListener("dblclick", event => {
    const placed = placedFromEvent(event);
    if (!placed) return;
    stopPlacedAction(event);
  }, true);

  // Right click:
  // - own icon: edit the original on-icon comment/settings
  // - another person's icon: open the shared MATRIX comment composer
  document.addEventListener("contextmenu", event => {
    const placed = placedFromEvent(event);
    if (!placed) return;
    stopPlacedAction(event);

    const id = placed.dataset.id || "";
    const item = itemFor(id);
    const myId = String(profile()?.id || "");
    const ownerId = String(item?.ownerId || "");
    const mine = !ownerId || ownerId === myId;

    if (mine) {
      if (typeof window.openDrawer === "function") window.openDrawer(id);
      else if (typeof window.openInlineCommentEditor === "function") window.openInlineCommentEditor(id, placed);
      return;
    }

    if (typeof window.openMatrixIconComment === "function") {
      window.openMatrixIconComment(id);
    }
  }, true);

  // Changing the template changes the page context, so do not carry a stale
  // page-specific filter into the newly selected template.
  document.addEventListener("click", event => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest("#templatesPage .template-tab")) setTimeout(clearFilter, 0);
  });

  window.filterMatrixIconComments = filterForIcon;
  window.clearMatrixIconCommentFilter = clearFilter;
  window.addEventListener("matrix-board-room", clearFilter);
  window.addEventListener("matrix-board-active", () => { ensureListObserver(); applyFilter(); });

  let tries = 0;
  const waitForComments = setInterval(() => {
    tries += 1;
    if (ensureListObserver() || tries > 30) clearInterval(waitForComments);
  }, 120);
})();
