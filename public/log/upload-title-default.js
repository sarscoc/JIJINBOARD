"use strict";

// A board log has one canonical scenario title. Start it from the imported log
// title, then let the user edit it before uploading. While preserving this UI,
// the upload request is bound to its parent ROOM and carries the original HTML
// plus the owner-entered free-text scenario metadata.
(() => {
  let originalHtml=null;
  const baseHandleFile = handleFile;
  handleFile = async function(file) {
    try{originalHtml=/\.html?$/i.test(String(file?.name||""))?await file.text():null}catch{originalHtml=null}
    await baseHandleFile(file);
    if (!state.parsed) return;
    const input = document.querySelector("#scenarioTitleInput");
    if (input) input.value = state.parsed.title || "";
  };

  const params=new URL(location.href).searchParams;
  const embedded=params.get("embedded")==="1"&&parent!==window;
  const boardId=params.get("board")||"";
  const roomId=params.get("room")||"";

  const baseApi=api;
  api=async function(path,options={}){
    if(path==="/api/rooms"&&String(options?.method||"GET").toUpperCase()==="POST"){
      let payload={};try{payload=JSON.parse(options.body||"{}")||{}}catch{}
      payload.boardId=boardId;
      payload.spoiler=!!document.querySelector("#spoilerInput")?.checked;
      payload.scenarioTitle=document.querySelector("#scenarioTitleInput")?.value.trim()||payload.title||"";
      payload.scenarioParticipants=document.querySelector("#scenarioParticipantsInput")?.value.trim()||"";
      payload.logDisplayMode=document.querySelector('input[name="jijinRoomDisplayMode"]:checked')?.value==="dark"?"dark":"light";
      if(originalHtml&&payload.originalHtml==null)payload.originalHtml=originalHtml;
      const headers={...(options.headers||{})};
      if(boardId){
        let token=localStorage.getItem(`boardAdmin:${boardId}`);
        if(!token){
          try{token=JSON.parse(localStorage.getItem("jijinboardOwnedBoards.v1")||"{}")[boardId]?.adminToken}catch{}
        }
        headers["x-board-admin-token"]=token||"";
      }
      return baseApi(path,{...options,headers,body:JSON.stringify(payload)});
    }
    return baseApi(path,options);
  };

  if(!embedded||!boardId)return;

  function applySharedMode(mode){
    mode=mode==="dark"?"dark":"light";
    if(roomId&&window.JijinDesktop)try{localStorage.setItem(`theme:${roomId}`,mode)}catch{}
    if(window.__jijinLogThemeReady&&document.documentElement.classList.contains("dark")===(mode==="dark"))return;
    if(typeof applyTheme==="function")applyTheme(mode);
    else document.documentElement.classList.toggle("dark",mode==="dark");
    window.__jijinLogThemeReady=true;
    window.dispatchEvent(new Event("jijinboard-log-theme-ready"));
  }

  addEventListener("message",event=>{
    if(event.origin!==location.origin||event.data?.type!=="jijinboard-set-room-theme")return;
    applySharedMode(event.data.displayMode);
  });

  if(roomId){
    const saved=window.JijinDesktop?localStorage.getItem(`theme:${roomId}`):null;
    if(saved==="dark"||saved==="light")applySharedMode(saved);
    fetch(`/api/boards/${encodeURIComponent(boardId)}/logs/${encodeURIComponent(roomId)}/display-mode`,{signal:AbortSignal.timeout(6000)})
      .then(response=>response.ok?response.json():null)
      .then(data=>applySharedMode(data?.displayMode||localStorage.getItem(`theme:${roomId}`)))
      .catch(()=>{window.__jijinLogThemeReady=true;window.dispatchEvent(new Event("jijinboard-log-theme-ready"))});
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

