"use strict";

// The short comment drawn around a placed PC belongs to the combination of
// template page + PC. Placement may change, but a different template must not
// inherit the same comment just because it uses the same PC.
(() => {
  if (typeof appState !== "function" || typeof templateStates !== "function" || typeof mutate !== "function") return;

  const STORE = "magiaMatrix.displayComments.v2";
  const LEGACY_STORE = "magiaMatrix.displayComments.v1";
  const rawAppState = appState;
  const rawTemplateStates = templateStates;
  const rawMutate = mutate;

  const clone = value => {
    try { return structuredClone(value); }
    catch { try { return JSON.parse(JSON.stringify(value)); } catch { return value; } }
  };
  const loadJSONSafe = (key, fallback = {}) => {
    try { return JSON.parse(localStorage.getItem(key) || "") || fallback; }
    catch { return fallback; }
  };
  const loadStore = () => loadJSONSafe(STORE, {});
  const saveStore = value => localStorage.setItem(STORE, JSON.stringify(value || {}));
  const textOf = local => String(local?.comment ?? "");
  const posOf = local => String(local?.commentPosition || "top");
  const currentTid = () => typeof currentTemplateId === "function" ? String(currentTemplateId() || "") : "";
  const annotationOf = local => ({ comment: textOf(local), commentPosition: posOf(local) });

  function sameAnnotation(a, b) {
    return String(a?.comment ?? "") === String(b?.comment ?? "") &&
      String(a?.commentPosition || "top") === String(b?.commentPosition || "top");
  }

  function ensurePage(store, tid) {
    if (!tid) return null;
    if (!store[tid] || typeof store[tid] !== "object") store[tid] = {};
    return store[tid];
  }

  function migrateOnce() {
    if (localStorage.getItem(STORE)) return;

    const store = {};
    const states = rawTemplateStates() || {};
    const legacy = loadJSONSafe(LEGACY_STORE, {});
    const current = currentTid();

    // Start from the real per-template snapshots. The old v1 helper only
    // overlaid comments while reading, so rawTemplateStates is the closest
    // source of truth for what each page originally contained.
    Object.entries(states).forEach(([tid, saved]) => {
      const page = ensurePage(store, tid);
      Object.entries(saved?.items || {}).forEach(([id, local]) => {
        const raw = annotationOf(local);
        const oldGlobal = legacy[id];

        // If an old global annotation was copied into several pages, keep it on
        // the currently open page but do not automatically make every other
        // template inherit it. Unique page-specific text is preserved.
        const looksLikeLegacyCopy = tid !== current && oldGlobal && sameAnnotation(raw, oldGlobal);
        if (looksLikeLegacyCopy) return;

        if (raw.comment.trim() || raw.commentPosition !== "top") page[id] = raw;
      });
    });

    // The visible page is authoritative during migration. If v1 is the only
    // place where its comment still exists, keep that text on this page only.
    if (current) {
      const page = ensurePage(store, current);
      const live = rawAppState()?.items || {};
      const ids = new Set([...Object.keys(live), ...Object.keys(legacy)]);
      ids.forEach(id => {
        const local = live[id];
        const liveAnnotation = local ? annotationOf(local) : null;
        if (liveAnnotation && (liveAnnotation.comment.trim() || liveAnnotation.commentPosition !== "top")) {
          page[id] = liveAnnotation;
        } else if (!Object.prototype.hasOwnProperty.call(page, id) && legacy[id]) {
          page[id] = {
            comment: String(legacy[id]?.comment ?? ""),
            commentPosition: String(legacy[id]?.commentPosition || "top")
          };
        }
      });
    }

    saveStore(store);
    // v1 is deliberately no longer read after migration.
  }

  function annotationFor(tid, id) {
    if (!tid || !id) return null;
    const page = loadStore()?.[tid];
    if (!page || !Object.prototype.hasOwnProperty.call(page, id)) return null;
    return page[id] || { comment: "", commentPosition: "top" };
  }

  function applyPageComments(itemsState, tid) {
    const page = loadStore()?.[tid] || {};
    Object.entries(itemsState || {}).forEach(([id, local]) => {
      if (!local) return;
      if (Object.prototype.hasOwnProperty.call(page, id)) {
        const annotation = page[id] || {};
        local.comment = String(annotation.comment ?? "");
        local.commentPosition = String(annotation.commentPosition || "top");
      }
    });
    return itemsState;
  }

  function persistChangedComments(tid, beforeItems, afterItems) {
    if (!tid) return;
    const store = loadStore();
    const page = ensurePage(store, tid);
    let changed = false;
    const ids = new Set([...Object.keys(beforeItems || {}), ...Object.keys(afterItems || {})]);

    ids.forEach(id => {
      const before = annotationOf(beforeItems?.[id]);
      const after = annotationOf(afterItems?.[id]);
      if (sameAnnotation(before, after)) return;

      // Blank is saved explicitly as a tombstone so an older template snapshot
      // cannot resurrect a comment the user intentionally removed.
      page[id] = after;
      changed = true;
    });

    if (changed) saveStore(store);
  }

  migrateOnce();

  appState = function() {
    const state = rawAppState();
    state.items ||= {};
    applyPageComments(state.items, currentTid());
    return state;
  };

  templateStates = function() {
    const states = rawTemplateStates();
    Object.entries(states || {}).forEach(([tid, saved]) => applyPageComments(saved?.items, tid));
    return states;
  };

  mutate = function(fn) {
    const tid = currentTid();
    const beforeRaw = clone(rawAppState()?.items || {});
    applyPageComments(beforeRaw, tid);

    const result = rawMutate(fn);

    // Read the raw persisted result before applying the page overlay again so
    // an intentional edit/deletion is detectable.
    const afterRaw = clone(rawAppState()?.items || {});
    persistChangedComments(tid, beforeRaw, afterRaw);
    return result;
  };

  // Template switching replaces appState.items with that page's saved items.
  // Re-apply only that template's own icon comments after every switch.
  if (typeof switchTemplate === "function" && !switchTemplate.__matrixDisplayCommentV2) {
    const rawSwitchTemplate = switchTemplate;
    const wrapped = async function(...args) {
      const result = await rawSwitchTemplate.apply(this, args);
      const tid = currentTid();
      const state = rawAppState();
      state.items ||= {};
      applyPageComments(state.items, tid);
      if (typeof saveState === "function") saveState(state);
      if (Array.isArray(items)) items.forEach(item => { if (state.items?.[item.id]) item.local = state.items[item.id]; });
      if (typeof renderPlaced === "function") renderPlaced();
      return result;
    };
    wrapped.__matrixDisplayCommentV2 = true;
    switchTemplate = wrapped;
  }

  // Repair only the current page on startup. Do not copy its annotation into
  // the other template snapshots.
  try {
    const tid = currentTid();
    const state = rawAppState();
    state.items ||= {};
    applyPageComments(state.items, tid);
    if (typeof saveState === "function") saveState(state);
    if (typeof saveCurrentTemplateState === "function") saveCurrentTemplateState(state);
    if (Array.isArray(items)) items.forEach(item => { if (state.items?.[item.id]) item.local = state.items[item.id]; });
    if (typeof renderPlaced === "function") renderPlaced();
  } catch (error) {
    console.warn("MATRIX per-template display comment persistence init failed", error);
  }
})();
