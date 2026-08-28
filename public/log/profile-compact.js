"use strict";

// Compact PL/PC editor with separate marker colors for light and dark LOG themes.
// Existing one-color profiles/annotations remain compatible: the old color is
// used for both themes until the user chooses separate values.
(() => {
  const fallbackImage = '<span>画像</span>';
  const baseMarkerColor = markerColor;
  const baseSaveProfile = saveProfile;
  const baseOpenProfile = openProfile;
  const baseCurrentPersona = currentPersona;
  const baseApplyTheme = applyTheme;
  const baseLoadRoomPersonas = loadRoomPersonas;
  const darkProfileKey = "trpgMarkerProfileColorsV2";

  function safeColor(value, fallback="#ffe66b") {
    return baseMarkerColor(value || fallback);
  }

  function decodePair(value) {
    const raw = String(value || "");
    const split = raw.indexOf("|");
    if (split > 0) {
      return {
        light: safeColor(raw.slice(0, split)),
        dark: safeColor(raw.slice(split + 1))
      };
    }
    const color = safeColor(raw);
    return { light: color, dark: color };
  }

  function encodePair(light, dark) {
    const l = safeColor(light);
    const d = safeColor(dark || light);
    return `${l}|${d}`;
  }

  function personaPair(persona) {
    const legacy = decodePair(persona?.color);
    return encodePair(legacy.light, persona?.colorDark || legacy.dark);
  }

  function imageHtml(icon) {
    return icon ? `<img src="${esc(icon)}" alt="">` : fallbackImage;
  }

  function markerChoices(light, dark, lightAttr, darkAttr, lightLabel="白背景用マーカー色", darkLabel="黒背景用マーカー色") {
    const l = safeColor(light), d = safeColor(dark || light);
    return `<span class="profile-marker-label">マーカー色</span>
      <label class="marker-choice light" title="白背景用の色"><span>白</span><b style="background:${esc(l)}"></b><input type="color" value="${esc(l)}" ${lightAttr} aria-label="${lightLabel}"></label>
      <label class="marker-choice dark" title="黒背景用の色"><span>黒</span><b style="background:${esc(d)}"></b><input type="color" value="${esc(d)}" ${darkAttr} aria-label="${darkLabel}"></label>`;
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

  hydratePlDarkColor();
  hydratePersonaColors();

  // Keep the old local profile structure intact and persist the new PL dark
  // color separately. Room personas already serialize their extra colorDark.
  saveProfile = function saveDualColorProfile() {
    baseSaveProfile();
    try { localStorage.setItem(darkProfileKey, JSON.stringify({ plColorDark: safeColor(state.profile.plColorDark || state.profile.plColor) })); } catch {}
  };

  loadRoomPersonas = function loadDualColorRoomPersonas(roomId) {
    baseLoadRoomPersonas(roomId);
    if (hydratePersonaColors()) saveProfile();
  };

  // Annotation.color stays one DB field for backward compatibility. New values
  // carry both colors as "#light|#dark"; every viewer selects the right half.
  markerColor = function markerColorForTheme(value) {
    const pair = decodePair(value);
    return document.documentElement.classList.contains("dark") ? pair.dark : pair.light;
  };

  currentPersona = function currentDualColorPersona() {
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

  renderPersonas = function renderCompactPersonas() {
    hydratePersonaColors();
    const list = $("#personaList");
    if (!list) return;
    list.innerHTML = state.profile.personas.map((persona, index) => {
      const type = String(persona.type || "PC");
      const typeNote = type !== "PC" ? `<span class="profile-type-note">${esc(type)}</span>` : "";
      return `<div class="profile-person-row persona-row ${type !== "PC" ? "is-npc" : ""}">
        <div class="profile-name-wrap"><input class="profile-name-input" data-persona-name="${index}" maxlength="80" value="${esc(persona.name || "")}" placeholder="PC名" aria-label="PC名">${typeNote}</div>
        <label class="profile-image-control" title="画像を選択">
          <span class="profile-image-preview">${imageHtml(persona.icon || "")}</span>
          <span class="profile-image-text">画像</span>
          <input type="file" accept="image/*" data-persona-icon="${index}">
        </label>
        <div class="profile-marker-control" aria-label="マーカー色">
          ${markerChoices(persona.color, persona.colorDark, `data-persona-color="${index}"`, `data-persona-color-dark="${index}"`)}
        </div>
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

    const newLight = $("#newPersonaColor"), newDark = $("#newPersonaColorDark");
    if (newDark && !newDark.dataset.touched) newDark.value = newLight?.value || "#ffe66b";
    updatePreview(newLight); updatePreview(newDark);

    const newPreview = $("#newPersonaImagePreview");
    if (newPreview) newPreview.innerHTML = imageHtml(state.newPersonaIcon || "");
  }

  openProfile = function openCompactProfile() {
    hydratePlDarkColor();
    hydratePersonaColors();
    baseOpenProfile();
    $("#transferPanel")?.classList.add("hidden");
    syncStaticControls();
  };

  syncPersonaColor = async function syncDualPersonaColor(persona) {
    if (!state.roomId || !persona?.name) return;
    const color = persona.type === "PL"
      ? encodePair(state.profile.plColor, state.profile.plColorDark || state.profile.plColor)
      : personaPair(persona);
    await api(`/api/rooms/${encodeURIComponent(state.roomId)}/annotations/color`, {
      method: "PATCH",
      body: JSON.stringify({
        authorId: state.profile.id,
        personaName: persona.name,
        personaType: persona.type,
        color
      })
    });
    await refreshAnnotations();
  };

  function addDualPersona() {
    const name = $("#newPersonaName").value.trim();
    if (!name) return;
    const light = $("#newPersonaColor").value || "#ffe66b";
    const dark = $("#newPersonaColorDark").value || light;
    state.profile.personas.push({
      id: uid(), name, type: "PC", icon: state.newPersonaIcon || "",
      color: light, colorDark: dark
    });
    state.lastPersona = String(state.profile.personas.length - 1);
    localStorage.setItem(`lastPersona:${state.roomId}`, state.lastPersona);
    saveProfile(); emitIntegratedProfile();
    state.newPersonaIcon = "";
    $("#newPersonaName").value = "";
    $("#newPersonaIcon").value = "";
    $("#newPersonaColorDark").dataset.touched = "";
    renderPersonas(); syncStaticControls();
  }

  async function saveDualProfileForm(event) {
    event.preventDefault();
    const name = $("#plName").value.trim();
    if (!name) return;
    state.profile.plName = name;
    state.profile.plColor = $("#plMarkerColor").value || "#ffe66b";
    state.profile.plColorDark = $("#plMarkerColorDark").value || state.profile.plColor;
    saveProfile(); emitIntegratedProfile();
    await syncPersonaColor({ name: state.profile.plName, type: "PL", color: state.profile.plColor, colorDark: state.profile.plColorDark }).catch(error => alert(error.message));
    $("#profileDialog").close();
    fillPersonaSelect(); heartbeatPresence();
    if (state.pendingSelection) setTimeout(() => openCommentDialog(), 0);
  }

  async function issueDualProfileTransfer() {
    if (!state.profile.plName) return alert("先にPL名を保存してください。");
    try {
      const data = await api("/api/profile-transfers", {
        method: "POST",
        body: JSON.stringify({ profile: {
          id: state.profile.id,
          plName: state.profile.plName,
          plIcon: state.profile.plIcon || "",
          plColor: state.profile.plColor || "#ffe66b",
          plColorDark: state.profile.plColorDark || state.profile.plColor || "#ffe66b",
          personas: state.profile.personas || []
        }})
      });
      await navigator.clipboard?.writeText(data.code).catch(() => {});
      alert(`引き継ぎコード：${data.code}\n30分以内に、新しい端末の「発言者」で入力してください。\nコードは一度使うと無効になります。`);
    } catch (error) { alert(error.message); }
  }

  async function redeemDualProfileTransfer() {
    const code = $("#transferCodeInput").value.trim();
    if (!code) return;
    try {
      const data = await api(`/api/profile-transfers/${encodeURIComponent(code)}`, { method: "POST" });
      const profile = data.profile;
      state.profile = {
        id: profile.id,
        plName: profile.plName,
        plIcon: profile.plIcon || "",
        plColor: profile.plColor || "#ffe66b",
        plColorDark: profile.plColorDark || profile.plColor || "#ffe66b",
        personas: Array.isArray(profile.personas) ? profile.personas : []
      };
      hydratePersonaColors(); saveProfile();
      $("#transferCodeInput").value = "";
      emitIntegratedProfile(); fillPersonaSelect(); renderPlIcon(); renderPersonas(); syncStaticControls();
      alert("このPLとPCを引き継ぎました。");
    } catch (error) { alert(error.message); }
  }

  function recolorVisibleAnnotations() {
    document.querySelectorAll("mark[data-ann]").forEach(mark => {
      const annotation = state.annotations?.find(item => item.id === mark.dataset.ann);
      if (annotation) mark.style.setProperty("--marker", markerColor(annotation.color));
    });
    document.querySelectorAll(".comment-card[id^='comment-']").forEach(card => {
      const id = card.id.slice(8);
      const annotation = state.annotations?.find(item => item.id === id);
      if (annotation) card.style.setProperty("--comment-marker", markerColor(annotation.color));
    });
  }

  applyTheme = function applyDualMarkerTheme(theme) {
    baseApplyTheme(theme);
    requestAnimationFrame(recolorVisibleAnnotations);
  };

  document.addEventListener("input", event => {
    const input = event.target.closest("#plMarkerColor,#plMarkerColorDark,#newPersonaColor,#newPersonaColorDark,[data-persona-color],[data-persona-color-dark]");
    if (!input) return;
    updatePreview(input);
    if (input.id === "newPersonaColorDark") input.dataset.touched = "1";
  });

  document.addEventListener("change", event => {
    const nameInput = event.target.closest("[data-persona-name]");
    if (nameInput) {
      const index = Number(nameInput.dataset.personaName);
      const persona = state.profile.personas[index];
      const name = nameInput.value.trim();
      if (persona && name) {
        persona.name = name;
        saveProfile(); emitIntegratedProfile(); fillPersonaSelect();
      } else if (persona) nameInput.value = persona.name || "";
    }

    const darkInput = event.target.closest("[data-persona-color-dark]");
    if (darkInput) {
      const persona = state.profile.personas[Number(darkInput.dataset.personaColorDark)];
      if (persona) {
        persona.colorDark = darkInput.value;
        saveProfile();
        syncPersonaColor(persona).catch(error => alert(error.message));
      }
    }
  });

  $("#profileForm").onsubmit = saveDualProfileForm;
  $("#savePersonaBtn").onclick = addDualPersona;
  $("#issueTransferBtn").onclick = issueDualProfileTransfer;
  $("#redeemTransferBtn").onclick = redeemDualProfileTransfer;
  $("#newPersonaIcon")?.addEventListener("change", () => setTimeout(syncStaticControls, 0));
  $("#transferToggle")?.addEventListener("click", () => $("#transferPanel")?.classList.toggle("hidden"));

  syncStaticControls();
})();
