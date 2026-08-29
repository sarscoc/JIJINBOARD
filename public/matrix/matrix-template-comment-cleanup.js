"use strict";

// Deleting a MATRIX template also deletes the shared COMMENTS whose target_id
// belongs to that template. Other templates and their comments are untouched.
(() => {
  const originalDelete = window.deleteSavedTemplate;
  if (typeof originalDelete !== "function" || originalDelete.__matrixTemplateCommentCleanup) return;

  const DISPLAY_COMMENT_STORE = "magiaMatrix.displayComments.v2";

  const removeLocalDisplayComments = templateId => {
    try {
      const store = JSON.parse(localStorage.getItem(DISPLAY_COMMENT_STORE) || "{}") || {};
      if (!Object.prototype.hasOwnProperty.call(store, templateId)) return;
      delete store[templateId];
      localStorage.setItem(DISPLAY_COMMENT_STORE, JSON.stringify(store));
    } catch {}
  };

  const templateStillExists = async templateId => {
    if (typeof window.tplGetRecord !== "function") return false;
    try { return !!(await window.tplGetRecord(templateId)); }
    catch { return false; }
  };

  const wrappedDelete = async function(templateId, ...rest) {
    const id = String(templateId || "");
    const result = await originalDelete.call(this, templateId, ...rest);
    if (!id) return result;

    // The original function asks for confirmation. If the user cancelled, the
    // IndexedDB template record still exists, so do not touch shared comments.
    if (await templateStillExists(id)) return result;

    removeLocalDisplayComments(id);

    const context = window.matrixBoardContext;
    const profile = context?.profile?.();
    if (!context?.boardId || !context?.roomId || !profile?.id || typeof context.api !== "function") {
      return result;
    }

    try {
      await context.api(
        `/api/boards/${encodeURIComponent(context.boardId)}/matrix/${encodeURIComponent(context.roomId)}/template-comments/${encodeURIComponent(id)}`,
        {
          method: "DELETE",
          body: JSON.stringify({ authorId: profile.id })
        }
      );

      // MATRIX icon comments already refresh on matrix-board-active. Re-use the
      // same path so the deleted template's comments disappear immediately.
      window.dispatchEvent(new CustomEvent("matrix-board-active"));
    } catch (error) {
      console.warn("MATRIX template comments cleanup failed", error);
      alert("テンプレは削除しましたが、右のCOMMENTSの削除に失敗しました。もう一度読み込み後にお試しください。");
    }

    return result;
  };

  wrappedDelete.__matrixTemplateCommentCleanup = true;
  window.deleteSavedTemplate = wrappedDelete;
})();
