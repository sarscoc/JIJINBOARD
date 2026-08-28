"use strict";

// Compact PL/PC editor. Keep the existing profile storage, upload, transfer and
// marker-color behavior; only present the controls in a flatter row layout.
(() => {
  const fallbackImage = '<span>画像</span>';

  function imageHtml(icon) {
    return icon ? `<img src="${esc(icon)}" alt="">` : fallbackImage;
  }

  function markerSamples(color) {
    const safe = esc(markerColor(color || "#ffe66b"));
    return `<span class="profile-marker-samples" style="--preview-color:${safe}"><i class="marker-sample light"><b></b></i><i class="marker-sample dark"><b></b></i></span>`;
  }

  renderPlIcon = function renderCompactPlIcon() {
    const preview = $("#plIconPreview");
    if (preview) preview.innerHTML = imageHtml(state.profile.plIcon || "");
  };

  renderPersonas = function renderCompactPersonas() {
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
        <label class="profile-marker-control" title="マーカー色">
          <span class="profile-marker-label">マーカー色</span>
          ${markerSamples(persona.color)}
          <input type="color" value="${esc(markerColor(persona.color || "#ffe66b"))}" data-persona-color="${index}" aria-label="PCのマーカー色">
        </label>
        <button type="button" class="icon-btn profile-remove" data-remove-persona="${index}" aria-label="削除">×</button>
      </div>`;
    }).join("");
  };

  function syncStaticSamples() {
    const pl = $("#plMarkerSamples");
    const newPc = $("#newPersonaMarkerSamples");
    if (pl) pl.style.setProperty("--preview-color", $("#plMarkerColor")?.value || "#ffe66b");
    if (newPc) newPc.style.setProperty("--preview-color", $("#newPersonaColor")?.value || "#ffe66b");
    const newPreview = $("#newPersonaImagePreview");
    if (newPreview) newPreview.innerHTML = imageHtml(state.newPersonaIcon || "");
  }

  const baseOpenProfile = openProfile;
  openProfile = function openCompactProfile() {
    baseOpenProfile();
    $("#transferPanel")?.classList.add("hidden");
    syncStaticSamples();
  };

  document.addEventListener("input", event => {
    const color = event.target.closest("#plMarkerColor,#newPersonaColor,[data-persona-color]");
    if (!color) return;
    const control = color.closest(".profile-marker-control");
    control?.querySelector(".profile-marker-samples")?.style.setProperty("--preview-color", color.value);
  });

  document.addEventListener("change", event => {
    const nameInput = event.target.closest("[data-persona-name]");
    if (nameInput) {
      const index = Number(nameInput.dataset.personaName);
      const persona = state.profile.personas[index];
      const name = nameInput.value.trim();
      if (persona && name) {
        persona.name = name;
        saveProfile();
        emitIntegratedProfile();
        fillPersonaSelect();
      } else if (persona) {
        nameInput.value = persona.name || "";
      }
    }
  });

  $("#newPersonaIcon")?.addEventListener("change", () => setTimeout(syncStaticSamples, 0));
  $("#savePersonaBtn")?.addEventListener("click", () => setTimeout(syncStaticSamples, 0));
  $("#transferToggle")?.addEventListener("click", () => $("#transferPanel")?.classList.toggle("hidden"));

  syncStaticSamples();
})();
