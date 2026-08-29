"use strict";
(()=>{
  const boardId=new URL(location.href).searchParams.get("id")||"default";
  const read=()=>{try{return JSON.parse(localStorage.getItem(`jijinboardThemeV2:${boardId}`)||"{}")||{}}catch{return{}}};
  const contrast=hex=>{if(!/^#[0-9a-f]{6}$/i.test(hex||""))return"#fff";const n=parseInt(hex.slice(1),16),rgb=[(n>>16)&255,(n>>8)&255,n&255].map(v=>v/255).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4);return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]>.42?"#20242a":"#fff"};
  function inject(doc,id,text){if(!doc?.head)return;let s=doc.getElementById(id);if(!s){s=doc.createElement("style");s.id=id;doc.head.append(s)}s.textContent=text}
  function apply(detail){
    const t={color1:"#454b54",color2:"#f3f4f6",...read(),...(detail||{})},ink=contrast(t.color1);
    inject(document,"jijinThemeV2Polish",`
      #boardDesignSlot .jijin-theme-grid.two{grid-template-columns:repeat(3,minmax(0,1fr))!important}
      #boardDesignSlot .jijin-bg-modes{grid-template-columns:repeat(3,minmax(0,1fr))!important}
      #boardDesignSlot .jijin-theme-section{background:${t.color2}!important}
      @media(max-width:620px){#boardDesignSlot .jijin-theme-grid.two,#boardDesignSlot .jijin-bg-modes{grid-template-columns:1fr!important}}
    `);
    const matrix=document.getElementById("matrixFrame");
    try{inject(matrix?.contentDocument,"jijinThemeV2MatrixPolish",`
      #matrixIconComments,.matrix-comment-card,.mobile-comment-panel{background:${t.color2}!important}
      .matrix-comment-head,.mobile-comment-head{background:${t.color1}!important;color:${ink}!important}
      .matrix-comment-head *,.mobile-comment-head *{color:${ink}!important}
      .matrix-comment-author button{background:transparent!important;border-color:transparent!important;color:${t.color1}!important}
    `)}catch{}
    const sheet=document.getElementById("spreadsheetFrame");
    try{inject(sheet?.contentDocument,"jijinThemeV2SheetPolish",`
      /* Common colors stop at the sheet chrome. Character pages keep their own inline variables and backgrounds. */
      #fullCharacterMode .full-character-page{background:var(--character-page-bg,var(--character-bg,#fff))}
      #fullCharacterMode .full-character-page .character-sheet-group{background:var(--character-group-bg,transparent)}
      #fullCharacterMode .full-character-page button:not(.full-character-page-gear){background:revert-layer}
    `)}catch{}
  }
  window.addEventListener("jijinboard-theme-change",e=>apply(e.detail));
  for(const id of ["matrixFrame","spreadsheetFrame"]){document.getElementById(id)?.addEventListener("load",()=>apply())}
  apply();
})();