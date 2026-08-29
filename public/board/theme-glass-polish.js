"use strict";
(()=>{
  const styleId="jijinboardGlassPolish";
  const frameStyles={
    log:`
      /* Same COMMENTS rule in every embedded tool: white header, transparent body. */
      html.embedded .comments-pane{background:transparent!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
      html.embedded .comments-head{background:#fff!important}
      html.embedded .comments-list{background:transparent!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
      html.embedded .tab-arrow{background:#fff!important}
      /* Keep the remaining translucent navigation just a little easier to read. */
      html.embedded .tab-navigation{background:color-mix(in srgb,var(--paper,#fff) 92%,transparent)!important;backdrop-filter:blur(10px) saturate(125%);-webkit-backdrop-filter:blur(10px) saturate(125%)}
      html.embedded .page-title{background:color-mix(in srgb,var(--paper,#fff) 95%,transparent)!important}
    `,
    matrix:`
      html.embedded{--matrix-glass:rgba(255,255,255,.70)!important;--matrix-glass-strong:rgba(255,255,255,.87)!important}
      html.embedded #matrixIconComments{background:transparent!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
      html.embedded .matrix-comment-head{background:#fff!important}
      html.embedded #matrixIconComments>section{background:transparent!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
      /* Slightly less transparent than before, while keeping the glass look. */
      html.embedded .stage{background:var(--matrix-glass)!important}
      html.embedded .stage-area-toolbar :is(.btn,button),html.embedded .toolbar-scale-check{background:var(--matrix-glass-strong)!important}
    `,
    sheet:`
      html.embedded{--sheet-glass:rgba(255,255,255,.70)!important;--sheet-glass-strong:rgba(255,255,255,.87)!important;--sheet-cell:rgba(255,255,255,.93)!important}
      html.embedded #sheetComments{background:transparent!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
      html.embedded .sheet-comments-head{background:#fff!important}
      html.embedded #sheetComments>section{background:transparent!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
      /* Slightly less transparent than before, while keeping the glass look. */
      html.embedded #databaseLayout,html.embedded #fullCharacterMode{background:var(--sheet-glass)!important}
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
