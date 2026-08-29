"use strict";
(()=>{
  const styleId="jijinboardGlassPolish";
  const boardId=new URL(location.href).searchParams.get("id")||"";
  const storageKey=boardId?`jijinboardScopedTheme:${boardId}`:"";
  const themeEndpoint=boardId?`/api/boards/${encodeURIComponent(boardId)}/theme`:"";
  const nativeFetch=window.fetch.bind(window);

  function readTheme(){
    if(!storageKey)return null;
    try{return JSON.parse(localStorage.getItem(storageKey)||"null")}catch{return null}
  }
  function rgba(hex,alpha=.85){
    const value=String(hex||"").replace("#","");
    if(!/^[0-9a-f]{6}$/i.test(value))return `rgba(255,255,255,${alpha})`;
    const n=parseInt(value,16);
    return `rgba(${n>>16},${(n>>8)&255},${n&255},${alpha})`;
  }
  function adminToken(){
    if(!boardId)return"";
    try{return localStorage.getItem(`boardAdmin:${boardId}`)||JSON.parse(localStorage.getItem("jijinboardOwnedBoards.v1")||"{}")[boardId]?.adminToken||""}
    catch{return localStorage.getItem(`boardAdmin:${boardId}`)||""}
  }
  function stripColor2(value){
    if(value&&typeof value==="object"&&Object.prototype.hasOwnProperty.call(value,"color2"))delete value.color2;
    return value;
  }
  function sanitizeStoredTheme(){
    if(!storageKey)return;
    try{
      const value=JSON.parse(localStorage.getItem(storageKey)||"null");
      if(value&&Object.prototype.hasOwnProperty.call(value,"color2")){
        stripColor2(value);
        localStorage.setItem(storageKey,JSON.stringify(value));
      }
    }catch{}
  }
  function removeColor2Ui(){
    const input=document.getElementById("scopedColor2");
    input?.closest?.(".scoped-theme-field")?.remove();
  }
  async function migrateRemoteColor2(){
    if(!themeEndpoint)return;
    const token=adminToken();if(!token)return;
    try{
      const response=await nativeFetch(themeEndpoint);
      if(!response.ok)return;
      const body=await response.json().catch(()=>null);
      if(!body?.theme||!Object.prototype.hasOwnProperty.call(body.theme,"color2"))return;
      stripColor2(body.theme);
      await nativeFetch(themeEndpoint,{method:"POST",headers:{"content-type":"application/json","x-board-admin-token":token},body:JSON.stringify({theme:body.theme})});
    }catch{}
  }

  /* Retire the old surface-color field from all future theme saves. */
  if(themeEndpoint){
    window.fetch=function(input,init){
      const url=typeof input==="string"?input:(input?.url||"");
      const method=String(init?.method||"GET").toUpperCase();
      if(method==="POST"&&url.includes(themeEndpoint)&&typeof init?.body==="string"){
        try{
          const payload=JSON.parse(init.body);
          if(payload?.theme)stripColor2(payload.theme);
          init={...init,body:JSON.stringify(payload)};
        }catch{}
      }
      return nativeFetch(input,init);
    };
  }

  function logCss(){
    return `
      /* LOG light/dark comes from LOG itself (:root / :root.dark), not board background mode. */
      html.embedded .log-pane,
      html.embedded .comments-pane{
        background:color-mix(in srgb,var(--paper) 85%,transparent)!important;
        color:var(--ink)!important;
        border-color:var(--line)!important;
        backdrop-filter:blur(14px) saturate(120%)!important;
        -webkit-backdrop-filter:blur(14px) saturate(120%)!important;
      }
      html.embedded.dark .log-pane,
      html.embedded.dark .comments-pane{background:rgba(53,53,53,.85)!important}
      html.embedded .cylinder-nav,
      html.embedded .page-title,
      html.embedded .tab-navigation,
      html.embedded .comments-head,
      html.embedded .comments-list{background:transparent!important}
      html.embedded .tab-arrow,
      html.embedded .slide-btn,
      html.embedded .cylinder-nav button{background:#fff!important;color:#596168!important}
      html.embedded.dark .tab-arrow,
      html.embedded.dark .slide-btn,
      html.embedded.dark .cylinder-nav button{
        background:var(--paper,#353535)!important;
        color:var(--ink,#f2f4f7)!important;
        border-color:var(--line,#5b5b5b)!important;
      }
    `;
  }

  function matrixCss(){
    return `
      html.embedded{--matrix-glass:rgba(255,255,255,.85)!important;--matrix-glass-strong:rgba(255,255,255,.85)!important}
      html.embedded .library{background:rgba(255,255,255,.85)!important;backdrop-filter:blur(14px) saturate(120%)!important;-webkit-backdrop-filter:blur(14px) saturate(120%)!important}
      html.embedded .stage{background:rgba(255,255,255,.85)!important;backdrop-filter:blur(14px) saturate(120%)!important;-webkit-backdrop-filter:blur(14px) saturate(120%)!important}
      html.embedded #matrixIconComments>section{background:rgba(255,255,255,.85)!important;backdrop-filter:blur(14px) saturate(120%)!important;-webkit-backdrop-filter:blur(14px) saturate(120%)!important}
      html.embedded .matrix-comment-head,
      html.embedded #matrixIconComments .matrix-comments-body{background:transparent!important}
      html.embedded .stage-area-toolbar :is(.btn,button),
      html.embedded .toolbar-scale-check{background:#fff!important}
    `;
  }

  function sheetCss(){
    return `
      html.embedded{--sheet-glass:rgba(255,255,255,.85)!important;--sheet-glass-strong:rgba(255,255,255,.85)!important;--sheet-cell:rgba(255,255,255,.85)!important}
      html.embedded #databaseLayout{background:rgba(255,255,255,.85)!important;backdrop-filter:blur(14px) saturate(120%)!important;-webkit-backdrop-filter:blur(14px) saturate(120%)!important}
      html.embedded #sheetComments>section{background:rgba(255,255,255,.85)!important;backdrop-filter:blur(14px) saturate(120%)!important;-webkit-backdrop-filter:blur(14px) saturate(120%)!important}
      html.embedded .sheet-comments-head,
      html.embedded #sheetComments .sheet-comments-body{background:transparent!important}
      html.embedded .group-row td{background:rgba(255,255,255,.85)!important;background-image:none!important}
    `;
  }

  function applyParent(){
    let style=document.getElementById(`${styleId}Parent`);
    if(!style){style=document.createElement("style");style.id=`${styleId}Parent`;document.head.append(style)}
    style.textContent=`.log-sidebar{background:#fff!important}`;
  }
  function apply(frame,scope){
    try{
      const doc=frame?.contentDocument;
      if(!doc?.head)return;
      let style=doc.getElementById(styleId);
      if(!style){style=doc.createElement("style");style.id=styleId;doc.head.append(style)}
      style.textContent=scope==="log"?logCss():scope==="matrix"?matrixCss():sheetCss();
    }catch{}
  }
  function applyAll(){
    applyParent();
    for(const [id,scope] of [["logFrame","log"],["matrixFrame","matrix"],["spreadsheetFrame","sheet"]])apply(document.getElementById(id),scope);
    removeColor2Ui();
  }
  function scheduleApply(){requestAnimationFrame(applyAll);setTimeout(applyAll,80)}

  for(const [id,scope] of [["logFrame","log"],["matrixFrame","matrix"],["spreadsheetFrame","sheet"]]){
    const frame=document.getElementById(id);
    if(!frame)continue;
    frame.addEventListener("load",()=>requestAnimationFrame(()=>apply(frame,scope)));
  }
  const observer=new MutationObserver(()=>removeColor2Ui());
  observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener("input",event=>{
    if(event.target?.closest?.("#boardDesignSlot")){sanitizeStoredTheme();scheduleApply()}
  },true);
  document.addEventListener("change",event=>{
    if(event.target?.closest?.("#boardDesignSlot")){sanitizeStoredTheme();scheduleApply()}
  },true);

  sanitizeStoredTheme();
  setTimeout(sanitizeStoredTheme,700);
  setTimeout(sanitizeStoredTheme,1800);
  setTimeout(migrateRemoteColor2,900);
  applyAll();
})();