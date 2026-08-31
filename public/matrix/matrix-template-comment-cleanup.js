"use strict";

// Load template persistence/sync once MATRIX is active. Keeping it here avoids
// another blocking script in the large MATRIX document.
if(!document.querySelector('script[data-matrix-template-sync]')){
  const script=document.createElement('script');
  script.src='matrix-template-sync.js';
  script.async=false;
  script.dataset.matrixTemplateSync='1';
  document.body.append(script);
}

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
