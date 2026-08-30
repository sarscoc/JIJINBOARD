"use strict";

// Profile editor polish:
// - no explicit close/save controls
// - autosave edits
// - click the dialog backdrop to close
// - keep destructive PC controls folded by default
// - keep the LOG light/dark toggle visible when embedded in JIJINBOARD
(() => {
  const dialog = document.querySelector("#profileDialog");
  const form = document.querySelector("#profileForm");

  const style = document.createElement("style");
  style.textContent = `
    .compact-profile-dialog .profile-close-row,
    .compact-profile-dialog .profile-save{display:none!important}
    .compact-profile-dialog form{padding-top:14px!important}
    .compact-profile-dialog .profile-remove{display:none!important}
    .compact-profile-dialog.show-delete-controls .profile-remove{display:inline-grid!important}
    .profile-delete-toggle-wrap{display:block;margin:8px 0 0;padding:8px 0 0;border-top:1px solid #e5e8eb}
    .compact-profile-dialog .profile-delete-toggle{display:inline!important;justify-self:start!important;border:0!important;background:transparent!important;box-shadow:none!important;padding:0!important;margin:0!important;color:var(--muted)!important;font-size:9px!important;font-weight:700!important;line-height:normal!important;cursor:pointer!important;text-decoration:none!important;border-radius:0!important;min-height:0!important;height:auto!important}
    .compact-profile-dialog .profile-delete-toggle:hover{background:transparent!important;color:var(--ink)!important;text-decoration:none!important}
    .compact-profile-dialog.show-delete-controls .profile-delete-toggle{color:var(--muted)!important}
    html.embedded #themeBtn.embedded-theme-toggle{
      display:inline-grid!important;place-items:center;flex:0 0 30px;
      width:30px;height:30px;min-width:30px;padding:0;border-radius:8px
    }
  `;
  document.head.appendChild(style);

  // Prefer the server-backed PL MASTER icon for presence. Local profile icons are
  // data URLs; the master exposes the same image as a stable /api/... URL that is
  // safe to share with every device in the room.
  if (typeof window.realtimePresencePayload === "function" && !window.realtimePresencePayload.__jijinMasterIcon) {
    const basePresencePayload = window.realtimePresencePayload;
    const wrappedPresencePayload = function(type="presence") {
      const payload = basePresencePayload(type);
      const masterIcon = String(window.JIJINPlayerMaster?.master?.plIcon || "");
      if (masterIcon) payload.plIcon = masterIcon;
      return payload;
    };
    wrappedPresencePayload.__jijinMasterIcon = true;
    window.realtimePresencePayload = wrappedPresencePayload;
    window.addEventListener("jijinboard-player-master-updated", () => {
      try { heartbeatPresence?.(); } catch {}
    });
  }

  // The embedded LOG hides its original topbar. Move only the existing theme
  // button into the LOG controls so the original behavior/handler is retained.
  if (document.documentElement.classList.contains("embedded")) {
    const themeButton = document.querySelector("#themeBtn");
    const filters = document.querySelector("#roomView .filters");
    if (themeButton && filters) {
      themeButton.classList.add("embedded-theme-toggle");
      themeButton.title = "白背景 / 黒背景";
      themeButton.setAttribute("aria-label", "白背景と黒背景を切り替え");
      const exportButton = filters.querySelector("#exportRoomBtn");
      filters.insertBefore(themeButton, exportButton || null);
    }
  }

  if (!dialog || !form) return;

  // Bulk persona deletion is intentionally unavailable. Remove legacy controls
  // even if another compatibility script inserts one after this script loads.
  const removeBulkDeleteControls = () => {
    dialog.querySelectorAll("button").forEach(button => {
      if (String(button.textContent || "").trim() === "PCをすべて削除") button.remove();
    });
  };
  removeBulkDeleteControls();
  const destructiveObserver = new MutationObserver(removeBulkDeleteControls);
  destructiveObserver.observe(dialog, { childList: true, subtree: true });

  const transfer = dialog.querySelector(".profile-transfer");
  if (transfer && !dialog.querySelector(".profile-delete-toggle-wrap")) {
    const wrap = document.createElement("div");
    wrap.className = "profile-delete-toggle-wrap";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "profile-delete-toggle profile-transfer-toggle";
    toggle.textContent = "PC削除を表示";
    toggle.setAttribute("aria-expanded", "false");
    toggle.addEventListener("click", () => {
      const open = dialog.classList.toggle("show-delete-controls");
      toggle.textContent = open ? "PC削除を隠す" : "PC削除を表示";
      toggle.setAttribute("aria-expanded", String(open));
    });
    wrap.append(toggle);
    transfer.insertAdjacentElement("afterend", wrap);
  }
  dialog.addEventListener("close", () => {
    dialog.classList.remove("show-delete-controls");
    const toggle = dialog.querySelector(".profile-delete-toggle");
    if (toggle) {
      toggle.textContent = "PC削除を表示";
      toggle.setAttribute("aria-expanded", "false");
    }
  });

  let plTimer = 0;
  let closing = false;

  function updatePlState() {
    const nameInput = document.querySelector("#plName");
    const lightInput = document.querySelector("#plMarkerColor");
    const darkInput = document.querySelector("#plMarkerColorDark");
    const name = nameInput?.value.trim() || "";
    if (name) state.profile.plName = name;
    if (lightInput?.value) state.profile.plColor = lightInput.value;
    if (darkInput?.value) state.profile.plColorDark = darkInput.value;
  }

  function saveLocalAndBroadcast() {
    updatePlState();
    saveProfile();
    emitIntegratedProfile();
    fillPersonaSelect();
    heartbeatPresence();
  }

  async function persistPlColor() {
    saveLocalAndBroadcast();
    if (!state.roomId || !state.profile.plName) return;
    try {
      await syncPersonaColor({
        name: state.profile.plName,
        type: "PL",
        color: state.profile.plColor || "#ffe66b",
        colorDark: state.profile.plColorDark || state.profile.plColor || "#ffe66b"
      });
    } catch (error) {
      console.warn("PL marker color sync failed", error);
    }
  }

  function schedulePlSave() {
    clearTimeout(plTimer);
    plTimer = setTimeout(saveLocalAndBroadcast, 220);
  }

  document.querySelector("#plName")?.addEventListener("input", schedulePlSave);
  document.querySelector("#plName")?.addEventListener("change", saveLocalAndBroadcast);

  for (const selector of ["#plMarkerColor", "#plMarkerColorDark"]) {
    const input = document.querySelector(selector);
    input?.addEventListener("input", () => {
      updatePlState();
      saveProfile();
    });
    input?.addEventListener("change", persistPlColor);
  }

  // The original PL image handler only persisted locally. Keep that behavior,
  // but also broadcast the updated profile to the board/presence immediately.
  const plIconInput = document.querySelector("#plIconInput");
  if (plIconInput) {
    plIconInput.onchange = async event => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        state.profile.plIcon = await resizeIcon(file);
        saveProfile();
        renderPlIcon();
        emitIntegratedProfile();
        heartbeatPresence();
      } catch (error) {
        console.warn("PL icon save failed", error);
      }
    };
  }

  // PC name/color fields already have their server-side change handlers.
  // Persist the in-progress values locally too, so there is no explicit Save step.
  document.addEventListener("input", event => {
    const nameInput = event.target.closest("[data-persona-name]");
    if (nameInput) {
      const persona = state.profile.personas[Number(nameInput.dataset.personaName)];
      if (persona) {
        persona.name = nameInput.value;
        if (nameInput.value.trim()) delete persona._draft;
        saveProfile();
        emitIntegratedProfile();
      }
      return;
    }
    const light = event.target.closest("[data-persona-color]");
    if (light) {
      const persona = state.profile.personas[Number(light.dataset.personaColor)];
      if (persona) { persona.color = light.value; saveProfile(); }
      return;
    }
    const dark = event.target.closest("[data-persona-color-dark]");
    if (dark) {
      const persona = state.profile.personas[Number(dark.dataset.personaColorDark)];
      if (persona) { persona.colorDark = dark.value; saveProfile(); }
    }
  });

  // Enter should never be required as a Save action, and must not close the dialog.
  form.onsubmit = event => {
    event.preventDefault();
    persistPlColor();
  };

  async function closeProfile() {
    if (closing) return;
    closing = true;
    clearTimeout(plTimer);
    await persistPlColor();
    dialog.close();
    closing = false;
  }

  let backdropPointer = false;
  dialog.addEventListener("pointerdown", event => {
    backdropPointer = event.target === dialog;
  });
  dialog.addEventListener("pointerup", event => {
    const outside = backdropPointer && event.target === dialog;
    backdropPointer = false;
    if (outside) closeProfile();
  });
  dialog.addEventListener("cancel", event => {
    // <input type="file"> also fires a bubbling `cancel` event when its picker
    // is dismissed (or the same file is re-selected). Only an actual dialog
    // cancel (Escape while the dialog itself is active) should close profile UI.
    if (event.target !== dialog) return;
    event.preventDefault();
    closeProfile();
  });
})();
