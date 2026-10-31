"use strict";

// Compatibility parser for non-Tekey HTML logs.
// Supported:
// 1) simple/legacy flat logs: <font color="#999"><b>Speaker</b>：message</font><br>
// 2) CCFOLIA exports: <p><span>[main]</span><span>Speaker</span> : <span>message</span></p>
(() => {
  const parseTabbedTekey = parseTekey;

  function cleanSourceTitle(filename, documentTitle) {
    let raw = (filename || "").replace(/\.html?$/i, "").trim();
    if (!raw || /^ccfolia\s*-\s*logs?$/i.test(raw)) raw = (documentTitle || "ログ").trim();
    raw = raw
      .replace(/\[(?:all|全タブ)\]\s*$/i, "")
      .replace(/[_\-\s](メイン|雑談|秘話|情報|その他)$/i, "")
      .trim();
    return raw || "ログ";
  }

  function sourceNames(filename, documentTitle) {
    const raw = (documentTitle || filename || "ログ").replace(/\.html?$/i, "").trim();
    const match = raw.match(/^(.*?)[_\-\s](メイン|雑談|秘話|情報|その他)$/i);
    return {
      title: (match?.[1] || raw || "ログ").trim(),
      tab: (match?.[2] || "メイン").trim()
    };
  }

  function textWithBreaks(node) {
    const clone = node.cloneNode(true);
    clone.querySelectorAll("br").forEach(br => br.replaceWith("\n"));
    return clone.textContent
      .replace(/\u00a0/g, " ")
      .replace(/\r/g, "")
      // CCFOLIA pretty-prints each message span on its own indented line.
      // Remove only that wrapper indentation; keep intentional <br> line breaks.
      .replace(/^\n[\t ]*/, "")
      .replace(/\n[\t ]*$/, "")
      .replace(/[\t ]+\n/g, "\n")
      .trimEnd();
  }

  function textWithoutSpeaker(font) {
    const clone = font.cloneNode(true);
    clone.querySelector(":scope > b")?.remove();
    clone.querySelectorAll("br").forEach(br => br.replaceWith("\n"));
    return clone.textContent
      .replace(/\u00a0/g, " ")
      .replace(/^[\t \r\n]*[：:][\t ]*/, "")
      .replace(/[\t ]+\n/g, "\n")
      .trimEnd();
  }

  function parseFlatLog(doc, filename) {
    const fonts = [...doc.body.children].filter(node => node.tagName === "FONT");
    if (!fonts.length) return null;

    const names = sourceNames(filename, doc.querySelector("title")?.textContent.trim());
    const messages = fonts.map((font, index) => {
      const speaker = (font.querySelector(":scope > b")?.textContent || "").replace(/：$/, "").trim();
      const text = textWithoutSpeaker(font);
      const color = font.getAttribute("color") || font.style.color || "";
      return {
        id: `m${index}`,
        speaker,
        text,
        color,
        time: "",
        tab: names.tab,
        diceroll: /(?:\bCCB?\b|Cthulhu\s*:|\d+D\d+)/i.test(text),
        system: /^system$/i.test(speaker)
      };
    }).filter(message => message.speaker || message.text);

    return messages.length ? { title: names.title, tabs: [names.tab], messages } : null;
  }

  function ccfoliaTime(row) {
    const structured = row.querySelector("time")?.getAttribute("datetime") ||
      row.querySelector("time")?.textContent ||
      row.getAttribute("data-time") ||
      row.getAttribute("data-timestamp") || "";
    const value = String(structured).trim();
    if (!value) return "";
    const match = value.match(/(?:T|\s|^)(\d{1,2}:\d{2})(?::\d{2})?/);
    return match?.[1] || (/^\d{1,2}:\d{2}$/.test(value) ? value : "");
  }

  function parseCcfolia(doc, filename) {
    const rows = [...doc.body.querySelectorAll(":scope > p")].filter(row => {
      const spans = row.querySelectorAll(":scope > span");
      return spans.length >= 3 && /^\s*\[[^\]]+\]\s*$/.test(spans[0].textContent || "");
    });
    if (!rows.length) return null;

    const tabs = [];
    const seenTabs = new Set();
    const messages = [];

    rows.forEach((row, sourceIndex) => {
      const spans = [...row.querySelectorAll(":scope > span")];
      const tab = (spans[0]?.textContent || "")
        .replace(/^\s*\[/, "")
        .replace(/\]\s*$/, "")
        .trim() || "main";
      if (!seenTabs.has(tab)) {
        seenTabs.add(tab);
        tabs.push(tab);
      }

      const speaker = (spans[1]?.textContent || "").trim();
      const text = textWithBreaks(spans[2]);
      if (!speaker && !text) return;
      const color = row.style.color || row.getAttribute("style")?.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i)?.[1]?.trim() || "";

      // sourceIndex is the global chronology key. Never regroup/re-sort by tab.
      messages.push({
        id: `m${sourceIndex}`,
        speaker,
        text,
        color,
        time: ccfoliaTime(row),
        tab,
        diceroll: /(?:\bCCB?\b|\bSANc?\b|\d+D\d+|＞\s*(?:成功|失敗|決定的成功|ファンブル))/i.test(text),
        system: /^system$/i.test(speaker),
        sourceIndex
      });
    });

    if (!messages.length) return null;
    return {
      title: cleanSourceTitle(filename, doc.querySelector("title")?.textContent.trim()),
      tabs,
      messages
    };
  }

  parseTekey = function parseCompatibleLog(html, filename) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    if (doc.querySelector(".chatlog > div")) return parseTabbedTekey(html, filename);
    const ccfolia = parseCcfolia(doc, filename);
    if (ccfolia) return ccfolia;
    const flat = parseFlatLog(doc, filename);
    if (flat) return flat;
    return parseTabbedTekey(html, filename);
  };
})();
