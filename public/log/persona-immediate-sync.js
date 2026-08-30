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
  // We own the whole icon save so an empty pre-resize value can never be sent.
  document.addEventListener("change", async event => {
    const input = event.target.closest?.("[data-persona-icon]");
    if (!input) return;
    event.stopImmediatePropagation();

    const index = Number(input.dataset.personaIcon);
    const persona = state.profile?.personas?.[index];
    const file = input.files?.[0];
    if (!persona || !file) return;

    try {
      persona.icon = await resizeIcon(file);
      if (String(persona.name || "").trim()) delete persona._draft;
      saveProfile();
      renderPersonas();
      emitIntegratedProfile();
      fillPersonaSelect();
      await window.JIJINPlayerMaster?.pushCurrent?.();
      await syncRoomParticipants();
      try { heartbeatPresence(); } catch {}
      window.dispatchEvent(new CustomEvent("jijinboard-persona-icon-saved", {
        detail: { roomId: state.roomId, personaId: persona.id || "" }
      }));
    } catch (error) {
      console.warn("Persona icon save failed", error);
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
