"use strict";

// Import TRPG LOG MARKER's JSON log files through the same upload flow as HTML.
// Accept both historical `.trpglog` and the friendlier `.trpg.log` spelling.
(() => {
  const baseHandleFile = handleFile;

  function isTrpgLogFile(file) {
    const name = String(file?.name || "").toLowerCase();
    return name.endsWith(".trpglog") || name.endsWith(".trpg.log");
  }

  function unique(values) {
    return [...new Set((values || []).map(value => String(value || "").trim()).filter(Boolean))];
  }

  function normalizeArchive(data, filename) {
    const room = data?.format === "trpg-log-marker" ? data.room : (data?.room || data);
    if (!room || !Array.isArray(room.messages) || !room.messages.length) {
      throw new Error("TRPGログの発言データが見つかりませんでした");
    }

    const messages = room.messages.map((message, index) => ({
      id: String(message?.id || `m${index}`),
      speaker: String(message?.speaker || ""),
      text: String(message?.text || ""),
      color: String(message?.color || ""),
      time: String(message?.time || ""),
      tab: String(message?.tab || "メイン"),
      diceroll: !!message?.diceroll,
      system: !!message?.system,
      ...(message?.sourceIndex != null ? { sourceIndex: Number(message.sourceIndex) } : {})
    }));

    const tabs = unique([
      ...(Array.isArray(room.tabs) ? room.tabs : []),
      ...messages.map(message => message.tab)
    ]);
    const fallbackTitle = String(filename || "TRPGログ")
      .replace(/\.trpg\.log$/i, "")
      .replace(/\.trpglog$/i, "")
      .trim();

    return {
      title: String(room.title || fallbackTitle || "TRPG LOG"),
      tabs: tabs.length ? tabs : ["メイン"],
      messages
    };
  }

  handleFile = async function(file) {
    if (!isTrpgLogFile(file)) return baseHandleFile(file);

    $("#homeStatus").textContent = "TRPGログを読み取っています…";
    try {
      const data = JSON.parse(await file.text());
      state.parsed = normalizeArchive(data, file.name);
      $("#importTitle").textContent = state.parsed.title;
      $("#importCount").textContent = `${state.parsed.messages.length.toLocaleString()}件の発言 / ${state.parsed.tabs.length}タブ`;
      $("#importPreview").classList.remove("hidden");
      $("#homeStatus").textContent = "";
    } catch (error) {
      state.parsed = null;
      $("#importPreview").classList.add("hidden");
      $("#homeStatus").textContent = error?.message || "TRPGログを読み込めませんでした";
    }
  };
})();
