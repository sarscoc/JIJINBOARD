"use strict";

// Make persona creation/icon changes durable immediately and in one direction:
// UI/local profile -> PL MASTER -> room participants.
// In particular, never let the generic `change` listener push an empty icon
// before resizeIcon() has finished.
(() => {
  const params = new URL(location.href).searchParams;
  const boardId = params.get("board") || "";
  let nameTimer = 0;
  let syncing = false;

  const style = document.createElement("style");
  style.textContent = `
    .profile-image-control.is-uploading .profile-image-preview{position:relative;overflow:hidden}
    .profile-image-control.is-uploading .profile-image-preview::after{
      content:"";position:absolute;inset:0;background:rgba(255,255,255,.56)
    }
    .profile-image-control.is-uploading .profile-image-preview::before{
      content:"";position:absolute;z-index:2;left:50%;top:50%;width:12px;height:12px;
      margin:-7px 0 0 -7px;border:2px solid rgba(60,68,78,.25);border-top-color:#59616c;
      border-radius:50%;animation:jijinPersonaUploadSpin .65s linear infinite
    }
    .profile-image-control.is-saved .profile-image-preview{outline:2px solid rgba(72,140,92,.32);outline-offset:-2px}
    @keyframes jijinPersonaUploadSpin{to{transform:rotate(360deg)}}
  `;
  document.head.appendChild(style);

  const namedPersonas = () => (state.profile?.personas || [])
    .filter(persona => persona?.type === "PC" && String(persona.name || "").trim());

  async function syncRoomParticipants() {
    if (!boardId || !state.roomId || !state.profile?.id || !state.profile?.plName) return;
    const personas = namedPersonas().map(persona => ({
      id: persona.id || "",
      name: String(persona.name || "").trim(),
      type: "PC",
      icon: persona.icon || ""
    }));
    if (!personas.length) return;
    await api(`/api/boards/${encodeURIComponent(boardId)}/logs/${encodeURIComponent(state.roomId)}/participants`, {
      method: "POST",
      body: JSON.stringify({ authorId: state.profile.id, plName: state.profile.plName, personas })
    });
  }

  async function syncNow() {
    if (syncing) return;
    syncing = true;
    try {
      saveProfile();
      emitIntegratedProfile();
      fillPersonaSelect();
      try { heartbeatPresence(); } catch {}
      await window.JIJINPlayerMaster?.pushCurrent?.();
      await syncRoomParticipants();
      window.dispatchEvent(new CustomEvent("jijinboard-persona-immediate-saved", {
        detail: { roomId: state.roomId, profileId: state.profile?.id || "" }
      }));
    } catch (error) {
      console.warn("Immediate persona sync failed", error);
    } finally {
      syncing = false;
    }
  }

  function scheduleNameSync() {
    clearTimeout(nameTimer);
    nameTimer = setTimeout(() => syncNow(), 180);
  }

  // Capture icon changes before app.js / player-master.js bubble listeners.
  // Show the chosen file immediately with an object URL, then perform the
  // expensive resize/persistence work behind that preview.
  document.addEventListener("change", async event => {
    const input = event.target.closest?.("[data-persona-icon]");
    if (!input) return;
    event.stopImmediatePropagation();

    const index = Number(input.dataset.personaIcon);
    const persona = state.profile?.personas?.[index];
    const file = input.files?.[0];
    if (!persona || !file) return;

    const control = input.closest(".profile-image-control");
    const preview = control?.querySelector(".profile-image-preview");
    const objectUrl = URL.createObjectURL(file);
    if (preview) preview.innerHTML = `<img src="${objectUrl}" alt="">`;
    control?.classList.remove("is-saved");
    control?.classList.add("is-uploading");

    try {
      persona.icon = await resizeIcon(file);
      if (String(persona.name || "").trim()) delete persona._draft;
      saveProfile();
      emitIntegratedProfile();
      fillPersonaSelect();
      await window.JIJINPlayerMaster?.pushCurrent?.();
      await syncRoomParticipants();
      try { heartbeatPresence(); } catch {}

      // Re-render only after the durable icon exists, so the immediate preview
      // is never replaced by the old/empty value while processing.
      renderPersonas();
      const savedInput = document.querySelector(`[data-persona-icon="${index}"]`);
      const savedControl = savedInput?.closest(".profile-image-control");
      savedControl?.classList.add("is-saved");
      setTimeout(() => savedControl?.classList.remove("is-saved"), 700);

      window.dispatchEvent(new CustomEvent("jijinboard-persona-icon-saved", {
        detail: { roomId: state.roomId, personaId: persona.id || "" }
      }));
    } catch (error) {
      console.warn("Persona icon save failed", error);
      renderPersonas();
    } finally {
      control?.classList.remove("is-uploading");
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    }
  }, true);

  // As soon as a new character receives a real name, commit it to the page/master.
  // No blur, Enter, profile close, or explicit save is required.
  document.addEventListener("input", event => {
    const input = event.target.closest?.("[data-persona-name]");
    if (!input) return;
    const persona = state.profile?.personas?.[Number(input.dataset.personaName)];
    if (!persona) return;
    persona.name = input.value;
    if (String(persona.name || "").trim()) {
      delete persona._draft;
      saveProfile();
      emitIntegratedProfile();
      fillPersonaSelect();
      scheduleNameSync();
    }
  });
})();
