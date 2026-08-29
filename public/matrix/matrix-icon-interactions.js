"use strict";
(() => {
  const TARGET_SEP = "@@matrix-template@@";
  let pageFilter = "";
  let listObserver = null;
  let observedList = null;

  const profile = () => window.matrixBoardContext?.profile?.() || null;
  const currentTemplate = () => typeof currentTemplateId === "function" ? String(currentTemplateId() || "") : "";
  const itemFor = id => (Array.isArray(window.items) ? window.items : (typeof items !== "undefined" ? items : [])).find(item => item?.id === id);

  function targetParts(value) {
    const raw = String(value || "");
    const at = raw.indexOf(TARGET_SEP);
    return at >= 0
      ? { templateId: raw.slice(0, at), itemId: raw.slice(at + TARGET_SEP.length) }
      : { templateId: "", itemId: raw };
  }

  function oldCommentBelongsToCurrentPage(itemId) {
    try {
      const state = typeof appState === "function" ? appState() : null;
      return !!state?.items?.[itemId]?.placed;
    } catch {
      return false;
    }
  }

  function belongsToPage(value, templateId) {
    const parts = targetParts(value);
    if (parts.templateId) return parts.templateId === templateId;
    // Legacy shared comments predate template ids. Treat them as belonging to
    // the current sheet only when their target icon is actually placed there.
    return oldCommentBelongsToCurrentPage(parts.itemId);
  }

  function setHeaderState(panel) {
    const head = panel?.querySelector(".matrix-comment-head");
    if (!head) return;
    head.style.cursor = pageFilter ? "pointer" : "";
    head.title = pageFilter ? "クリックで全コメント表示" : "";
  }

  function applyPageFilter() {
    const panel = document.querySelector("#matrixIconComments");
    const list = document.querySelector("#matrixIconCommentList");
    if (!panel || !list) return false;

    panel.hidden = false;
    setHeaderState(panel);

    const topThreads = [...list.children].filter(node => node.classList?.contains("matrix-comment-thread"));
    const allCards = [...list.querySelectorAll(".matrix-comment-card")];
    let visibleCount = 0;

    topThreads.forEach(thread => {
      const rootCard = thread.querySelector(":scope > .matrix-comment-card");
      const show = !pageFilter || belongsToPage(rootCard?.dataset.commentTarget || "", pageFilter);
      thread.hidden = !show;
      if (show) visibleCount += thread.querySelectorAll(".matrix-comment-card").length;
    });

    const baseEmpty = list.querySelector(":scope > .matrix-comment-empty:not(.matrix-comment-page-empty)");
    let pageEmpty = list.querySelector(":scope > .matrix-comment-page-empty");

    if (pageFilter && visibleCount === 0) {
      if (!pageEmpty) {
        pageEmpty = document.createElement("p");
        pageEmpty.className = "matrix-comment-empty matrix-comment-page-empty";
        pageEmpty.textContent = "このシートの感想はありません。";
        list.append(pageEmpty);
      }
      if (baseEmpty) baseEmpty.hidden = true;
    } else {
      pageEmpty?.remove();
      if (baseEmpty) baseEmpty.hidden = false;
    }

    const count = panel.querySelector("#matrixIconCommentCount");
    if (count) count.textContent = String(pageFilter ? visibleCount : allCards.length);
    return true;
  }

  function filterCurrentPage() {
    pageFilter = currentTemplate();
    applyPageFilter();
  }

  function showAllComments() {
    pageFilter = "";
    applyPageFilter();
  }

  function ensureListObserver() {
    const list = document.querySelector("#matrixIconCommentList");
    if (!list) return false;
    if (observedList === list && listObserver) return true;
    listObserver?.disconnect();
    observedList = list;
    listObserver = new MutationObserver(() => applyPageFilter());
    listObserver.observe(list, { childList: true, subtree: true });
    applyPageFilter();
    return true;
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

  // Left click = show only shared COMMENTS belonging to the current template.
  // It does not filter by which icon was clicked.
  document.addEventListener("click", event => {
    const placed = placedFromEvent(event);
    if (!placed || placed._draggedByPointer) return;
    stopPlacedAction(event);
    filterCurrentPage();
  }, true);

  // COMMENTS header = return to the room-wide list.
  document.addEventListener("click", event => {
    if (!(event.target instanceof Element)) return;
    const head = event.target.closest(".matrix-comment-head");
    if (!head || !pageFilter) return;
    if (event.target.closest("button")) return;
    showAllComments();
  });

  // Double-click no longer opens the old editor; right-click owns editing.
  document.addEventListener("dblclick", event => {
    const placed = placedFromEvent(event);
    if (!placed) return;
    stopPlacedAction(event);
  }, true);

  // Right click:
  // - own icon: edit the original comment displayed around that icon
  // - another person's icon: open the shared COMMENTS composer
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

    if (typeof window.openMatrixIconComment === "function") window.openMatrixIconComment(id);
  }, true);

  // Any template change restores the room-wide COMMENTS list.
  document.addEventListener("click", event => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest("#templatesPage .template-tab")) setTimeout(showAllComments, 0);
  });

  if (typeof window.switchTemplate === "function") {
    const baseSwitchTemplate = window.switchTemplate;
    window.switchTemplate = async function(...args) {
      const result = await baseSwitchTemplate.apply(this, args);
      showAllComments();
      return result;
    };
  }

  window.filterMatrixCommentsToCurrentPage = filterCurrentPage;
  window.showAllMatrixComments = showAllComments;
  window.addEventListener("matrix-board-room", showAllComments);
  window.addEventListener("matrix-board-active", () => { ensureListObserver(); applyPageFilter(); });

  let tries = 0;
  const waitForComments = setInterval(() => {
    tries += 1;
    if (ensureListObserver() || tries > 30) clearInterval(waitForComments);
  }, 120);
})();
