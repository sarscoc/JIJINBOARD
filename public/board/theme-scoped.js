"use strict";
(()=>{
  const boardId=new URL(location.href).searchParams.get("id")||"";
  if(!boardId)return;

  const storageKey=`jijinboardScopedTheme:${boardId}`;
  const themeEndpoint=`/api/boards/${encodeURIComponent(boardId)}/theme`;
  const defaults={
    color1:"#171a20",
    alternateCells:false,
    alternateCellColor:"#f7f7f8"
  };
  let theme=readLocal()||{...defaults};
  let saveTimer=0;
  let uiBuilt=false;

  const validColor=value=>/^#[0-9a-f]{6}$/i.test(String(value||""));
  const hasLegacyTheme=value=>!!value&&typeof value==="object"&&[
    "color2","textColor2","backgroundMode","backgroundColor","backgroundImage"
  ].some(key=>Object.prototype.hasOwnProperty.call(value,key));
  function normalize(value){
    if(!value||typeof value!=="object")return {...defaults};
    return {
      color1:validColor(value.color1)?value.color1:defaults.color1,
      alternateCells:!!value.alternateCells,
      alternateCellColor:validColor(value.alternateCellColor)?value.alternateCellColor:defaults.alternateCellColor
    };
  }
  function readLocal(){
    try{
      const raw=JSON.parse(localStorage.getItem(storageKey)||"null");
      if(!raw)return null;
      const clean=normalize(raw);
      if(hasLegacyTheme(raw))localStorage.setItem(storageKey,JSON.stringify(clean));
      return clean;
    }catch{return null}
  }
  function writeLocal(){try{localStorage.setItem(storageKey,JSON.stringify(theme))}catch{}}
  function adminToken(){
    try{return localStorage.getItem(`boardAdmin:${boardId}`)||JSON.parse(localStorage.getItem("jijinboardOwnedBoards.v1")||"{}")[boardId]?.adminToken||""}
    catch{return localStorage.getItem(`boardAdmin:${boardId}`)||""}
  }

  const whiteGradient=`background-color:#f5f7fa!important;background-image:radial-gradient(circle at 12% 8%,rgba(103,163,255,.24),transparent 28%),radial-gradient(circle at 86% 82%,rgba(159,113,255,.12),transparent 30%)!important;background-attachment:fixed!important;`;

  function parentCss(value){return `
    .topbar .brand,.topbar .presence-person b,.topbar .app-tabs button,
    .log-list-head>span{color:${value.color1}!important}
    .log-sidebar{background:#fff!important}
    .log-list{scrollbar-color:${value.color1} transparent!important}
    .log-list::-webkit-scrollbar-thumb{background:${value.color1}!important;border-radius:999px!important}
  `}
  function logCss(value){return `
    html.embedded body{${whiteGradient}}
    html.embedded #roomTitle{color:#000!important}
    html.embedded .filters :is(input:not([type="range"]),select,button,.quiet,.primary),
    html.embedded .filters .font-size-control{
      background:#fff!important;border-color:#dfe3e8!important;box-shadow:none!important;
    }
    html.embedded .filters :is(input:not([type="range"]),select,button,.quiet,.primary),
    html.embedded .filters .font-size-control,
    html.embedded .filters .font-size-control :is(span,strong),
    html.embedded .comments-head{color:${value.color1}!important}
    html.embedded .filters input::placeholder{color:#79818d!important;opacity:1!important}
    html.embedded .filters input[type="range"]{accent-color:${value.color1}!important}

    html.embedded .log-pane,
    html.embedded .comments-pane{
      background:color-mix(in srgb,var(--paper) 85%,transparent)!important;
      color:var(--ink)!important;border-color:var(--line)!important;
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
    html.embedded .comment-card{background:var(--paper)!important;color:var(--ink)!important;border-color:var(--line)!important}

    html.embedded .tab-arrow,
    html.embedded .slide-btn,
    html.embedded .cylinder-nav button{background:#fff!important;color:#596168!important}
    html.embedded.dark .tab-arrow,
    html.embedded.dark .slide-btn,
    html.embedded.dark .cylinder-nav button{background:var(--paper,#353535)!important;color:var(--ink,#f2f4f7)!important;border-color:var(--line,#5b5b5b)!important}

    html.embedded .page-scroll,html.embedded .comments-list{scrollbar-color:${value.color1} transparent!important}
    html.embedded .page-scroll::-webkit-scrollbar-thumb,html.embedded .comments-list::-webkit-scrollbar-thumb{background:${value.color1}!important;box-shadow:none!important;border:2px solid transparent!important;background-clip:padding-box!important}
  `}
  function matrixCss(value){return `
    html.embedded body{${whiteGradient}}
    html.embedded{--matrix-glass:rgba(255,255,255,.85)!important;--matrix-glass-strong:rgba(255,255,255,.85)!important}
    html.embedded .library,
    html.embedded .stage,
    html.embedded #matrixIconComments>section{
      background:rgba(255,255,255,.85)!important;
      backdrop-filter:blur(14px) saturate(120%)!important;
      -webkit-backdrop-filter:blur(14px) saturate(120%)!important;
    }
    html.embedded .matrix-comment-head,
    html.embedded #matrixIconComments .matrix-comments-body{background:transparent!important}
    html.embedded .stage-area-toolbar :is(button,.btn,.stage-area-label,.toolbar-scale-check),
    html.embedded .matrix-comment-head{color:${value.color1}!important}
    html.embedded .stage-area-toolbar :is(.btn,button),html.embedded .toolbar-scale-check{background:#fff!important}
    html.embedded .library,html.embedded #matrixIconComments>section,html.embedded .template-tabs{scrollbar-color:${value.color1} transparent!important}
    html.embedded .library::-webkit-scrollbar-thumb,html.embedded #matrixIconComments>section::-webkit-scrollbar-thumb,html.embedded .template-tabs::-webkit-scrollbar-thumb{background:${value.color1}!important;border-radius:999px!important}
  `}
  function sheetCss(value){return `
    html.embedded body{${whiteGradient}}
    html.embedded{--sheet-glass:rgba(255,255,255,.85)!important;--sheet-glass-strong:rgba(255,255,255,.85)!important;--sheet-cell:rgba(255,255,255,.85)!important}
    html.embedded #databaseLayout,
    html.embedded #sheetComments>section{
      background:rgba(255,255,255,.85)!important;
      backdrop-filter:blur(14px) saturate(120%)!important;
      -webkit-backdrop-filter:blur(14px) saturate(120%)!important;
    }
    html.embedded .data-sheet thead th,
    html.embedded .data-sheet .item-col,
    html.embedded .group-row td,
    html.embedded .sheet-comments-head,
    html.embedded .table-actions > :is(.btn,button){color:${value.color1}!important}
    html.embedded .data-sheet thead .item-col #sheetModeToggle{color:${value.color1}!important}
    html.embedded .main-mode-switch .btn:not(.on)::after{color:${value.color1}!important}
    html.embedded .group-row td{background:rgba(255,255,255,.85)!important;background-image:none!important}
    html.embedded .sheet-comments-head,
    html.embedded #sheetComments .sheet-comments-body{background:transparent!important}
    ${value.alternateCells?`html.embedded .data-sheet tbody tr:not(.group-row):nth-child(even) td:not(.item-col){background:${value.alternateCellColor}!important;background-image:none!important}`:""}
    html.embedded #sheetWrap,html.embedded #sheetComments>section{scrollbar-color:${value.color1} transparent!important}
    html.embedded #sheetWrap::-webkit-scrollbar-thumb,html.embedded #sheetComments>section::-webkit-scrollbar-thumb{background:${value.color1}!important;border-radius:999px!important}
  `}

  function styleIn(doc,id,css){
    if(!doc?.head)return;
    let style=doc.getElementById(id);
    if(!style){style=doc.createElement("style");style.id=id;doc.head.append(style)}
    style.textContent=css;
  }
  function applyToFrame(frame,scope){
    try{
      const doc=frame?.contentDocument;if(!doc?.head)return;
      styleIn(doc,"jijinboardScopedThemeStyle",scope==="log"?logCss(theme):scope==="matrix"?matrixCss(theme):sheetCss(theme));
    }catch{}
  }
  function applyAll(){
    styleIn(document,"jijinboardScopedThemeStyle",parentCss(theme));
    applyToFrame(document.getElementById("logFrame"),"log");
    applyToFrame(document.getElementById("matrixFrame"),"matrix");
    applyToFrame(document.getElementById("spreadsheetFrame"),"sheet");
  }

  for(const [id,scope] of [["logFrame","log"],["matrixFrame","matrix"],["spreadsheetFrame","sheet"]]){
    document.getElementById(id)?.addEventListener("load",()=>applyToFrame(document.getElementById(id),scope));
  }

  function scheduleSave(){clearTimeout(saveTimer);saveTimer=setTimeout(saveRemote,420)}
  async function saveRemote(){
    const token=adminToken();if(!token)return;
    try{
      const response=await fetch(themeEndpoint,{method:"POST",headers:{"content-type":"application/json","x-board-admin-token":token},body:JSON.stringify({theme})});
      if(!response.ok){const body=await response.json().catch(()=>({}));console.warn(body.error||"Theme save failed")}
    }catch(error){console.warn("Theme save failed",error)}
  }
  async function loadRemote(){
    try{
      const response=await fetch(themeEndpoint);
      if(!response.ok)return;
      const body=await response.json().catch(()=>({}));
      if(body.theme){
        const legacy=hasLegacyTheme(body.theme);
        const next=normalize(body.theme);
        const changed=JSON.stringify(next)!==JSON.stringify(theme);
        theme=next;writeLocal();
        if(changed){applyAll();syncUi()}
        if(legacy&&adminToken())scheduleSave();
      }
    }catch(error){console.warn("Theme load failed",error)}
  }
  async function resetTheme(){
    theme={...defaults};writeLocal();applyAll();syncUi();
    const token=adminToken();if(!token)return;
    try{await fetch(themeEndpoint,{method:"DELETE",headers:{"x-board-admin-token":token}})}catch{}
  }
  function update(patch){
    theme=normalize({...theme,...patch});
    writeLocal();applyAll();syncUi();scheduleSave();
  }

  function installUiStyle(){
    if(document.getElementById("jijinboardScopedThemeUiStyle"))return;
    const style=document.createElement("style");style.id="jijinboardScopedThemeUiStyle";style.textContent=`
      #boardSettingsOverlay .board-settings-design{padding:0!important}
      #boardDesignSlot.scoped-theme-slot{height:100%!important;overflow:auto!important;background:#fff!important}
      .scoped-theme-ui{display:grid;gap:8px;padding:9px;color:#303640;font-size:9px}
      .scoped-theme-section{display:grid;gap:8px;padding:10px;border:1px solid #e4e7ec;border-radius:10px;background:#fff}
      .scoped-theme-head{display:flex;align-items:baseline;gap:8px}.scoped-theme-head b{font-size:10px}.scoped-theme-head span{font-size:8px;color:#8a929d}
      .scoped-theme-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}
      .scoped-theme-field{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:38px;padding:6px 8px;border:1px solid #e5e8ed;border-radius:8px;background:#fafbfc;font-weight:750}
      .scoped-theme-field input[type=color]{width:42px;height:28px;padding:0;border:1px solid #dfe3e8;border-radius:6px;background:transparent}
      .scoped-theme-ui button{height:30px;padding:0 10px;border:1px solid #dfe3e8;border-radius:7px;background:#fff;color:#303640;font-size:9px;cursor:pointer}.scoped-theme-ui button:hover{background:#f7f8fa}
      .scoped-check{justify-content:flex-start}.scoped-check input{width:15px;height:15px;margin:0}
      .scoped-theme-actions{display:flex;justify-content:flex-end}
      @media(max-width:620px){.scoped-theme-grid{grid-template-columns:1fr}}
    `;document.head.append(style);
  }

  function buildUi(){
    const slot=document.getElementById("boardDesignSlot");if(!slot)return;
    installUiStyle();slot.classList.add("scoped-theme-slot");slot.innerHTML=`
      <div class="scoped-theme-ui">
        <section class="scoped-theme-section">
          <div class="scoped-theme-head"><b>共通カラー</b></div>
          <div class="scoped-theme-grid">
            <label class="scoped-theme-field"><span>文字色1</span><input id="scopedColor1" type="color"></label>
            <label class="scoped-theme-field scoped-check"><input id="scopedAlt" type="checkbox"><span>スプシのマスを交互に塗る</span></label>
            <label class="scoped-theme-field"><span>交互マスの色</span><input id="scopedAltColor" type="color"></label>
          </div>
        </section>
        <div class="scoped-theme-actions"><button id="scopedThemeReset" type="button">初期状態に戻す</button></div>
      </div>`;
    uiBuilt=true;
    slot.querySelector("#scopedColor1").addEventListener("input",e=>update({color1:e.target.value}));
    slot.querySelector("#scopedAlt").addEventListener("change",e=>update({alternateCells:e.target.checked}));
    slot.querySelector("#scopedAltColor").addEventListener("input",e=>update({alternateCellColor:e.target.value}));
    slot.querySelector("#scopedThemeReset").onclick=()=>{if(confirm("共通デザイン設定を初期状態に戻しますか？"))resetTheme()};
    syncUi();
  }
  function syncUi(){
    if(!uiBuilt)return;const slot=document.getElementById("boardDesignSlot");if(!slot)return;
    const set=(id,v)=>{const el=slot.querySelector(`#${id}`);if(el)el.value=v};
    set("scopedColor1",theme.color1);set("scopedAltColor",theme.alternateCellColor);
    const alt=slot.querySelector("#scopedAlt");if(alt)alt.checked=!!theme.alternateCells;
  }

  function installDesignTabOverride(){
    const old=document.querySelector('[data-board-settings-tab="design"]'),page=document.querySelector('[data-board-settings-page="design"]');
    if(!old||!page||old.dataset.scopedTheme==="1")return !!old;
    const button=old.cloneNode(true);button.dataset.scopedTheme="1";old.replaceWith(button);
    button.addEventListener("click",()=>{
      document.querySelectorAll("[data-board-settings-tab]").forEach(tab=>tab.classList.toggle("active",tab===button));
      document.querySelectorAll("[data-board-settings-page]").forEach(item=>item.hidden=item!==page);
      if(!uiBuilt)buildUi();else syncUi();
    });
    return true;
  }

  applyAll();
  loadRemote();
  if(!installDesignTabOverride()){
    const observer=new MutationObserver(()=>{if(installDesignTabOverride())observer.disconnect()});
    observer.observe(document.body,{childList:true,subtree:true});
  }
})();
