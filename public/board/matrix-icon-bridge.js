"use strict";

// Keep an already-open MAGIA MATRIX iframe in sync when a PC's MATRIX icon is
// changed from the LOGCOMMENTS profile editor.
addEventListener("message", event => {
  if (event.origin !== location.origin || event.data?.type !== "jijinboard-matrix-icon-updated") return;
  const roomId = event.data.roomId || state.activeRoom;
  api(`/api/boards/${encodeURIComponent(boardId)}`).then(board => {
    state.board = board;
    renderLogs();
    $("#matrixFrame")?.contentWindow?.postMessage({ type:"jijinboard-active-room", roomId }, location.origin);
  }).catch(() => {});
});
