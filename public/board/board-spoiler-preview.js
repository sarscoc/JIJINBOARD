"use strict";

// Load the selected spoiler log underneath the veil so the warning screen also
// doubles as useful loading time. If the warning is abandoned, restore the
// previously opened log so an unopened log can never be exposed accidentally.
(() => {
  const baseRequestOpen = requestOpen;
  const baseCloseSpoiler = closeSpoiler;

  state.spoilerPreview = null;
  state.spoilerConfirming = false;

  function logSrc(roomId) {
    return `/log/?room=${encodeURIComponent(roomId)}&embedded=1&board=${encodeURIComponent(boardId)}`;
  }

  function restorePreview() {
    const preview = state.spoilerPreview;
    if (!preview) return;
    const frame = $("#logFrame");
    setLogActive(frame, false);
    if (preview.previousRoom) {
      frame.dataset.room = preview.previousRoom;
      const src = preview.previousSrc || logSrc(preview.previousRoom);
      if (frame.getAttribute("src") !== src) frame.src = src;
      frame.classList.remove("hidden");
      $("#welcome").classList.add("hidden");
    } else if (preview.previousSrc) {
      delete frame.dataset.room;
      frame.src = preview.previousSrc;
    } else {
      delete frame.dataset.room;
      frame.removeAttribute("src");
      frame.classList.add("hidden");
      if (state.tool === "log") $("#welcome").classList.remove("hidden");
    }
    state.spoilerPreview = null;
  }

  closeSpoiler = function() {
    baseCloseSpoiler();
    if (!state.spoilerConfirming) restorePreview();
  };

  requestOpen = function(roomId) {
    const item = state.board?.logs?.find(log => log.roomId === roomId);
    if (!item || !item.spoiler || state.opened[roomId]) return baseRequestOpen(roomId);

    if (state.spoilerPreview && state.spoilerPreview.roomId !== roomId) closeSpoiler();

    const frame = $("#logFrame"), index = state.board.logs.indexOf(item);
    if (!state.spoilerPreview) {
      state.spoilerPreview = {
        roomId,
        previousRoom: state.activeRoom || "",
        previousSrc: frame.getAttribute("src") || ""
      };
    }

    state.pendingRoom = roomId;
    $("#spoilerLabel").textContent = `LOG ${String(index + 1).padStart(2, "0")}`;
    $("#spoilerTitle").textContent = item.scenarioTitle || item.title || "LOG";
    const people = $("#spoilerParticipants");
    people.textContent = item.scenarioParticipants ? `参加PC：${item.scenarioParticipants}` : "";
    people.classList.toggle("hidden", !item.scenarioParticipants);

    const src = logSrc(roomId);
    setLogActive(frame, false);
    if (frame.dataset.room !== roomId || frame.getAttribute("src") !== src) {
      frame.dataset.room = roomId;
      frame.src = src;
    }
    $("#welcome").classList.add("hidden");
    selectTool("log");
    setLogActive(frame, false);

    const dialog = $("#spoilerDialog");
    if (!dialog.open) dialog.show();
  };

  $("#confirmOpen").onclick = async () => {
    const room = state.pendingRoom, title = $("#spoilerTitle").textContent;
    state.spoilerConfirming = true;
    baseCloseSpoiler();
    state.spoilerConfirming = false;
    state.spoilerPreview = null;
    if (room) await openLog(room, title);
  };

  $("#logFrame").addEventListener("load", () => {
    if ($("#spoilerDialog").open && state.spoilerPreview?.roomId === $("#logFrame").dataset.room) {
      setLogActive($("#logFrame"), false);
    }
  });
})();
