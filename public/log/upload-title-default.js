"use strict";

// A board log has one canonical scenario title. Start it from the imported log
// title, then let the user edit it before uploading.
// In JIJINBOARD, white/black is an owner-controlled shared log setting rather
// than a per-viewer toggle. Standalone LOGCOMMENTS keeps its existing local mode.
(() => {
  const baseHandleFile = handleFile;
  handleFile = async function(file) {
    await baseHandleFile(file);
    if (!state.parsed) return;
    const input = document.querySelector("#scenarioTitleInput");
    if (input) input.value = state.parsed.title || "";
  };

  const params=new URL(location.href).searchParams;
  const embedded=params.get("embedded")==="1"&&parent!==window;
  const boardId=params.get("board")||"";
  const roomId=params.get("room")||"";
  if(!embedded||!boardId)return;

  const themeButton=document.getElementById("themeBtn");
  if(themeButton){
    themeButton.style.display="none";
    themeButton.setAttribute("aria-hidden","true");
    themeButton.tabIndex=-1;
    // Prevent old parent messages or keyboard activation from changing only one
    // viewer's copy of the board log.
    themeButton.onclick=event=>event?.preventDefault?.();
  }

  function applySharedMode(mode){
    mode=mode==="dark"?"dark":"light";
    if(typeof applyTheme==="function")applyTheme(mode);
    else document.documentElement.classList.toggle("dark",mode==="dark");
  }

  addEventListener("message",event=>{
    if(event.origin!==location.origin||event.data?.type!=="jijinboard-set-room-theme")return;
    applySharedMode(event.data.displayMode);
  });

  if(roomId){
    fetch(`/api/boards/${encodeURIComponent(boardId)}/logs/${encodeURIComponent(roomId)}/display-mode`)
      .then(response=>response.ok?response.json():null)
      .then(data=>{if(data)applySharedMode(data.displayMode)})
      .catch(()=>{});
  }else{
    const anchor=document.querySelector("#scenarioTitleInput")?.closest(".spoiler-details");
    if(anchor&&!document.getElementById("jijinRoomDisplayMode")){
      const box=document.createElement("fieldset");
      box.id="jijinRoomDisplayMode";
      box.className="jijin-room-display-mode";
      box.innerHTML='<legend>ログ背景</legend><div><label><input type="radio" name="jijinRoomDisplayMode" value="light" checked><span>白</span></label><label><input type="radio" name="jijinRoomDisplayMode" value="dark"><span>黒</span></label></div>';
      anchor.after(box);
      const style=document.createElement("style");
      style.textContent=`
        .jijin-room-display-mode{margin:10px 0 0;padding:0;border:0;display:grid;gap:5px}.jijin-room-display-mode legend{padding:0;color:var(--muted);font-size:10px;font-weight:700}.jijin-room-display-mode>div{display:grid;grid-template-columns:1fr 1fr;gap:7px}.jijin-room-display-mode label{display:flex;align-items:center;justify-content:center;gap:5px;min-height:32px;border:1px solid var(--line);border-radius:8px;background:var(--paper);color:var(--ink);font-size:11px;font-weight:700;cursor:pointer}.jijin-room-display-mode input{margin:0;accent-color:#596168}
      `;
      document.head.append(style);
    }
  }
})();
