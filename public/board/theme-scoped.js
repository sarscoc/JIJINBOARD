"use strict";
(()=>{
  const boardId=new URL(location.href).searchParams.get("id")||"";
  if(!boardId)return;

  const storageKey=`jijinboardScopedTheme:${boardId}`;
  const themeEndpoint=`/api/boards/${encodeURIComponent(boardId)}/theme`;
  const defaults={color1:"#171a20",alternateCells:false,alternateCellColor:"#f7f7f8",gradientColor1:"#67a3ff",gradientColor2:"#9f71ff"};
  const validColor=value=>/^#[0-9a-f]{6}$/i.test(String(value||""));
  const normalize=value=>({
    color1:validColor(value?.color1)?value.color1:defaults.color1,
    alternateCells:!!value?.alternateCells,
    alternateCellColor:validColor(value?.alternateCellColor)?value.alternateCellColor:defaults.alternateCellColor,
    gradientColor1:validColor(value?.gradientColor1)?value.gradientColor1:defaults.gradientColor1,
    gradientColor2:validColor(value?.gradientColor2)?value.gradientColor2:defaults.gradientColor2
  });
  function readLocal(){try{const raw=JSON.parse(localStorage.getItem(storageKey)||"null");if(!raw)return null;const clean=normalize(raw);if(JSON.stringify(clean)!==JSON.stringify(raw))localStorage.setItem(storageKey,JSON.stringify(clean));return clean}catch{return null}}
  const localTheme=readLocal();
  let theme=localTheme||{...defaults};
  let saveTimer=0,uiBuilt=false,remoteLoaded=false,remoteLoading=false,editVersion=0,dirty=false;
  let saveChain=Promise.resolve();

  function writeLocal(){try{localStorage.setItem(storageKey,JSON.stringify(theme))}catch{}}
  function adminToken(){try{return localStorage.getItem(`boardAdmin:${boardId}`)||JSON.parse(localStorage.getItem("jijinboardOwnedBoards.v1")||"{}")[boardId]?.adminToken||""}catch{return localStorage.getItem(`boardAdmin:${boardId}`)||""}}

  const uiInk="rgb(75,75,75)";
  const noBlur="backdrop-filter:none!important;-webkit-backdrop-filter:none!important;";
  const hexRgba=(hex,alpha)=>{const value=validColor(hex)?hex:"#000000",n=parseInt(value.slice(1),16);return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${alpha})`};

  function parentCss(value){return `
    :root{--jijin-pre-color1:${value.color1}}
    .log-sidebar{background:#fff!important}
    .log-item.active{border-left-color:${value.color1}!important}
    .log-list{scrollbar-color:${value.color1} transparent!important}
    .log-list::-webkit-scrollbar-thumb{background:${value.color1}!important;border-radius:999px!important}
  `}
  function logCss(value){return `
    html.embedded{--log-loader-color:${value.color1};--shadow:none!important}
    html.embedded body,html.embedded body *{box-shadow:none!important}
    html.embedded,html.embedded body{background:transparent!important;background-image:none!important;transition:none!important}
    html.embedded.dark,html.embedded.dark body{background:#424242!important;background-image:none!important}
    html.embedded #roomTitle{color:${uiInk}!important}
    html.embedded .filters :is(input:not([type="range"]),select,button,.quiet,.primary),html.embedded .filters .font-size-control{background:#fff!important;border-color:#dfe3e8!important;box-shadow:none!important;color:${uiInk}!important}
    html.embedded .filters .font-size-control :is(span,strong){color:${uiInk}!important}
    html.embedded .comments-head{color:${value.color1}!important}
    html.embedded .typing-comment{border-left-color:${value.color1}!important}
    html.embedded .typing-comment>i{background:${value.color1}!important}
    html.embedded .filters input::placeholder{color:${uiInk}!important;opacity:1!important}
    html.embedded .filters input[type="range"]{accent-color:${value.color1}!important}
    html.embedded .font-size-control input::-webkit-slider-runnable-track{background:linear-gradient(90deg,${value.gradientColor1},${value.gradientColor2})!important}
    html.embedded .font-size-control input::-moz-range-track{background:linear-gradient(90deg,${value.gradientColor1},${value.gradientColor2})!important}
    html.embedded .font-size-control input::-webkit-slider-thumb{background:linear-gradient(90deg,${value.gradientColor1},${value.gradientColor2})!important;box-shadow:0 1px 7px ${hexRgba(value.gradientColor1,.4)}!important}
    html.embedded .font-size-control input::-moz-range-thumb{background:linear-gradient(90deg,${value.gradientColor1},${value.gradientColor2})!important;box-shadow:0 1px 7px ${hexRgba(value.gradientColor1,.4)}!important}
    html.embedded .log-pane,html.embedded .comments-pane{background:#fff!important;color:var(--ink)!important;border-color:var(--line)!important;${noBlur}}
    html.embedded.dark .log-pane,html.embedded.dark .comments-pane{background:#353535!important}
    html.embedded .comments-pane:has(.comments-list>.empty){height:160px!important;min-height:160px!important;max-height:160px!important;align-self:start!important}
    html.embedded .cylinder-nav,html.embedded .page-title,html.embedded .tab-navigation,html.embedded .comments-head,html.embedded .comments-list{background:transparent!important;${noBlur}}
    html.embedded .comment-card{background:var(--paper)!important;color:var(--ink)!important;border-color:var(--line)!important;border-left:3px solid var(--line)!important;${noBlur}}
    html.embedded .comment-card.focused{border-left-color:var(--comment-marker,var(--mark))!important}
    html.embedded .tab-arrow,html.embedded .slide-btn,html.embedded .cylinder-nav button{background:#fff!important;color:#596168!important}
    html.embedded.dark .tab-arrow,html.embedded.dark .slide-btn,html.embedded.dark .cylinder-nav button{background:var(--paper,#353535)!important;color:var(--ink,#f2f4f7)!important;border-color:var(--line,#5b5b5b)!important}
    html.embedded .page-scroll,html.embedded .comments-list{scrollbar-color:${value.color1} transparent!important}
    html.embedded .page-scroll::-webkit-scrollbar-thumb,html.embedded .comments-list::-webkit-scrollbar-thumb{background:${value.color1}!important;box-shadow:none!important;border:2px solid transparent!important;background-clip:padding-box!important}
  `}
  function matrixCss(value){return `
    html.embedded,html.embedded body{background:transparent!important;background-image:none!important;transition:none!important}
    html.embedded{--matrix-glass:rgba(255,255,255,.85)!important;--matrix-glass-strong:rgba(255,255,255,.85)!important}
    html.embedded .library,html.embedded .stage,html.embedded #matrixIconComments>section{background:rgba(255,255,255,.85)!important;${noBlur}}
    html.embedded .matrix-comment-head,html.embedded #matrixIconComments .matrix-comments-body{background:transparent!important;${noBlur}}
    html.embedded .stage-area-toolbar :is(button,.btn,.stage-area-label,.toolbar-scale-check),html.embedded .stage-area-toolbar :is(span,strong,label){color:${uiInk}!important}
    html.embedded .matrix-comment-head{color:${value.color1}!important}
    html.embedded{--matrix-note-accent:${value.color1}}
    html.embedded .stage-area-toolbar :is(.btn,button),html.embedded .toolbar-scale-check{background:#fff!important}
    html.embedded .library,html.embedded #matrixIconComments>section,html.embedded .template-tabs{scrollbar-color:${value.color1} transparent!important}
    html.embedded .library::-webkit-scrollbar-thumb,html.embedded #matrixIconComments>section::-webkit-scrollbar-thumb,html.embedded .template-tabs::-webkit-scrollbar-thumb{background:${value.color1}!important;border-radius:999px!important}
  `}
  function sheetCss(value){return `
    html.embedded #sheetZoomControl input::-webkit-slider-runnable-track{background:linear-gradient(90deg,${value.gradientColor1},${value.gradientColor2})!important}
    html.embedded #sheetZoomControl input::-moz-range-track{background:linear-gradient(90deg,${value.gradientColor1},${value.gradientColor2})!important}
    html.embedded #sheetZoomControl input::-webkit-slider-thumb{background:linear-gradient(90deg,${value.gradientColor1},${value.gradientColor2})!important;box-shadow:0 1px 7px ${hexRgba(value.gradientColor1,.4)}!important}
    html.embedded #sheetZoomControl input::-moz-range-thumb{background:linear-gradient(90deg,${value.gradientColor1},${value.gradientColor2})!important;box-shadow:0 1px 7px ${hexRgba(value.gradientColor1,.4)}!important}

    html.embedded,html.embedded body{background:transparent!important;background-image:none!important;transition:none!important}
    html.embedded{--sheet-glass:rgba(255,255,255,.85)!important;--sheet-glass-strong:rgba(255,255,255,.85)!important;--sheet-cell:rgba(255,255,255,.85)!important}
    html.embedded #databaseLayout,html.embedded #sheetComments>section{background:rgba(255,255,255,.85)!important;${noBlur}}
    html.embedded .table-actions > :is(.btn,button),html.embedded .table-actions .btn,html.embedded .view-switch .btn,
    html.embedded .data-sheet thead th,html.embedded .data-sheet .item-col,html.embedded .group-row td,
    html.embedded .item-main,html.embedded .item-source,html.embedded .part-value,html.embedded .mini,html.embedded .status,
    html.embedded .axis-label,html.embedded .axis-label span,html.embedded .jump-btn{color:${uiInk}!important}
    html.embedded #mainDatabaseModeBtn,html.embedded #mainCharacterModeBtn,
    html.embedded #mainDatabaseModeBtn::before,html.embedded #mainDatabaseModeBtn::after,
    html.embedded #mainCharacterModeBtn::before,html.embedded #mainCharacterModeBtn::after{color:${uiInk}!important}
    html.embedded .sheet-comments-head,html.embedded .sheet-comments-head :is(b,strong,span){color:${value.color1}!important}
    html.embedded .data-sheet thead .item-col #sheetModeToggle,html.embedded .main-mode-switch .btn:not(.on)::after{color:${uiInk}!important}
    html.embedded .group-row td{background:rgba(255,255,255,.85)!important;background-image:none!important}
    html.embedded .sheet-comments-head,html.embedded #sheetComments .sheet-comments-body{background:transparent!important;${noBlur}}
    ${value.alternateCells?`html.embedded .data-sheet tbody tr:not(.group-row):nth-child(even) td:not(.item-col){background:${value.alternateCellColor}!important;background-image:none!important}`:""}
    html.embedded #sheetWrap,html.embedded #sheetComments>section{scrollbar-color:${value.color1} transparent!important}
    html.embedded #sheetWrap::-webkit-scrollbar-thumb,html.embedded #sheetComments>section::-webkit-scrollbar-thumb{background:${value.color1}!important;border-radius:999px!important}
  `}

  function styleIn(doc,id,css){if(!doc?.head)return;let style=doc.getElementById(id);if(!style){style=doc.createElement("style");style.id=id;doc.head.append(style)}if(style.textContent!==css)style.textContent=css}
  // Child heads call this synchronously, before their first paint.
  window.JIJINBOARD_APPLY_FRAME_THEME=(doc,scope)=>{
    styleIn(doc,"jijinboardScopedThemeStyle",scope==="log"?logCss(theme):scope==="matrix"?matrixCss(theme):sheetCss(theme));
  };
  function applyToFrame(frame,scope){try{const doc=frame?.contentDocument;if(!doc?.head)return;styleIn(doc,"jijinboardScopedThemeStyle",scope==="log"?logCss(theme):scope==="matrix"?matrixCss(theme):sheetCss(theme))}catch{}}
  function applyAll(){
    document.documentElement.style.setProperty("--jijin-pre-color1",theme.color1);
    document.documentElement.style.setProperty("--jijin-background-one",hexRgba(theme.gradientColor1,.24));
    document.documentElement.style.setProperty("--jijin-background-two",hexRgba(theme.gradientColor2,.12));
    window.dispatchEvent(new Event("jijinboard-theme-updated"));
    let icon=document.querySelector('link[data-board-favicon]');
    if(!icon){icon=document.createElement('link');icon.rel='icon';icon.type='image/svg+xml';icon.dataset.boardFavicon='1';document.head.append(icon)}
    const brand=document.querySelector('.board-brand-kicker:not(.hidden)')||document.querySelector('.board-brand-kicker');
    const font=brand?getComputedStyle(brand):null;
    const xml=value=>String(value).replace(/[&<>"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char]));
    const family=xml(font?.fontFamily||'system-ui, sans-serif'),weight=xml(font?.fontWeight||'900');
    icon.href='data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="5" y="5" width="54" height="54" rx="5" fill="none" stroke="${theme.color1}" stroke-width="5"/><text x="32" y="46" text-anchor="middle" font-family="${family}" font-size="42" font-weight="${weight}" fill="${theme.color1}">J</text></svg>`);
styleIn(document,"jijinboardScopedThemeStyle",parentCss(theme));applyToFrame(document.getElementById("logFrame"),"log");applyToFrame(document.getElementById("matrixFrame"),"matrix");applyToFrame(document.getElementById("spreadsheetFrame"),"sheet")}
  for(const [id,scope] of [["logFrame","log"],["matrixFrame","matrix"],["spreadsheetFrame","sheet"]])document.getElementById(id)?.addEventListener("load",()=>applyToFrame(document.getElementById(id),scope));

  function scheduleSave(){clearTimeout(saveTimer);saveTimer=setTimeout(saveRemote,500)}
  function saveRemote(){
    const token=adminToken();if(!token)return Promise.resolve();
    const version=editVersion,body=JSON.stringify({theme});
    const task=saveChain.then(async()=>{
      const response=await fetch(themeEndpoint,{method:"POST",headers:{"content-type":"application/json","x-board-admin-token":token},body});
      if(response.ok&&version===editVersion)dirty=false;
    });
    saveChain=task.catch(()=>{});return saveChain;
  }
  async function loadRemote(force=false){
    if((remoteLoaded&&!force)||remoteLoading||dirty)return;
    remoteLoading=true;const version=editVersion;
    try{
      const response=await fetch(themeEndpoint,{cache:"no-store"});if(!response.ok)return;
      const body=await response.json();if(!body||!Object.hasOwn(body,"theme"))return;
      // A response started before a local edit must never replace that edit.
      if(version!==editVersion||dirty)return;
      theme=normalize(body.theme);writeLocal();applyAll();syncUi();remoteLoaded=true;
    }catch{}finally{remoteLoading=false}
  }
  function idleLoadRemote(){const run=()=>loadRemote();if("requestIdleCallback" in window)requestIdleCallback(run,{timeout:1800});else setTimeout(run,900)}
  async function resetTheme(){
    editVersion++;dirty=true;clearTimeout(saveTimer);theme={...defaults};writeLocal();applyAll();syncUi();
    // Persist the current defaults through the same ordered writer as color edits.
    await saveRemote();
  }
  function update(patch){editVersion++;dirty=true;theme=normalize({...theme,...patch});writeLocal();applyAll();syncUi();scheduleSave()}

  function installUiStyle(){if(document.getElementById("jijinboardScopedThemeUiStyle"))return;const style=document.createElement("style");style.id="jijinboardScopedThemeUiStyle";style.textContent=`
    .scoped-theme-preview{border:1px solid #eee3f1;border-radius:10px;padding:16px 10px;font-size:11px;text-align:center}
    .scoped-owner-note{font-size:9px;color:#ab97b0;margin:0 6px}.scoped-theme-section{border-color:#eee3f1!important;border-radius:12px!important}.scoped-theme-head b{color:#927b9a}.scoped-theme-field{background:#fdfafe!important;border-color:#eee5f1!important;border-radius:10px!important}
    #boardSettingsOverlay .board-settings-design{padding:0!important}
    #boardDesignSlot.scoped-theme-slot{height:100%!important;overflow:auto!important;background:#fff!important}
    .scoped-theme-ui{display:grid;gap:8px;padding:9px;color:#303640;font-size:9px}.scoped-theme-section{display:grid;gap:8px;padding:10px;border:1px solid #e4e7ec;border-radius:10px;background:#fff}
    .scoped-theme-head{display:flex;align-items:center;gap:8px}.scoped-theme-head b{font-size:10px}.scoped-theme-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}
    .scoped-theme-field{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:38px;padding:6px 8px;border:1px solid #e5e8ed;border-radius:8px;background:#fafbfc;font-weight:750}.scoped-theme-field input[type=color]{width:42px;height:28px;padding:0;border:1px solid #dfe3e8;border-radius:6px;background:transparent}
    .scoped-theme-ui button{height:30px;padding:0 10px;border:1px solid #dfe3e8;border-radius:7px;background:#fff;color:#303640;font-size:9px;cursor:pointer}.scoped-check{justify-content:flex-start}.scoped-check input{width:15px;height:15px;margin:0}.scoped-theme-actions{display:flex;justify-content:flex-end}@media(max-width:620px){.scoped-theme-grid{grid-template-columns:1fr}}
  `;document.head.append(style)}
  function buildUi(){const slot=document.getElementById("boardDesignSlot");if(!slot)return;installUiStyle();slot.classList.add("scoped-theme-slot");slot.innerHTML=`<div class="scoped-theme-ui"><section class="scoped-theme-section"><div class="scoped-theme-head"><b>テーマと背景</b></div><div class="scoped-theme-grid"><label class="scoped-theme-field"><span>テーマカラー</span><input id="scopedColor1" type="color"></label><label class="scoped-theme-field"><span>背景の色1</span><input id="scopedGradient1" type="color"></label><label class="scoped-theme-field"><span>背景の色2</span><input id="scopedGradient2" type="color"></label></div><div class="scoped-theme-preview">共通カラーのプレビュー</div></section><section id="scopedSheetsSettings" class="scoped-theme-section"><div class="scoped-theme-head"><b>Sheetsの表示</b></div><label class="scoped-theme-field scoped-check"><input id="scopedAlt" type="checkbox"><span>マスを交互に塗る</span></label><label class="scoped-theme-field"><span>交互マスの色</span><input id="scopedAltColor" type="color"></label><div data-sheet-group-slot></div></section><div class="scoped-theme-actions"><button id="scopedThemeReset" type="button">テーマ設定を初期状態に戻す</button></div><p class="scoped-owner-note">共通設定は部屋主が変更できます。</p></div>`;uiBuilt=true;slot.querySelector("#scopedColor1").addEventListener("input",e=>update({color1:e.target.value}));slot.querySelector("#scopedGradient1").addEventListener("input",e=>update({gradientColor1:e.target.value}));slot.querySelector("#scopedGradient2").addEventListener("input",e=>update({gradientColor2:e.target.value}));slot.querySelector("#scopedAlt").addEventListener("change",e=>update({alternateCells:e.target.checked}));slot.querySelector("#scopedAltColor").addEventListener("input",e=>update({alternateCellColor:e.target.value}));slot.querySelector("#scopedThemeReset").onclick=()=>{if(confirm("共通デザイン設定を初期状態に戻しますか？"))resetTheme()};syncUi();window.dispatchEvent(new Event('jijinboard-common-settings-ready'))}
  function syncUi(){if(!uiBuilt)return;const slot=document.getElementById("boardDesignSlot");if(!slot)return;const set=(id,v)=>{const el=slot.querySelector(`#${id}`);if(el)el.value=v};set("scopedColor1",theme.color1);set("scopedGradient1",theme.gradientColor1);set("scopedGradient2",theme.gradientColor2);set("scopedAltColor",theme.alternateCellColor);const alt=slot.querySelector("#scopedAlt");if(alt)alt.checked=!!theme.alternateCells;const preview=slot.querySelector('.scoped-theme-preview');if(preview){preview.style.background=`linear-gradient(110deg,${hexRgba(theme.gradientColor1,.18)},${hexRgba(theme.gradientColor2,.15)})`;preview.style.color=theme.color1}const owner=!!adminToken();slot.querySelectorAll('input,button').forEach(input=>input.disabled=!owner);slot.querySelector('.scoped-owner-note').hidden=owner}
  window.JijinBoardTheme={open(){if(!uiBuilt)buildUi();else syncUi();loadRemote(true)}};
  window.addEventListener("focus",()=>loadRemote(true));
  window.addEventListener("storage",event=>{if(event.key===storageKey)loadRemote(true)});

  window.addEventListener('jijinboard-resource-change',event=>{if(event.detail?.action==='board-theme')loadRemote(true)});
  window.addEventListener('jijinboard-reconnected',()=>loadRemote(true));
  applyAll();
  idleLoadRemote();
})();
