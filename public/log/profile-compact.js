"use strict";

// Compact PL/PC editor with separate marker colors for light/dark LOG themes
// and per-PC MAGIA MATRIX icons. Existing one-color profile data remains valid.
(() => {
  const params = new URL(location.href).searchParams;
  const boardId = params.get("board") || "";
  const baseMarkerColor = markerColor;
  const baseSaveProfile = saveProfile;
  const baseOpenProfile = openProfile;
  const baseCurrentPersona = currentPersona;
  const baseApplyTheme = applyTheme;
  const baseLoadRoomPersonas = loadRoomPersonas;
  const darkProfileKey = "trpgMarkerProfileColorsV2";
  let matrixIcons = new Map();

  function safeColor(value, fallback="#ffe66b") {
    return baseMarkerColor(value || fallback);
  }

  function decodePair(value) {
    const raw = String(value || "");
    const split = raw.indexOf("|");
    if (split > 0) return { light: safeColor(raw.slice(0, split)), dark: safeColor(raw.slice(split + 1)) };
    const color = safeColor(raw);
    return { light: color, dark: color };
  }

  function encodePair(light, dark) {
    const l = safeColor(light), d = safeColor(dark || light);
    return `${l}|${d}`;
  }

  function personaPair(persona) {
    const legacy = decodePair(persona?.color);
    return encodePair(legacy.light, persona?.colorDark || legacy.dark);
  }

  function imageHtml(icon, fallback="▧") {
    return icon ? `<img src="${esc(icon)}" alt="">` : `<span class="profile-image-empty">${fallback}</span>`;
  }

  function colorChoices(light, dark, lightAttr, darkAttr, prefix="") {
    const l = safeColor(light), d = safeColor(dark || light);
    return `<label class="marker-choice light" title="白背景用"><b style="background:${esc(l)}"></b><input type="color" value="${esc(l)}" ${lightAttr} aria-label="${prefix}白背景用マーカー色"></label><label class="marker-choice dark" title="黒背景用"><b style="background:${esc(d)}"></b><input type="color" value="${esc(d)}" ${darkAttr} aria-label="${prefix}黒背景用マーカー色"></label>`;
  }

  function hydratePlDarkColor() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(darkProfileKey) || "{}") || {}; } catch {}
    state.profile.plColorDark = safeColor(state.profile.plColorDark || saved.plColorDark || state.profile.plColor || "#ffe66b");
  }

  function hydratePersonaColors() {
    let changed = false;
    (state.profile.personas || []).forEach(persona => {
      const pair = decodePair(persona.color);
      if (String(persona.color || "").includes("|")) {
        persona.color = pair.light;
        if (!persona.colorDark) persona.colorDark = pair.dark;
        changed = true;
      }
      if (!persona.color) { persona.color = "#ffe66b"; changed = true; }
      if (!persona.colorDark) { persona.colorDark = persona.color; changed = true; }
    });
    return changed;
  }

  function pruneDrafts() {
    state.profile.personas = (state.profile.personas || []).filter(persona => !persona._draft || String(persona.name || "").trim());
  }

  hydratePlDarkColor();
  hydratePersonaColors();

  saveProfile = function saveCompactProfile() {
    const all = state.profile.personas || [];
    const persistable = all.filter(persona => !persona._draft || String(persona.name || "").trim());
    state.profile.personas = persistable;
    baseSaveProfile();
    state.profile.personas = all;
    try { localStorage.setItem(darkProfileKey, JSON.stringify({ plColorDark: safeColor(state.profile.plColorDark || state.profile.plColor) })); } catch {}
  };

  loadRoomPersonas = function loadCompactRoomPersonas(roomId) {
    baseLoadRoomPersonas(roomId);
    if (hydratePersonaColors()) saveProfile();
  };

  // Annotation.color continues to use one DB column; the two values are packed
  // as "light|dark" and resolved by the current LOG theme.
  markerColor = function markerColorForTheme(value) {
    const pair = decodePair(value);
    return document.documentElement.classList.contains("dark") ? pair.dark : pair.light;
  };

  currentPersona = function currentCompactPersona() {
    const persona = baseCurrentPersona();
    if (!persona) return persona;
    if (persona.type === "PL" && persona.name === state.profile.plName) {
      return { ...persona, color: encodePair(state.profile.plColor, state.profile.plColorDark || state.profile.plColor) };
    }
    return { ...persona, color: personaPair(persona) };
  };

  renderPlIcon = function renderCompactPlIcon() {
    const preview = $("#plIconPreview");
    if (preview) preview.innerHTML = imageHtml(state.profile.plIcon || "");
  };

  function matrixIconFor(persona) {
    return matrixIcons.get(String(persona.id || "")) || "";
  }

  renderPersonas = function renderCompactPersonas() {
    hydratePersonaColors();
    const list = $("#personaList");
    if (!list) return;
    list.innerHTML = state.profile.personas.map((persona, index) => {
      const type = String(persona.type || "PC"), matrix = matrixIconFor(persona);
      const typeNote = type !== "PC" ? `<span class="profile-type-note">${esc(type)}</span>` : "";
      const matrixControl = type === "PC" ? `<label class="profile-image-control matrix-image-control" title="MAGIA MATRIX用画像"><span class="profile-image-preview">${imageHtml(matrix, "M")}</span><input type="file" accept="image/*" data-matrix-icon="${index}"></label>` : `<span class="profile-image-control profile-matrix-spacer" aria-hidden="true"></span>`;
      return `<div class="profile-person-row persona-row ${type !== "PC" ? "is-npc" : ""}">
        <div class="profile-name-wrap"><input class="profile-name-input" data-persona-name="${index}" maxlength="80" value="${esc(persona.name || "")}" placeholder="PC名" aria-label="PC名">${typeNote}</div>
        <div class="profile-image-pair"><label class="profile-image-control" title="アイコン画像"><span class="profile-image-preview">${imageHtml(persona.icon || "")}</span><input type="file" accept="image/*" data-persona-icon="${index}"></label>${matrixControl}</div>
        <div class="profile-color-pair">${colorChoices(persona.color, persona.colorDark, `data-persona-color="${index}"`, `data-persona-color-dark="${index}"`, "PCの")}</div>
        <button type="button" class="icon-btn profile-remove" data-remove-persona="${index}" aria-label="削除">×</button>
      </div>`;
    }).join("");
  };

  function updatePreview(input) {
    input?.closest(".marker-choice")?.querySelector("b")?.style.setProperty("background", input.value);
  }

  function syncStaticControls() {
    hydratePlDarkColor();
    const light = $("#plMarkerColor"), dark = $("#plMarkerColorDark");
    if (light) light.value = safeColor(state.profile.plColor);
    if (dark) dark.value = safeColor(state.profile.plColorDark || state.profile.plColor);
    updatePreview(light); updatePreview(dark);
  }

  async function loadMatrixIcons() {
    if (!boardId || !state.roomId || !state.profile?.id) { matrixIcons = new Map(); renderPersonas(); return; }
    try {
      const board = await api(`/api/boards/${encodeURIComponent(boardId)}`);
      const entry = (board.logs || []).find(log => log.roomId === state.roomId);
      matrixIcons = new Map((entry?.participants || []).filter(person => person.authorId === state.profile.id).map(person => [String(person.personaId), person.matrixIcon || ""]));
      renderPersonas();
    } catch {}
  }

  openProfile = function openCompactProfile() {
    pruneDrafts();
    hydratePlDarkColor(); hydratePersonaColors();
    baseOpenProfile();
    $("#transferPanel")?.classList.add("hidden");
    syncStaticControls();
    loadMatrixIcons();
  };

  syncPersonaColor = async function syncCompactPersonaColor(persona) {
    if (!state.roomId || !persona?.name) return;
    const color = persona.type === "PL" ? encodePair(state.profile.plColor, state.profile.plColorDark || state.profile.plColor) : personaPair(persona);
    await api(`/api/rooms/${encodeURIComponent(state.roomId)}/annotations/color`, { method:"PATCH", body:JSON.stringify({ authorId:state.profile.id, personaName:persona.name, personaType:persona.type, color }) });
    await refreshAnnotations();
  };

  function addDraftPersona() {
    const existing = state.profile.personas.findIndex(persona => persona._draft && !String(persona.name || "").trim());
    if (existing >= 0) return $("[data-persona-name='" + existing + "']")?.focus();
    state.profile.personas.push({ id:uid(), name:"", type:"PC", icon:"", color:"#ffe66b", colorDark:"#ffe66b", _draft:true });
    const index = state.profile.personas.length - 1;
    renderPersonas();
    setTimeout(() => document.querySelector(`[data-persona-name="${index}"]`)?.focus(), 0);
  }

  async function ensureBoardParticipants() {
    if (!boardId || !state.roomId || !state.profile?.id || !state.profile?.plName) return;
    const personas = (state.profile.personas || []).filter(persona => persona.type === "PC" && String(persona.name || "").trim()).map(persona => ({ id:persona.id || uid(), name:persona.name, type:"PC", icon:persona.icon || "" }));
    await api(`/api/boards/${encodeURIComponent(boardId)}/logs/${encodeURIComponent(state.roomId)}/participants`, { method:"POST", body:JSON.stringify({ authorId:state.profile.id, plName:state.profile.plName, personas }) });
  }

  async function matrixDataUrl(file) {
    if (!file) return "";
    const bitmap = await createImageBitmap(file), max = 512, scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close?.();
    return canvas.toDataURL("image/webp", .84);
  }

  async function uploadMatrixIcon(input) {
    const index = Number(input.dataset.matrixIcon), persona = state.profile.personas[index];
    if (!persona || !String(persona.name || "").trim()) return alert("先にPC名を入力してください。");
    const file = input.files?.[0]; if (!file) return;
    try {
      await ensureBoardParticipants();
      const icon = await matrixDataUrl(file);
      await api(`/api/boards/${encodeURIComponent(boardId)}/logs/${encodeURIComponent(state.roomId)}/participants/${encodeURIComponent(persona.id)}/matrix-icon`, { method:"POST", body:JSON.stringify({ authorId:state.profile.id, icon }) });
      await loadMatrixIcons();
      if (parent !== window) parent.postMessage({ type:"jijinboard-matrix-icon-updated", roomId:state.roomId }, location.origin);
    } catch (error) { alert(error.message); }
  }

  async function saveCompactProfileForm(event) {
    event.preventDefault();
    const name = $("#plName").value.trim(); if (!name) return;
    pruneDrafts();
    state.profile.plName = name;
    state.profile.plColor = $("#plMarkerColor").value || "#ffe66b";
    state.profile.plColorDark = $("#plMarkerColorDark").value || state.profile.plColor;
    saveProfile(); emitIntegratedProfile();
    await Promise.allSettled([syncPersonaColor({ name:state.profile.plName, type:"PL" }), ensureBoardParticipants()]);
    $("#profileDialog").close(); fillPersonaSelect(); heartbeatPresence();
    if (state.pendingSelection) setTimeout(() => openCommentDialog(), 0);
  }

  async function issueCompactProfileTransfer() {
    if (!state.profile.plName) return alert("先にPL名を保存してください。");
    pruneDrafts();
    try {
      const data = await api("/api/profile-transfers", { method:"POST", body:JSON.stringify({ profile:{ id:state.profile.id, plName:state.profile.plName, plIcon:state.profile.plIcon || "", plColor:state.profile.plColor || "#ffe66b", plColorDark:state.profile.plColorDark || state.profile.plColor || "#ffe66b", personas:state.profile.personas || [] } }) });
      await navigator.clipboard?.writeText(data.code).catch(() => {});
      alert(`引き継ぎコード：${data.code}\n30分以内に、新しい端末の「発言者」で入力してください。\nコードは一度使うと無効になります。`);
    } catch (error) { alert(error.message); }
  }

  async function redeemCompactProfileTransfer() {
    const code = $("#transferCodeInput").value.trim(); if (!code) return;
    try {
      const data = await api(`/api/profile-transfers/${encodeURIComponent(code)}`, { method:"POST" }), profile = data.profile;
      state.profile = { id:profile.id, plName:profile.plName, plIcon:profile.plIcon || "", plColor:profile.plColor || "#ffe66b", plColorDark:profile.plColorDark || profile.plColor || "#ffe66b", personas:Array.isArray(profile.personas) ? profile.personas : [] };
      hydratePersonaColors(); saveProfile(); $("#transferCodeInput").value = "";
      emitIntegratedProfile(); fillPersonaSelect(); renderPlIcon(); renderPersonas(); syncStaticControls(); await ensureBoardParticipants().catch(() => {}); await loadMatrixIcons();
      alert("このPLとPCを引き継ぎました。");
    } catch (error) { alert(error.message); }
  }

  function recolorVisibleAnnotations() {
    document.querySelectorAll("mark[data-ann]").forEach(mark => { const annotation = state.annotations?.find(item => item.id === mark.dataset.ann); if (annotation) mark.style.setProperty("--marker", markerColor(annotation.color)); });
    document.querySelectorAll(".comment-card[id^='comment-']").forEach(card => { const annotation = state.annotations?.find(item => item.id === card.id.slice(8)); if (annotation) card.style.setProperty("--comment-marker", markerColor(annotation.color)); });
  }

  applyTheme = function applyCompactTheme(theme) { baseApplyTheme(theme); requestAnimationFrame(recolorVisibleAnnotations); };

  document.addEventListener("input", event => {
    const input = event.target.closest("#plMarkerColor,#plMarkerColorDark,[data-persona-color],[data-persona-color-dark]");
    if (input) updatePreview(input);
  });

  document.addEventListener("change", async event => {
    const nameInput = event.target.closest("[data-persona-name]");
    if (nameInput) {
      const index = Number(nameInput.dataset.personaName), persona = state.profile.personas[index], name = nameInput.value.trim();
      if (persona && name) { persona.name = name; delete persona._draft; saveProfile(); emitIntegratedProfile(); fillPersonaSelect(); ensureBoardParticipants().then(loadMatrixIcons).catch(() => {}); }
      else if (persona && !persona._draft) nameInput.value = persona.name || "";
    }

    const darkInput = event.target.closest("[data-persona-color-dark]");
    if (darkInput) {
      const persona = state.profile.personas[Number(darkInput.dataset.personaColorDark)];
      if (persona) { persona.colorDark = darkInput.value; saveProfile(); syncPersonaColor(persona).catch(error => alert(error.message)); }
    }

    const matrixInput = event.target.closest("[data-matrix-icon]");
    if (matrixInput) await uploadMatrixIcon(matrixInput);

    const personaIcon = event.target.closest("[data-persona-icon]");
    if (personaIcon) {
      const index = Number(personaIcon.dataset.personaIcon), persona = state.profile.personas[index], file = personaIcon.files?.[0];
      if (persona && file) {
        try { persona.icon = await resizeIcon(file); saveProfile(); renderPersonas(); emitIntegratedProfile(); await ensureBoardParticipants(); await loadMatrixIcons(); } catch {}
      }
    }
  });

  document.addEventListener("click", event => {
    if (event.target.closest("[data-remove-persona]")) setTimeout(() => { emitIntegratedProfile(); ensureBoardParticipants().then(loadMatrixIcons).catch(() => {}); }, 0);
  });

  $("#profileForm").onsubmit = saveCompactProfileForm;
  $("#savePersonaBtn").onclick = addDraftPersona;
  $("#issueTransferBtn").onclick = issueCompactProfileTransfer;
  $("#redeemTransferBtn").onclick = redeemCompactProfileTransfer;
  $("#transferToggle")?.addEventListener("click", () => $("#transferPanel")?.classList.toggle("hidden"));
  syncStaticControls();
})();
