"use strict";
(()=>{
  const boardId=new URL(location.href).searchParams.get("id")||"";
  if(!boardId)return;

  const storageKey=`jijinboardScopedTheme:${boardId}`;
  const defaults={
    color1:"#171a20",
    color2:"#ffffff",
    backgroundMode:"white-gradient",
    backgroundColor:"#f5f7fa",
    backgroundImage:"",
    alternateCells:false,
    alternateCellColor:"#f7f7f8"
  };
  let theme=readLocal();
  let saveTimer=0;
  let uiBuilt=false;

  const validColor=value=>/^#[0-9a-f]{6}$/i.test(String(value||""));
  function normalize(value){
    if(!value||typeof value!=="object")return null;
    const next={...defaults,...value};
    next.color1=validColor(next.color1)?next.color1:defaults.color1;
    next.color2=validColor(next.color2)?next.color2:defaults.color2;
    next.backgroundColor=validColor(next.backgroundColor)?next.backgroundColor:defaults.backgroundColor;
    next.alternateCellColor=validColor(next.alternateCellColor)?next.alternateCellColor:defaults.alternateCellColor;
    next.backgroundMode=["white-gradient","black-gradient","color","image"].includes(next.backgroundMode)?next.backgroundMode:defaults.backgroundMode;
    next.alternateCells=!!next.alternateCells;
    next.backgroundImage=typeof next.backgroundImage==="string"&&/^data:image\/(?:png|jpe?g|webp);base64,/i.test(next.backgroundImage)?next.backgroundImage:"";
    if(next.backgroundMode==="image"&&!next.backgroundImage)next.backgroundMode="white-gradient";
    return next;
  }
  function readLocal(){try{return normalize(JSON.parse(localStorage.getItem(storageKey)||"null"))}catch{return null}}
  function writeLocal(){try{theme?localStorage.setItem(storageKey,JSON.stringify(theme)):localStorage.removeItem(storageKey)}catch{}}
  function adminToken(){
    try{return localStorage.getItem(`boardAdmin:${boardId}`)||JSON.parse(localStorage.getItem("jijinboardOwnedBoards.v1")||"{}")[boardId]?.adminToken||""}
    catch{return localStorage.getItem(`boardAdmin:${boardId}`)||""}
  }

  function backgroundRules(value){
    if(value.backgroundMode==="black-gradient")return `background-color:#202226!important;background-image:radial-gradient(circle at 12% 8%,rgba(255,255,255,.08),transparent 28%),radial-gradient(circle at 86% 82%,rgba(159,113,255,.16),transparent 30%)!important;background-attachment:fixed!important;`;
    if(value.backgroundMode==="color")return `background-color:${value.backgroundColor}!important;background-image:none!important;background-attachment:fixed!important;`;
    if(value.backgroundMode==="image"&&value.backgroundImage){const image=value.backgroundImage.replace(/["\\\n\r]/g,"");return `background-color:${value.backgroundColor}!important;background-image:url("${image}")!important;background-size:cover!important;background-position:center!important;background-repeat:no-repeat!important;background-attachment:fixed!important;`}
    return `background-color:#f5f7fa!important;background-image:radial-gradient(circle at 12% 8%,rgba(103,163,255,.24),transparent 28%),radial-gradient(circle at 86% 82%,rgba(159,113,255,.12),transparent 30%)!important;background-attachment:fixed!important;`;
  }

  function parentCss(value){return `
    /* Only the red/yellow-marked board-shell targets are themed. */
    .topbar .brand,.topbar .presence-person b,.topbar .app-tabs button{color:${value.color1}!important}
    .log-sidebar{background:${value.color2}!important}
    .log-list{scrollbar-color:${value.color1} transparent!important}
    .log-list::-webkit-scrollbar-thumb{background:${value.color1}!important;border-radius:999px!important}
  `}
  function logCss(value){return `
    html.embedded body{${backgroundRules(value)}}
    html.embedded .filters :is(input,select,button,.quiet,.primary),
    html.embedded .filters .font-size-control,
    html.embedded .filters .font-size-control :is(span,strong),
    html.embedded .comments-head{color:${value.color1}!important}
    html.embedded .filters input::placeholder{color:${value.color1}!important;opacity:.48!important}
    html.embedded .filters input[type="range"]{accent-color:${value.color1}!important}
    html.embedded:not(.dark) .comments-list{background:${value.color2}!important}
    html.embedded .page-scroll,html.embedded .comments-list{scrollbar-color:${value.color1} transparent!important}
    html.embedded .page-scroll::-webkit-scrollbar-thumb,html.embedded .comments-list::-webkit-scrollbar-thumb{background:${value.color1}!important;box-shadow:none!important;border:2px solid transparent!important;background-clip:padding-box!important}
  `}
  function matrixCss(value){return `
    html.embedded body{${backgroundRules(value)}}
    html.embedded .library{background:${value.color2}!important}
    html.embedded #matrixIconComments>section{background:${value.color2}!important}
    html.embedded .stage-area-toolbar :is(button,.btn,.stage-area-label,.toolbar-scale-check),
    html.embedded .matrix-comment-head{color:${value.color1}!important}
    html.embedded .library,html.embedded #matrixIconComments>section,html.embedded .template-tabs{scrollbar-color:${value.color1} transparent!important}
    html.embedded .library::-webkit-scrollbar-thumb,html.embedded #matrixIconComments>section::-webkit-scrollbar-thumb,html.embedded .template-tabs::-webkit-scrollbar-thumb{background:${value.color1}!important;border-radius:999px!important}
  `}
  function sheetCss(value){return `
    html.embedded body{${backgroundRules(value)}}
    html.embedded .data-sheet thead th,
    html.embedded .data-sheet .item-col,
    html.embedded .group-row td,
    html.embedded #sheetModeToggle,
    html.embedded .sheet-comments-head,
    html.embedded .table-actions > :is(.btn,button){color:${value.color1}!important}
    html.embedded .main-mode-switch .btn:not(.on)::after{color:${value.color1}!important}
    html.embedded .group-row td{background:${value.color2}!important;background-image:none!important}
    html.embedded #sheetComments>section{background:${value.color2}!important}
    ${value.alternateCells?`html.embedded .data-sheet tbody tr:not(.group-row):nth-child(even) td:not(.item-col){background:${value.alternateCellColor}!important;background-image:none!important}`:""}
    html.embedded #sheetWrap,html.embedded #sheetComments>section{scrollbar-color:${value.color1} transparent!important}
    html.embedded #sheetWrap::-webkit-scrollbar-thumb,html.embedded #sheetComments>section::-webkit-scrollbar-thumb{background:${value.color1}!important;border-radius:999px!important}
    /* Character individual pages are deliberately not targeted here. */
  `}

  function styleIn(doc,id,css){
    if(!doc?.head)return;
    let style=doc.getElementById(id);
    if(!style){style=doc.createElement("style");style.id=id;doc.head.append(style)}
    style.textContent=css;
  }
  function clearIn(doc,id){try{doc?.getElementById(id)?.remove()}catch{}}
  function applyToFrame(frame,scope){
    if(!theme)return;
    try{
      const doc=frame?.contentDocument;if(!doc?.head)return;
      styleIn(doc,"jijinboardScopedThemeStyle",scope==="log"?logCss(theme):scope==="matrix"?matrixCss(theme):sheetCss(theme));
    }catch{}
  }
  function applyAll(){
    if(!theme){clearAll();return}
    styleIn(document,"jijinboardScopedThemeStyle",parentCss(theme));
    applyToFrame(document.getElementById("logFrame"),"log");
    applyToFrame(document.getElementById("matrixFrame"),"matrix");
    applyToFrame(document.getElementById("spreadsheetFrame"),"sheet");
  }
  function clearAll(){
    clearIn(document,"jijinboardScopedThemeStyle");
    for(const id of ["logFrame","matrixFrame","spreadsheetFrame"]){try{clearIn(document.getElementById(id)?.contentDocument,"jijinboardScopedThemeStyle")}catch{}}
  }

  for(const [id,scope] of [["logFrame","log"],["matrixFrame","matrix"],["spreadsheetFrame","sheet"]]){
    document.getElementById(id)?.addEventListener("load",()=>setTimeout(()=>applyToFrame(document.getElementById(id),scope),0));
  }

  function scheduleSave(){clearTimeout(saveTimer);saveTimer=setTimeout(saveRemote,420)}
  async function saveRemote(){
    if(!theme)return;
    const token=adminToken();if(!token)return;
    try{
      const response=await fetch(`/api/boards/${encodeURIComponent(boardId)}/theme`,{method:"POST",headers:{"content-type":"application/json","x-board-admin-token":token},body:JSON.stringify({theme})});
      if(!response.ok){const body=await response.json().catch(()=>({}));console.warn(body.error||"Theme save failed")}
    }catch(error){console.warn("Theme save failed",error)}
  }
  async function loadRemote(){
    try{
      const response=await fetch(`/api/boards/${encodeURIComponent(boardId)}/theme`);
      if(!response.ok)return;
      const body=await response.json().catch(()=>({}));
      if(body.theme){theme=normalize(body.theme);writeLocal();applyAll();syncUi()}
      else if(!theme){clearAll()}
    }catch(error){console.warn("Theme load failed",error)}
  }
  async function resetTheme(){
    theme=null;writeLocal();clearAll();syncUi();
    const token=adminToken();if(!token)return;
    try{await fetch(`/api/boards/${encodeURIComponent(boardId)}/theme`,{method:"DELETE",headers:{"x-board-admin-token":token}})}catch{}
  }
  function update(patch){
    theme=normalize({...defaults,...(theme||{}),...patch});
    writeLocal();applyAll();syncUi();scheduleSave();
  }

  async function imageToData(file){
    if(!file)return"";
    const bitmap=await createImageBitmap(file);
    let max=1500,quality=.76,data="";
    for(let attempt=0;attempt<5;attempt++){
      const scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height));
      const canvas=document.createElement("canvas");
      canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      canvas.getContext("2d").drawImage(bitmap,0,0,canvas.width,canvas.height);
      data=canvas.toDataURL("image/webp",quality);
      if(data.length<=600000)break;
      max=Math.round(max*.78);quality=Math.max(.52,quality-.07);
    }
    bitmap.close?.();
    if(data.length>650000)throw new Error("背景画像をもう少し小さくしてください");
    return data;
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
      .scoped-bg-modes{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.scoped-bg-modes label{display:flex;align-items:center;gap:5px;padding:7px;border:1px solid #e5e8ed;border-radius:8px;background:#fafbfc;cursor:pointer}
      .scoped-theme-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto;gap:7px;align-items:center}.scoped-image-state{font-size:8px;color:#8a929d;white-space:nowrap}
      .scoped-theme-ui button{height:30px;padding:0 10px;border:1px solid #dfe3e8;border-radius:7px;background:#fff;color:#303640;font-size:9px;cursor:pointer}.scoped-theme-ui button:hover{background:#f7f8fa}
      .scoped-check{justify-content:flex-start}.scoped-check input{width:15px;height:15px;margin:0}
      .scoped-theme-note{font-size:8px;line-height:1.55;color:#8a929d}.scoped-theme-actions{display:flex;justify-content:flex-end}
      @media(max-width:620px){.scoped-theme-grid{grid-template-columns:1fr}.scoped-bg-modes{grid-template-columns:repeat(2,minmax(0,1fr))}.scoped-theme-row{grid-template-columns:1fr}}
    `;document.head.append(style);
  }

  function buildUi(){
    const slot=document.getElementById("boardDesignSlot");if(!slot)return;
    installUiStyle();slot.classList.add("scoped-theme-slot");slot.innerHTML=`
      <div class="scoped-theme-ui">
        <section class="scoped-theme-section">
          <div class="scoped-theme-head"><b>共通カラー</b><span>指定した場所だけを変更します。</span></div>
          <div class="scoped-theme-grid">
            <label class="scoped-theme-field"><span>文字色1</span><input id="scopedColor1" type="color"></label>
            <label class="scoped-theme-field"><span>色2</span><input id="scopedColor2" type="color"></label>
            <label class="scoped-theme-field scoped-check"><input id="scopedAlt" type="checkbox"><span>スプシのマスを交互に塗る</span></label>
          </div>
          <div class="scoped-theme-grid">
            <label class="scoped-theme-field"><span>交互マスの色</span><input id="scopedAltColor" type="color"></label>
          </div>
        </section>
        <section class="scoped-theme-section">
          <div class="scoped-theme-head"><b>背景</b><span>今グラデーションが入っている場所だけを変更します。</span></div>
          <div class="scoped-bg-modes">
            <label><input type="radio" name="scopedBgMode" value="white-gradient"><span>白グラデーション</span></label>
            <label><input type="radio" name="scopedBgMode" value="black-gradient"><span>黒グラデーション</span></label>
            <label><input type="radio" name="scopedBgMode" value="color"><span>色選択</span></label>
            <label><input type="radio" name="scopedBgMode" value="image"><span>背景画像</span></label>
          </div>
          <div class="scoped-theme-row">
            <label class="scoped-theme-field"><span>背景色</span><input id="scopedBgColor" type="color"></label>
            <div><input id="scopedBgImage" type="file" accept="image/*" hidden><button id="scopedBgImageBtn" type="button">背景画像を選択</button> <span id="scopedBgImageState" class="scoped-image-state"></span></div>
            <button id="scopedBgImageRemove" type="button">画像を削除</button>
          </div>
        </section>
        <section class="scoped-theme-section">
          <div class="scoped-theme-head"><b>Character個別ページ</b><span>ここは共通設定の対象外です。</span></div>
          <div class="scoped-theme-note">個別ページは今まで通り、各Characterの設定から色・背景画像などを自由に変更できます。既存の個別設定にも触れません。</div>
        </section>
        <div class="scoped-theme-actions"><button id="scopedThemeReset" type="button">この共通デザインを初期状態に戻す</button></div>
      </div>`;
    uiBuilt=true;
    slot.querySelector("#scopedColor1").addEventListener("input",e=>update({color1:e.target.value}));
    slot.querySelector("#scopedColor2").addEventListener("input",e=>update({color2:e.target.value}));
    slot.querySelector("#scopedAlt").addEventListener("change",e=>update({alternateCells:e.target.checked}));
    slot.querySelector("#scopedAltColor").addEventListener("input",e=>update({alternateCellColor:e.target.value}));
    slot.querySelector("#scopedBgColor").addEventListener("input",e=>update({backgroundColor:e.target.value,backgroundMode:"color"}));
    slot.querySelectorAll('input[name="scopedBgMode"]').forEach(input=>input.addEventListener("change",e=>{if(e.target.checked)update({backgroundMode:e.target.value})}));
    const file=slot.querySelector("#scopedBgImage");slot.querySelector("#scopedBgImageBtn").onclick=()=>file.click();
    file.addEventListener("change",async()=>{const picked=file.files?.[0];if(!picked)return;try{const data=await imageToData(picked);update({backgroundImage:data,backgroundMode:"image"})}catch(error){alert(error.message)}finally{file.value=""}});
    slot.querySelector("#scopedBgImageRemove").onclick=()=>update({backgroundImage:"",backgroundMode:theme?.backgroundMode==="image"?"white-gradient":theme?.backgroundMode||"white-gradient"});
    slot.querySelector("#scopedThemeReset").onclick=()=>{if(confirm("共通デザイン設定を初期状態に戻しますか？\nCharacter個別ページの設定は消えません。"))resetTheme()};
    syncUi();
  }
  function syncUi(){
    if(!uiBuilt)return;const slot=document.getElementById("boardDesignSlot");if(!slot)return;
    const value=theme||defaults;
    const set=(id,v)=>{const el=slot.querySelector(`#${id}`);if(el)el.value=v};
    set("scopedColor1",value.color1);set("scopedColor2",value.color2);set("scopedAltColor",value.alternateCellColor);set("scopedBgColor",value.backgroundColor);
    const alt=slot.querySelector("#scopedAlt");if(alt)alt.checked=!!value.alternateCells;
    slot.querySelectorAll('input[name="scopedBgMode"]').forEach(input=>input.checked=input.value===value.backgroundMode);
    const state=slot.querySelector("#scopedBgImageState");if(state)state.textContent=value.backgroundImage?"設定済み":"未設定";
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

  if(theme)applyAll();
  loadRemote();
  if(!installDesignTabOverride()){
    let tries=0;const timer=setInterval(()=>{tries++;if(installDesignTabOverride()||tries>80)clearInterval(timer)},50);
  }
})();
