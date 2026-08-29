"use strict";

// The short comment drawn directly around a placed PC belongs to the PC itself,
// not to one template page. Keep it in a small character-wide store and overlay
// it onto the legacy per-template item state whenever MATRIX reads that state.
(() => {
  if (typeof appState !== "function" || typeof templateStates !== "function" || typeof mutate !== "function") return;

  const STORE = "magiaMatrix.displayComments.v1";
  const rawAppState = appState;
  const rawTemplateStates = templateStates;
  const rawMutate = mutate;

  const loadStore = () => {
    try { return JSON.parse(localStorage.getItem(STORE) || "{}") || {}; }
    catch { return {}; }
  };
  const saveStore = value => localStorage.setItem(STORE, JSON.stringify(value || {}));
  const textOf = local => String(local?.comment ?? "");
  const posOf = local => String(local?.commentPosition || "top");

  function seedStore() {
    const stored = loadStore();
    let changed = false;

    const seedItems = itemsState => {
      Object.entries(itemsState || {}).forEach(([id, local]) => {
        if (Object.prototype.hasOwnProperty.call(stored, id)) return;
        const comment = textOf(local);
        if (!comment.trim()) return;
        stored[id] = { comment, commentPosition: posOf(local) };
        changed = true;
      });
    };

    // Prefer what is visible on the current page first.
    seedItems(rawAppState()?.items);

    // Then recover existing comments from the most recently saved templates.
    const states = rawTemplateStates() || {};
    Object.values(states)
      .sort((a, b) => Number(b?.savedAt || 0) - Number(a?.savedAt || 0))
      .forEach(saved => seedItems(saved?.items));

    if (changed) saveStore(stored);
  }

  function applyStoredComments(itemsState) {
    const stored = loadStore();
    Object.entries(itemsState || {}).forEach(([id, local]) => {
      if (!local || !Object.prototype.hasOwnProperty.call(stored, id)) return;
      const annotation = stored[id] || {};
      // An explicitly saved blank is a tombstone: it prevents an old
      // template-specific comment from reappearing after the user deleted it.
      local.comment = String(annotation.comment ?? "");
      local.commentPosition = String(annotation.commentPosition || "top");
    });
    return itemsState;
  }

  seedStore();

  appState = function() {
    const state = rawAppState();
    state.items ||= {};
    applyStoredComments(state.items);
    return state;
  };

  templateStates = function() {
    const states = rawTemplateStates();
    Object.values(states || {}).forEach(saved => applyStoredComments(saved?.items));
    return states;
  };

  mutate = function(fn) {
    const before = appState();
    const beforeComments = new Map(
      Object.entries(before?.items || {}).map(([id, local]) => [id, {
        comment: textOf(local),
        commentPosition: posOf(local)
      }])
    );

    const result = rawMutate(fn);

    // Read the actually persisted result without re-applying the old shared
    // annotation first, so an intentional deletion can be detected correctly.
    const after = rawAppState();
    const stored = loadStore();
    let changed = false;

    Object.entries(after?.items || {}).forEach(([id, local]) => {
      const previous = beforeComments.get(id) || { comment: "", commentPosition: "top" };
      const next = { comment: textOf(local), commentPosition: posOf(local) };
      if (previous.comment === next.comment && previous.commentPosition === next.commentPosition) return;
      stored[id] = next;
      changed = true;
    });

    if (changed) saveStore(stored);
    return result;
  };

  // Re-render once with the character-wide annotations applied. This also
  // repairs a page that was restored from an older blank template snapshot.
  try {
    const state = appState();
    if (typeof saveState === "function") saveState(state);
    if (typeof saveCurrentTemplateState === "function") saveCurrentTemplateState(state);
    if (Array.isArray(items)) items.forEach(item => { if (state.items?.[item.id]) item.local = state.items[item.id]; });
    if (typeof renderPlaced === "function") renderPlaced();
  } catch (error) {
    console.warn("MATRIX display comment persistence init failed", error);
  }
})();
