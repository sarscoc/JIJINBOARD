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
})();
