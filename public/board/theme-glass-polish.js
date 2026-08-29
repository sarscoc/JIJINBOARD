"use strict";
(()=>{
  const styleId="jijinboardGlassPolish";
  const boardId=new URL(location.href).searchParams.get("id")||"";
  const storageKey=boardId?`jijinboardScopedTheme:${boardId}`:"";

  function readTheme(){
    if(!storageKey)return null;
    try{return JSON.parse(localStorage.getItem(storageKey)||"null")}catch{return null}
  }
  function backgroundRules(theme){
    if(!theme)return"";
    if(theme.backgroundMode==="black-gradient")return "background-color:#202226!important;background-image:radial-gradient(circle at 12% 8%,rgba(255,255,255,.08),transparent 28%),radial-gradient(circle at 86% 82%,rgba(159,113,255,.16),transparent 30%)!important;background-size:auto!important;background-position:0 0!important;background-repeat:no-repeat!important;background-attachment:fixed!important;";
    if(theme.backgroundMode==="color")return `background-color:${theme.backgroundColor||"#f5f7fa"}!important;background-image:none!important;background-attachment:fixed!important;`;
    if(theme.backgroundMode==="image"&&typeof theme.backgroundImage==="string"&&theme.backgroundImage.startsWith("data:image/")){
      const image=theme.backgroundImage.replace(/["\\\n\r]/g,"");
      return `background-color:${theme.backgroundColor||"#f5f7fa"}!important;background-image:url("${image}")!important;background-size:cover!important;background-position:center!important;background-repeat:no-repeat!important;background-attachment:fixed!important;`;
    }
    return "background-color:#f5f7fa!important;background-image:radial-gradient(circle at 12% 8%,rgba(103,163,255,.24),transparent 28%),radial-gradient(circle at 86% 82%,rgba(159,113,255,.12),transparent 30%)!important;background-size:auto!important;background-position:0 0!important;background-repeat:no-repeat!important;background-attachment:fixed!important;";
  }

  function logCss(theme){
    const black=theme?.backgroundMode==="black-gradient";
    const bg=backgroundRules(theme);
    const logSurface=black
      ? "background:#353535!important;color:#f2f4f7!important;border-color:#5b5b5b!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important"
      : "background:rgba(255,255,255,.85)!important;backdrop-filter:blur(18px) saturate(125%)!important;-webkit-backdrop-filter:blur(18px) saturate(125%)!important";
    const navSurface=black?"#353535":"rgba(255,255,255,.85)";
    return `
      ${bg?`html.embedded body,html.embedded #roomView{${bg}}`:""}
      html.embedded body>main,html.embedded .reader-grid{background:transparent!important}
      html.embedded .log-pane{${logSurface}}
      ${black?`
        html.embedded .log-pane .cylinder-nav,html.embedded .log-pane .page-title{background:${navSurface}!important;color:#b3b3b3!important;border-color:#5b5b5b!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
        html.embedded .log-pane .page-scroll{background:#353535!important;color:#f2f4f7!important}
        html.embedded .log-pane .timestamp,html.embedded .log-pane .tab-badge,html.embedded .log-pane .time-rail,html.embedded .log-pane .system-message{color:#b3b3b3!important}
        html.embedded .log-pane .log-message:hover{background:#4a4a4a!important}
      `:`
        html.embedded .log-pane .cylinder-nav,html.embedded .log-pane .page-title{background:${navSurface}!important;backdrop-filter:blur(10px) saturate(125%)!important;-webkit-backdrop-filter:blur(10px) saturate(125%)!important}
      `}
      html.embedded .comments-pane{background:transparent!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;color:#171a1f!important}
      html.embedded .comments-head{background:#fff!important}
      html.embedded .comments-list{background:rgba(255,255,255,.85)!important;backdrop-filter:blur(18px) saturate(125%)!important;-webkit-backdrop-filter:blur(18px) saturate(125%)!important}
      html.embedded .comment-card{background:#fff!important;color:#171a1f!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
      html.embedded .tab-arrow,html.embedded .slide-btn,html.embedded .cylinder-nav button{background:#fff!important;color:#596168!important}
    `;
  }

  function matrixCss(theme){
    const bg=backgroundRules(theme);
    return `
      html.embedded{--matrix-glass:rgba(255,255,255,.85)!important;--matrix-glass-strong:rgba(255,255,255,.85)!important}
      ${bg?`html.embedded body,html.embedded .app,html.embedded .workspace,html.embedded .stage-shell{${bg}}`:""}
      html.embedded .canvas{background:transparent!important}
      html.embedded .stage{background:var(--matrix-glass)!important;backdrop-filter:blur(22px) saturate(135%)!important;-webkit-backdrop-filter:blur(22px) saturate(135%)!important}
      html.embedded .stage-area-toolbar :is(.btn,button),html.embedded .toolbar-scale-check{background:#fff!important}
      html.embedded #matrixIconComments{background:transparent!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
      html.embedded .matrix-comment-head{background:#fff!important}
      html.embedded #matrixIconComments>section{background:rgba(255,255,255,.85)!important;backdrop-filter:blur(18px) saturate(125%)!important;-webkit-backdrop-filter:blur(18px) saturate(125%)!important}
      html.embedded .matrix-comment-card{background:#fff!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
    `;
  }

  function sheetCss(theme){
    const bg=backgroundRules(theme);
    return `
      html.embedded{--sheet-glass:rgba(255,255,255,.85)!important;--sheet-glass-strong:rgba(255,255,255,.85)!important}
      ${bg?`html.embedded body,html.embedded .app,html.embedded #databaseLayout{${bg}}`:""}
      html.embedded #tablePanel,html.embedded .database-main,html.embedded #sheetWrap{background:transparent!important}
      html.embedded #sheetComments{background:transparent!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
      html.embedded .sheet-comments-head{background:#fff!important}
      html.embedded #sheetComments>section{background:rgba(255,255,255,.85)!important;backdrop-filter:blur(18px) saturate(125%)!important;-webkit-backdrop-filter:blur(18px) saturate(125%)!important}
      html.embedded #sheetComments article{background:#fff!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
    `;
  }

  function apply(frame,scope){
    try{
      const doc=frame?.contentDocument;
      if(!doc?.head)return;
      let style=doc.getElementById(styleId);
      if(!style){style=doc.createElement("style");style.id=styleId;doc.head.append(style)}
      const theme=readTheme();
      style.textContent=scope==="log"?logCss(theme):scope==="matrix"?matrixCss(theme):sheetCss(theme);
    }catch{}
  }
  function applyAll(){
    for(const [id,scope] of [["logFrame","log"],["matrixFrame","matrix"],["spreadsheetFrame","sheet"]])apply(document.getElementById(id),scope);
  }
  function scheduleApply(){
    requestAnimationFrame(applyAll);
    setTimeout(applyAll,120);
    setTimeout(applyAll,420);
  }

  for(const [id,scope] of [["logFrame","log"],["matrixFrame","matrix"],["spreadsheetFrame","sheet"]]){
    const frame=document.getElementById(id);
    if(!frame)continue;
    frame.addEventListener("load",()=>requestAnimationFrame(()=>apply(frame,scope)));
    if(frame.contentDocument?.head)apply(frame,scope);
  }

  document.addEventListener("input",event=>{if(event.target?.closest?.("#boardDesignSlot"))scheduleApply()},true);
  document.addEventListener("change",event=>{if(event.target?.closest?.("#boardDesignSlot"))scheduleApply()},true);
  new MutationObserver(()=>scheduleApply()).observe(document.head,{childList:true,subtree:true,characterData:true});
})();
