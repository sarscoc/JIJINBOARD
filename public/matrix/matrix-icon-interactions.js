"use strict";
(() => {
  const TARGET_SEP = "@@matrix-template@@";
  let pageFilter = "";
  let listObserver = null;
  let observedList = null;

  const profile = () => window.matrixBoardContext?.profile?.() || null;
  const currentTemplate = () => typeof currentTemplateId === "function" ? String(currentTemplateId() || "") : "";
  const itemFor = id => (Array.isArray(window.items) ? window.items : (typeof items !== "undefined" ? items : [])).find(item => item?.id === id);
  const sharedCommentComposer = typeof window.openMatrixIconComment === "function" ? window.openMatrixIconComment : null;

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

  function keepInlineEditorVisible(placed) {
    if (!placed) return;
    const editor = placed.querySelector(".inline-comment-editor") || document.querySelector(".inline-comment-editor");
    if (!editor) return;
    const bounds = document.querySelector(".canvas")?.getBoundingClientRect() || document.querySelector(".stage")?.getBoundingClientRect();
    if (!bounds) return;

    placed.classList.add("comment-editing");
    placed.style.zIndex = "2147483000";
    editor.style.zIndex = "2147483640";
    editor.style.isolation = "isolate";
    editor.style.translate = "0 0";

    const rect = editor.getBoundingClientRect();
    const pad = 8;
    let dx = 0, dy = 0;
    if (rect.left < bounds.left + pad) dx += bounds.left + pad - rect.left;
    if (rect.right > bounds.right - pad) dx -= rect.right - (bounds.right - pad);
    if (rect.top < bounds.top + pad) dy += bounds.top + pad - rect.top;
    if (rect.bottom > bounds.bottom - pad) dy -= rect.bottom - (bounds.bottom - pad);
    editor.style.translate = `${Math.round(dx)}px ${Math.round(dy)}px`;
  }

  function raiseInlineEditorSoon(placed) {
    requestAnimationFrame(() => requestAnimationFrame(() => keepInlineEditorVisible(placed)));
  }

  window.openMatrixIconComment = () => filterCurrentPage();

  document.addEventListener("click", event => {
    const placed = placedFromEvent(event);
    if (!placed || placed._draggedByPointer) return;
    stopPlacedAction(event);
    filterCurrentPage();
  }, true);

  document.addEventListener("click", event => {
    if (!(event.target instanceof Element)) return;
    const head = event.target.closest(".matrix-comment-head");
    if (!head || !pageFilter) return;
    if (event.target.closest("button")) return;
    showAllComments();
  });

  document.addEventListener("dblclick", event => {
    const placed = placedFromEvent(event);
    if (!placed) return;
    stopPlacedAction(event);
  }, true);

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
      raiseInlineEditorSoon(placed);
      return;
    }

    if (sharedCommentComposer) sharedCommentComposer(id);
  }, true);

  const editorObserver = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        const editor = node.matches?.(".inline-comment-editor") ? node : node.querySelector?.(".inline-comment-editor");
        if (!editor) continue;
        raiseInlineEditorSoon(editor.closest(".placed") || document.querySelector(".placed.comment-editing"));
      }
    }
  });
  editorObserver.observe(document.documentElement, { childList: true, subtree: true });

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

  // Template-list previews are separate DOM from the live MATRIX canvas. They
  // used to keep the pre-PC snapshot until a template click called renderTemplateTabs().
  // Refresh the list whenever placed icons are actually painted, so thumbnails
  // receive PC images without requiring any click.
  let previewTimer = 0;
  let previewBusy = false;
  function refreshTemplatePreviews(delay = 0) {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(async () => {
      if (previewBusy || typeof window.renderTemplateTabs !== "function") return;
      previewBusy = true;
      try { await window.renderTemplateTabs(); }
      catch (error) { console.warn("Template preview refresh failed", error); }
      finally { previewBusy = false; }
    }, delay);
  }

  const canvas = document.querySelector(".canvas");
  if (canvas) {
    const previewObserver = new MutationObserver(records => {
      const changed = records.some(record => [...record.addedNodes, ...record.removedNodes].some(node =>
        node instanceof Element && (node.matches?.(".placed,.placed img") || node.querySelector?.(".placed,.placed img"))
      ));
      if (changed) refreshTemplatePreviews(20);
    });
    previewObserver.observe(canvas, { childList: true, subtree: true });
  }

  window.addEventListener("matrix-board-active", () => {
    ensureListObserver();
    applyPageFilter();
    refreshTemplatePreviews(40);
    setTimeout(() => refreshTemplatePreviews(0), 250);
  });
  window.addEventListener("matrix-board-participants-changed", () => refreshTemplatePreviews(120));
  window.addEventListener("jijinboard-player-master-updated", () => refreshTemplatePreviews(120));

  window.filterMatrixCommentsToCurrentPage = filterCurrentPage;
  window.showAllMatrixComments = showAllComments;
  window.addEventListener("matrix-board-room", showAllComments);

  let tries = 0;
  const waitForComments = setInterval(() => {
    tries += 1;
    if (ensureListObserver() || tries > 30) clearInterval(waitForComments);
  }, 120);
})();
