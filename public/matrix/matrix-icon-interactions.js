"use strict";
(() => {
  const TARGET_SEP = "@@matrix-template@@";
  let reader = null;
  let readerState = null;
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

  function matchesTarget(value, itemId, templateId) {
    const parts = targetParts(value);
    if (parts.itemId !== itemId) return false;
    // Old comments have no stored template id, so they remain readable for the
    // matching icon. New comments are scoped to the page where they were made.
    return !parts.templateId || parts.templateId === templateId;
  }

  function ensureReader() {
    if (reader?.isConnected) return reader;
    reader = document.createElement("aside");
    reader.id = "matrixIconCommentReader";
    reader.hidden = true;
    reader.innerHTML = `
      <div class="matrix-icon-reader-head">
        <b>COMMENTS</b>
        <span class="matrix-icon-reader-count">0</span>
        <button type="button" class="matrix-icon-reader-close" aria-label="閉じる">×</button>
      </div>
      <div class="matrix-icon-reader-list"></div>`;
    reader.querySelector(".matrix-icon-reader-close").addEventListener("click", closeReader);
    document.body.append(reader);
    return reader;
  }

  function copyThreadForReader(thread) {
    const clone = thread.cloneNode(true);
    clone.hidden = false;
    clone.querySelectorAll("[hidden]").forEach(node => node.hidden = false);
    clone.querySelectorAll("button").forEach(button => button.remove());
    clone.querySelectorAll(".matrix-comment-card").forEach(card => {
      card.removeAttribute("data-comment-target");
      card.removeAttribute("id");
    });
    return clone;
  }

  function renderReader() {
    if (!readerState) return;
    const r = ensureReader();
    const source = document.querySelector("#matrixIconCommentList");
    const list = r.querySelector(".matrix-icon-reader-list");
    const count = r.querySelector(".matrix-icon-reader-count");
    if (!source || !list) return;

    const matches = [];
    [...source.children].forEach(thread => {
      if (!thread.classList?.contains("matrix-comment-thread")) return;
      const rootCard = thread.querySelector(":scope > .matrix-comment-card");
      if (!rootCard) return;
      if (matchesTarget(rootCard.dataset.commentTarget || "", readerState.itemId, readerState.templateId)) {
        matches.push(thread);
      }
    });

    list.replaceChildren();
    if (!matches.length) {
      const empty = document.createElement("p");
      empty.className = "matrix-comment-empty";
      empty.textContent = "このアイコンへの感想はありません。";
      list.append(empty);
      count.textContent = "0";
    } else {
      let cardCount = 0;
      matches.forEach(thread => {
        const clone = copyThreadForReader(thread);
        cardCount += clone.querySelectorAll(".matrix-comment-card").length;
        list.append(clone);
      });
      count.textContent = String(cardCount);
    }
  }

  function positionReader(anchor) {
    if (!reader || reader.hidden || !anchor?.isConnected) return;
    const rect = anchor.getBoundingClientRect();
    const gap = 8;
    const margin = 8;
    const width = Math.min(300, Math.max(220, window.innerWidth - margin * 2));
    reader.style.width = `${width}px`;
    reader.style.left = `${Math.max(margin, Math.min(window.innerWidth - width - margin, rect.right + gap))}px`;
    reader.style.top = `${margin}px`;

    const measuredHeight = Math.min(reader.scrollHeight || 220, Math.max(140, window.innerHeight - margin * 2));
    let left = rect.right + gap;
    if (left + width > window.innerWidth - margin) left = rect.left - width - gap;
    left = Math.max(margin, Math.min(window.innerWidth - width - margin, left));
    let top = rect.top + (rect.height / 2) - 46;
    top = Math.max(margin, Math.min(window.innerHeight - measuredHeight - margin, top));
    reader.style.left = `${Math.round(left)}px`;
    reader.style.top = `${Math.round(top)}px`;
  }

  function openReader(id, anchor) {
    const itemId = String(id || "");
    const templateId = currentTemplate();
    if (readerState?.itemId === itemId && readerState?.templateId === templateId && reader && !reader.hidden) {
      closeReader();
      return;
    }
    readerState = { itemId, templateId, anchor };
    const r = ensureReader();
    r.hidden = false;
    renderReader();
    positionReader(anchor);
    ensureListObserver();
  }

  function closeReader() {
    readerState = null;
    if (reader) reader.hidden = true;
  }

  function ensureListObserver() {
    const list = document.querySelector("#matrixIconCommentList");
    if (!list) return false;
    if (observedList === list && listObserver) return true;
    listObserver?.disconnect();
    observedList = list;
    listObserver = new MutationObserver(() => {
      if (readerState) {
        renderReader();
        positionReader(readerState.anchor);
      }
    });
    listObserver.observe(list, { childList: true, subtree: true });
    return true;
  }

  function placedFromEvent(event) {
    if (!(event.target instanceof Element)) return null;
    if (event.target.closest(".inline-comment-editor,#matrixIconCommentReader")) return null;
    return event.target.closest(".placed[data-id]");
  }

  function stopPlacedAction(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }

  // Left click = read this icon's shared comments in a small local reader.
  // The main COMMENTS rail is never filtered or modified.
  document.addEventListener("click", event => {
    const placed = placedFromEvent(event);
    if (!placed || placed._draggedByPointer) return;
    stopPlacedAction(event);
    openReader(placed.dataset.id || "", placed);
  }, true);

  // Double-click no longer owns comment editing; right-click does.
  document.addEventListener("dblclick", event => {
    const placed = placedFromEvent(event);
    if (!placed) return;
    stopPlacedAction(event);
  }, true);

  // Right click:
  // - own icon: edit the original on-icon comment/settings
  // - another person's icon: write a shared MATRIX comment
  document.addEventListener("contextmenu", event => {
    const placed = placedFromEvent(event);
    if (!placed) return;
    stopPlacedAction(event);
    closeReader();

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

  // Click outside the local reader closes only the reader. The main COMMENTS
  // rail remains untouched.
  document.addEventListener("pointerdown", event => {
    if (!readerState || !reader || reader.hidden) return;
    if (!(event.target instanceof Element)) return;
    if (event.target.closest("#matrixIconCommentReader,.placed[data-id]")) return;
    closeReader();
  });

  // Moving to another template/room invalidates the icon-page context.
  document.addEventListener("click", event => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest("#templatesPage .template-tab")) setTimeout(closeReader, 0);
  });
  window.addEventListener("matrix-board-room", closeReader);
  window.addEventListener("matrix-board-active", () => ensureListObserver());
  window.addEventListener("resize", () => readerState && positionReader(readerState.anchor));

  let tries = 0;
  const waitForComments = setInterval(() => {
    tries += 1;
    if (ensureListObserver() || tries > 30) clearInterval(waitForComments);
  }, 120);
})();
