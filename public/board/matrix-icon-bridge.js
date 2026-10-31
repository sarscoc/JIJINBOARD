"use strict";

// The room header brand is display-only. The owner TOP is private and must not
// be exposed as a navigation target from a shared room.
const ownerTopLink=document.getElementById("ownerTopLink");
if(ownerTopLink){
  ownerTopLink.removeAttribute("href");
  ownerTopLink.removeAttribute("target");
  ownerTopLink.tabIndex=-1;
  ownerTopLink.style.cursor="default";
}

// Keep an already-open MAGIA MATRIX iframe in sync when a PC's MATRIX icon is
// changed from the LOGCOMMENTS profile editor. This message is emitted only
// after the icon POST succeeds, so notify other clients exactly once here.
addEventListener("message", event => {
  if (event.origin !== location.origin || event.data?.type !== "jijinboard-matrix-icon-updated") return;
  const roomId = event.data.roomId || state.activeRoom;
  window.jijinboardNotifyRoomChange?.(roomId,"participants");
  api(`/api/boards/${encodeURIComponent(boardId)}`).then(board => {
    state.board = board;
    renderLogs();
    $("#matrixFrame")?.contentWindow?.postMessage({ type:"jijinboard-active-room", roomId }, location.origin);
  }).catch(() => {});
});
