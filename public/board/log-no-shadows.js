"use strict";
(()=>{
  const frame=document.getElementById("logFrame");
  if(!frame)return;

  function apply(){
    try{
      const doc=frame.contentDocument;
      if(!doc?.head)return;
      let style=doc.getElementById("jijinboardLogNoShadows");
      if(!style){
        style=doc.createElement("style");
        style.id="jijinboardLogNoShadows";
        doc.head.append(style);
      }
      style.textContent=`
        html.embedded{--shadow:none!important}
        html.embedded body,html.embedded body *{box-shadow:none!important}
      `;
    }catch{}
  }

  frame.addEventListener("load",()=>{
    apply();
    setTimeout(apply,0);
    setTimeout(apply,120);
  });
  apply();

  // Keep the main room websocket alive after the LOG tab has been opened once.
  // The child defers expensive annotation refreshes while hidden, so switching
  // tools no longer disconnects/reconnects or performs a catch-up GET when there
  // was no actual change.
  if(typeof setLogActive==="function"){
    setLogActive=function(frame,active){
      try{
        const win=frame?.contentWindow;if(!win)return;
        win.connectRealtime?.();
        win.postMessage({type:"jijinboard-log-active",active:!!active},location.origin);
      }catch{}
    };
  }

  // board-tab-settings.js owns the final openLogEdit implementation, while
  // board-log-meta.js owns the white/black display-mode controls. Keep those
  // two layers composed so opening another log never reuses the previous
  // log's radio value and accidentally saves the wrong display mode.
  if(typeof openLogEdit==="function"&&typeof api==="function"&&typeof boardId!=="undefined"){
    const baseOpenLogEdit=openLogEdit;
    openLogEdit=function(roomId){
      const modePromise=api(`/api/boards/${encodeURIComponent(boardId)}/logs/${encodeURIComponent(roomId)}/display-mode`).catch(()=>null);
      const result=baseOpenLogEdit(roomId);
      modePromise.then(data=>{
        if(!data||state?.editingRoom!==roomId||!document.getElementById("logEditDialog")?.open)return;
        const mode=data.displayMode==="dark"?"dark":"light";
        const input=document.querySelector(`#logEditForm input[name="logDisplayMode"][value="${mode}"]`);
        if(input)input.checked=true;
      });
      return result;
    };
  }

  // theme-scoped.js replaces the original Design tab button. That bypasses the
  // settings workspace's normal disposeSpeaker() path, leaving a complete hidden
  // LOG iframe alive behind the design page. Blank it while Design is open; the
  // existing General-tab code will navigate the same iframe back when needed.
  document.querySelector('[data-board-settings-tab="design"]')?.addEventListener("click",()=>{
    const speakerFrame=document.querySelector("#boardSpeakerSlot iframe");
    if(!speakerFrame||speakerFrame.getAttribute("src")==="about:blank")return;
    try{
      speakerFrame.contentWindow?.postMessage({type:"jijinboard-log-active",active:false},location.origin);
      speakerFrame.contentWindow?.disconnectRealtime?.();
    }catch{}
    speakerFrame.src="about:blank";
  });
})();
