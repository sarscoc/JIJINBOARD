"use strict";

// Keep MAGIA MATRIX profile images separate from the tiny LOG avatar pipeline.
// LOG avatars stay lightweight; MATRIX images are stored at higher resolution.
(() => {
  const params = new URL(location.href).searchParams;
  const boardId = params.get("board") || "";
  if (!boardId) return;

  const escAttr = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  async function matrixDataUrlHighQuality(file) {
    const bitmap = await createImageBitmap(file);
    const max = 1024;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return canvas.toDataURL("image/webp", .96);
  }

  async function ensureParticipants() {
    if (!state?.roomId || !state?.profile?.id || !state?.profile?.plName) return;
    const personas = (state.profile.personas || [])
      .filter(persona => persona.type === "PC" && String(persona.name || "").trim())
      .map(persona => ({
        id: persona.id || "",
        name: persona.name,
        type: "PC",
        icon: persona.icon || ""
      }));
    await api(`/api/boards/${encodeURIComponent(boardId)}/logs/${encodeURIComponent(state.roomId)}/participants`, {
      method: "POST",
      body: JSON.stringify({
        authorId: state.profile.id,
        plName: state.profile.plName,
        personas
      })
    });
  }

  document.addEventListener("change", async event => {
    const input = event.target.closest?.("[data-matrix-icon]");
    if (!input) return;

    // profile-compact.js also listens for this input in bubble phase. Handle the
    // upload here in capture phase so the old 512px/.84 encoder never runs.
    event.stopImmediatePropagation();

    const index = Number(input.dataset.matrixIcon);
    const persona = state?.profile?.personas?.[index];
    const file = input.files?.[0];
    if (!persona || !file) return;
    if (!String(persona.name || "").trim()) {
      alert("先にPC名を入力してください。");
      input.value = "";
      return;
    }

    try {
      await ensureParticipants();
      const icon = await matrixDataUrlHighQuality(file);
      await api(`/api/boards/${encodeURIComponent(boardId)}/logs/${encodeURIComponent(state.roomId)}/participants/${encodeURIComponent(persona.id)}/matrix-icon`, {
        method: "POST",
        body: JSON.stringify({ authorId: state.profile.id, icon })
      });

      const preview = input.closest(".profile-image-control")?.querySelector(".profile-image-preview");
      if (preview) preview.innerHTML = `<img src="${escAttr(icon)}" alt="">`;

      if (parent !== window) {
        parent.postMessage({ type: "jijinboard-matrix-icon-updated", roomId: state.roomId }, location.origin);
      }
      window.dispatchEvent(new CustomEvent("matrix-icon-quality-updated", { detail: { personaId: persona.id } }));
    } catch (error) {
      alert(error.message);
    } finally {
      input.value = "";
    }
  }, true);
})();
