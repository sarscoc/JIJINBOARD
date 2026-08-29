"use strict";
(()=>{
  const styleId="jijinboardGlassPolish";
  const frameStyles={
    log:`
      /* Shared background must remain visible below the embedded UI. */
      html.embedded body>main,html.embedded #roomView,html.embedded .reader-grid{background:transparent!important}
      /* 85% white glass for the main reading surface. */
      html.embedded .log-pane{background:rgba(255,255,255,.85)!important;backdrop-filter:blur(18px) saturate(125%);-webkit-backdrop-filter:blur(18px) saturate(125%)}
      /* Same COMMENTS rule in every tab: white header, 85% body, solid white cards. */
      html.embedded .comments-pane{background:transparent!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
      html.embedded .comments-head{background:#fff!important}
      html.embedded .comments-list{background:rgba(255,255,255,.85)!important;backdrop-filter:blur(18px) saturate(125%);-webkit-backdrop-filter:blur(18px) saturate(125%)}
      html.embedded .comment-card{background:#fff!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
      html.embedded .tab-arrow,html.embedded .slide-btn{background:#fff!important}
      html.embedded .tab-navigation{background:rgba(255,255,255,.85)!important;backdrop-filter:blur(10px) saturate(125%);-webkit-backdrop-filter:blur(10px) saturate(125%)}
      html.embedded .page-title{background:rgba(255,255,255,.85)!important;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
    `,
    matrix:`
      html.embedded{--matrix-glass:rgba(255,255,255,.85)!important;--matrix-glass-strong:rgba(255,255,255,.85)!important}
      /* Do not let MATRIX's own white roots hide the board background/image. */
      html.embedded .app,html.embedded .workspace,html.embedded .stage-shell,html.embedded .canvas{background:transparent!important}
      html.embedded .stage{background:var(--matrix-glass)!important;backdrop-filter:blur(22px) saturate(135%);-webkit-backdrop-filter:blur(22px) saturate(135%)}
      /* Buttons stay solid white even on a dark/image background. */
      html.embedded .stage-area-toolbar :is(.btn,button),html.embedded .toolbar-scale-check{background:#fff!important}
      /* Same COMMENTS rule in every tab. */
      html.embedded #matrixIconComments{background:transparent!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
      html.embedded .matrix-comment-head{background:#fff!important}
      html.embedded #matrixIconComments>section{background:rgba(255,255,255,.85)!important;backdrop-filter:blur(18px) saturate(125%);-webkit-backdrop-filter:blur(18px) saturate(125%)}
      html.embedded .matrix-comment-card{background:#fff!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
    `,
    sheet:`
      html.embedded{--sheet-glass:rgba(255,255,255,.85)!important;--sheet-glass-strong:rgba(255,255,255,.85)!important}
      /* Do not let SPREADSHEET's own roots hide the shared board background/image. */
      html.embedded .app,html.embedded #tablePanel,html.embedded .database-main,html.embedded #sheetWrap{background:transparent!important}
      html.embedded #databaseLayout,html.embedded #fullCharacterMode{background:var(--sheet-glass)!important;backdrop-filter:blur(22px) saturate(135%);-webkit-backdrop-filter:blur(22px) saturate(135%)}
      /* Same COMMENTS rule in every tab. */
      html.embedded #sheetComments{background:transparent!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
      html.embedded .sheet-comments-head{background:#fff!important}
      html.embedded #sheetComments>section{background:rgba(255,255,255,.85)!important;backdrop-filter:blur(18px) saturate(125%);-webkit-backdrop-filter:blur(18px) saturate(125%)}
      html.embedded #sheetComments article{background:#fff!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
    `
  };

  function apply(frame,scope){
    try{
      const doc=frame?.contentDocument;
      if(!doc?.head)return;
      let style=doc.getElementById(styleId);
      if(!style){style=doc.createElement("style");style.id=styleId;doc.head.append(style)}
      style.textContent=frameStyles[scope]||"";
    }catch{}
  }

  for(const [id,scope] of [["logFrame","log"],["matrixFrame","matrix"],["spreadsheetFrame","sheet"]]){
    const frame=document.getElementById(id);
    if(!frame)continue;
    frame.addEventListener("load",()=>requestAnimationFrame(()=>apply(frame,scope)));
    if(frame.contentDocument?.head)apply(frame,scope);
  }
})();
