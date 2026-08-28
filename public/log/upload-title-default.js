"use strict";

// A board log has one canonical scenario title. Start it from the imported log
// title, then let the user edit it before uploading.
(() => {
  const baseHandleFile = handleFile;
  handleFile = async function(file) {
    await baseHandleFile(file);
    if (!state.parsed) return;
    const input = document.querySelector("#scenarioTitleInput");
    if (input) input.value = state.parsed.title || "";
  };
})();
