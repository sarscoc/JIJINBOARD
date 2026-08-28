"use strict";

// Compatibility parser for simple/legacy HTML logs that do not contain Tekey tab markup.
// Example shape: <font color="#999"><b>Speaker</b>：message</font><br>
(() => {
  const parseTabbedTekey = parseTekey;

  function sourceNames(filename, documentTitle) {
    const raw = (documentTitle || filename || "ログ").replace(/\.html?$/i, "").trim();
    const match = raw.match(/^(.*?)[_\-\s](メイン|雑談|秘話|情報|その他)$/i);
    return {
      title: (match?.[1] || raw || "ログ").trim(),
      tab: (match?.[2] || "メイン").trim()
    };
  }

  function textWithoutSpeaker(font) {
    const clone = font.cloneNode(true);
    const speaker = clone.querySelector(":scope > b");
    speaker?.remove();
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
        system: false
      };
    }).filter(message => message.speaker || message.text);

    return messages.length ? { title: names.title, tabs: [names.tab], messages } : null;
  }

  parseTekey = function parseCompatibleLog(html, filename) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    if (doc.querySelector(".chatlog > div")) return parseTabbedTekey(html, filename);
    const flat = parseFlatLog(doc, filename);
    if (flat) return flat;
    return parseTabbedTekey(html, filename);
  };
})();
