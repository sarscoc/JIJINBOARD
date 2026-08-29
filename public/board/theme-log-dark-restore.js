"use strict";
(()=>{
  const boardId=new URL(location.href).searchParams.get("id")||"";
  if(!boardId)return;
  const storageKey=`jijinboardScopedTheme:${boardId}`;
  const styleId="jijinboardLogDarkRestore";

  function isBlack(){
    try{return JSON.parse(localStorage.getItem(storageKey)||"null")?.backgroundMode==="black-gradient"}
    catch{return false}
  }

  function apply(){
    const frame=document.getElementById("logFrame");
    try{
      const doc=frame?.contentDocument;
      if(!doc?.documentElement||!doc.head)return;
      const black=isBlack();
      doc.documentElement.classList.toggle("dark",black);
      let style=doc.getElementById(styleId);
      if(!style){style=doc.createElement("style");style.id=styleId;doc.head.append(style)}
      style.textContent=black?`
        html.embedded.dark{
          --bg:#424242!important;
          --paper:#353535!important;
          --ink:#f2f4f7!important;
          --muted:#b3b3b3!important;
          --line:#5b5b5b!important;
          --soft:#4a4a4a!important;
          --accent:#f2f4f7!important;
          --shadow:0 8px 28px rgba(0,0,0,.3)!important;
        }
        html.embedded.dark .log-pane,
        html.embedded.dark .page-scroll{
          background:#353535!important;
          color:#f2f4f7!important;
          border-color:#5b5b5b!important;
          backdrop-filter:none!important;
          -webkit-backdrop-filter:none!important;
        }
        html.embedded.dark .cylinder-nav,
        html.embedded.dark .page-title{
          background:#353535!important;
          color:#b3b3b3!important;
          border-color:#5b5b5b!important;
          backdrop-filter:none!important;
          -webkit-backdrop-filter:none!important;
        }
        html.embedded.dark .log-message:hover{background:#4a4a4a!important}
        html.embedded.dark .timestamp,
        html.embedded.dark .tab-badge,
        html.embedded.dark .time-rail,
        html.embedded.dark .system-message{color:#b3b3b3!important}
      `:"";
    }catch{}
  }

  const frame=document.getElementById("logFrame");
  frame?.addEventListener("load",()=>requestAnimationFrame(apply));
  document.addEventListener("input",event=>{if(event.target?.closest?.("#boardDesignSlot")){requestAnimationFrame(apply);setTimeout(apply,80)}},true);
  document.addEventListener("change",event=>{if(event.target?.closest?.("#boardDesignSlot")){requestAnimationFrame(apply);setTimeout(apply,80)}},true);
  window.addEventListener("storage",event=>{if(event.key===storageKey)apply()});
  requestAnimationFrame(apply);
  setTimeout(apply,150);
  setTimeout(apply,500);
})();
