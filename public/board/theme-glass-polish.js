"use strict";
(()=>{
  const styleId="jijinboardGlassPolish";
  const boardId=new URL(location.href).searchParams.get("id")||"";
  const storageKey=boardId?`jijinboardScopedTheme:${boardId}`:"";

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
      html.embedded.dark .comments-pane{
        background:rgba(53,53,53,.85)!important;
      }
      html.embedded .cylinder-nav,
      html.embedded .page-title,
      html.embedded .tab-navigation,
      html.embedded .comments-head,
      html.embedded .comments-list{background:transparent!important}
      html.embedded .tab-arrow,
      html.embedded .slide-btn,
      html.embedded .cylinder-nav button{background:#fff!important;color:#596168!important}
    `;
  }

  function matrixCss(theme){
    const secondary=rgba(theme?.color2||"#f5f6f7",.85);
    return `
      html.embedded{--matrix-glass:rgba(255,255,255,.85)!important;--matrix-glass-strong:rgba(255,255,255,.85)!important}
      html.embedded .library{background:${secondary}!important;backdrop-filter:blur(14px) saturate(120%)!important;-webkit-backdrop-filter:blur(14px) saturate(120%)!important}
      html.embedded .stage{background:rgba(255,255,255,.85)!important;backdrop-filter:blur(14px) saturate(120%)!important;-webkit-backdrop-filter:blur(14px) saturate(120%)!important}
      html.embedded #matrixIconComments>section{background:rgba(255,255,255,.85)!important;backdrop-filter:blur(14px) saturate(120%)!important;-webkit-backdrop-filter:blur(14px) saturate(120%)!important}
      html.embedded .matrix-comment-head,
      html.embedded #matrixIconComments .matrix-comments-body{background:transparent!important}
      html.embedded .stage-area-toolbar :is(.btn,button),
      html.embedded .toolbar-scale-check{background:#fff!important}
    `;
  }

  function sheetCss(theme){
    const secondary=rgba(theme?.color2||"#f5f6f7",.85);
    return `
      html.embedded{--sheet-glass:rgba(255,255,255,.85)!important;--sheet-glass-strong:rgba(255,255,255,.85)!important;--sheet-cell:rgba(255,255,255,.85)!important}
      html.embedded #databaseLayout{background:rgba(255,255,255,.85)!important;backdrop-filter:blur(14px) saturate(120%)!important;-webkit-backdrop-filter:blur(14px) saturate(120%)!important}
      html.embedded #sheetComments>section{background:rgba(255,255,255,.85)!important;backdrop-filter:blur(14px) saturate(120%)!important;-webkit-backdrop-filter:blur(14px) saturate(120%)!important}
      html.embedded .sheet-comments-head,
      html.embedded #sheetComments .sheet-comments-body{background:transparent!important}
      html.embedded .group-row td{background:${secondary}!important}
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
      const theme=readTheme();
      style.textContent=scope==="log"?logCss():scope==="matrix"?matrixCss(theme):sheetCss(theme);
    }catch{}
  }
  function applyAll(){
    applyParent();
    for(const [id,scope] of [["logFrame","log"],["matrixFrame","matrix"],["spreadsheetFrame","sheet"]])apply(document.getElementById(id),scope);
  }
  function scheduleApply(){requestAnimationFrame(applyAll);setTimeout(applyAll,80)}

  for(const [id,scope] of [["logFrame","log"],["matrixFrame","matrix"],["spreadsheetFrame","sheet"]]){
    const frame=document.getElementById(id);
    if(!frame)continue;
    frame.addEventListener("load",()=>requestAnimationFrame(()=>apply(frame,scope)));
  }
  document.addEventListener("input",event=>{if(event.target?.closest?.("#boardDesignSlot"))scheduleApply()},true);
  document.addEventListener("change",event=>{if(event.target?.closest?.("#boardDesignSlot"))scheduleApply()},true);
  applyAll();
})();
