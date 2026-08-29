"use strict";
(()=>{
  const params=new URL(location.href).searchParams;
  const boardId=params.get("id")||"";
  const cacheKey=`jijinboardThemeV2:${boardId||"default"}`;
  const defaults={
    color1:"#454b54",
    color2:"#f3f4f6",
    backgroundMode:"white-gradient",
    backgroundColor:"#ffffff",
    backgroundImage:"",
    alternateCells:false,
    alternateCellColor:"#f7f7f8"
  };
  let theme=loadLocal();
  let saveTimer=0;

  function loadLocal(){
    try{return {...defaults,...JSON.parse(localStorage.getItem(cacheKey)||"{}")}}
    catch{return {...defaults}}
  }
  function normalize(input){
    const next={...defaults,...(input||{})};
    if(!/^#[0-9a-f]{6}$/i.test(next.color1))next.color1=defaults.color1;
    if(!/^#[0-9a-f]{6}$/i.test(next.color2))next.color2=defaults.color2;
    if(!/^#[0-9a-f]{6}$/i.test(next.backgroundColor))next.backgroundColor=defaults.backgroundColor;
    if(!/^#[0-9a-f]{6}$/i.test(next.alternateCellColor))next.alternateCellColor=defaults.alternateCellColor;
    if(!["white-gradient","black-gradient","color","image"].includes(next.backgroundMode))next.backgroundMode=defaults.backgroundMode;
    next.alternateCells=!!next.alternateCells;
    next.backgroundImage=typeof next.backgroundImage==="string"?next.backgroundImage:"";
    return next;
  }
  function hexRgb(hex){const n=parseInt(hex.slice(1),16);return [(n>>16)&255,(n>>8)&255,n&255]}
  function contrast(hex){const [r,g,b]=hexRgb(hex).map(v=>v/255).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4);return .2126*r+.7152*g+.0722*b>.42?"#20242a":"#ffffff"}
  function backgroundCss(t){
    if(t.backgroundMode==="black-gradient")return "linear-gradient(135deg,#181a1f 0%,#30343b 52%,#17191d 100%)";
    if(t.backgroundMode==="color")return t.backgroundColor;
    if(t.backgroundMode==="image"&&t.backgroundImage)return `url(${JSON.stringify(t.backgroundImage)}) center/cover fixed no-repeat`;
    return "linear-gradient(135deg,#ffffff 0%,#f3f5f8 52%,#ffffff 100%)";
  }
  function saveLocal(){try{localStorage.setItem(cacheKey,JSON.stringify(theme))}catch{}}
  function scheduleRemoteSave(){
    clearTimeout(saveTimer);
    saveTimer=setTimeout(saveRemote,550);
  }
  async function saveRemote(){
    if(!boardId)return;
    try{
      const endpoint=`/api/boards/${encodeURIComponent(boardId)}/spreadsheet/state`;
      const response=await fetch(endpoint);
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)return;
      const state=payload.state&&typeof payload.state==="object"?payload.state:{};
      const layout=state["charaHub.layoutV1"]&&typeof state["charaHub.layoutV1"]==="object"?state["charaHub.layoutV1"]:{};
      state["charaHub.layoutV1"]={...layout,jijinThemeV2:theme};
      await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({state})});
    }catch(error){console.warn("Theme save failed",error)}
  }
  async function loadRemote(){
    if(!boardId)return;
    try{
      const response=await fetch(`/api/boards/${encodeURIComponent(boardId)}/spreadsheet/state`);
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)return;
      const remote=payload.state?.["charaHub.layoutV1"]?.jijinThemeV2;
      if(!remote)return;
      theme=normalize(remote);
      saveLocal();
      applyEverywhere();
      syncForm();
    }catch(error){console.warn("Theme load failed",error)}
  }

  function styleText(scope,t){
    const c1=t.color1,c2=t.color2,ink=contrast(c1),bg=backgroundCss(t),alt=t.alternateCellColor;
    if(scope==="board")return `
      :root{--jijin-color1:${c1};--jijin-color2:${c2};--jijin-on1:${ink};--jijin-alt:${alt}}
      html,body{background:${bg}!important;background-attachment:fixed!important}
      .board-layout,.tool-stage{background:transparent!important}
      .topbar{background:${c2}!important}
      .topbar .brand,.topbar .brand:link,.topbar .brand:visited,.topbar .app-tabs button,.topbar .presence-person b{color:${c1}!important}
      .topbar .app-tabs button{background:transparent!important;border-color:transparent!important}
      .topbar .app-tabs button.active{border-bottom-color:${c1}!important}
      button:not(#boardSettingsButton):not(.app-tabs button){background:${c1}!important;border-color:${c1}!important;color:${ink}!important}
      #boardSettingsButton{color:${c1}!important;background:transparent!important}
      .log-sidebar,.welcome,.board-settings-panel,.board-settings-section{background:${c2}!important}
      *{scrollbar-color:${c1} transparent}
      *::-webkit-scrollbar-thumb{background:${c1}!important}
    `;
    if(scope==="log")return `
      :root{--jijin-color1:${c1};--jijin-color2:${c2};--jijin-on1:${ink};--jijin-alt:${alt};--accent:${c1}!important;--soft:${c2}!important}
      html,body,main{background:${bg}!important;background-attachment:fixed!important}
      .topbar,.room-tools,.log-pane,.comments-pane,.home.card,dialog form{background:${c2}!important}
      .comments-head{background:${c1}!important;color:${ink}!important}
      .comments-head *{color:${ink}!important}
      button:not([data-close]){background:${c1}!important;border-color:${c1}!important;color:${ink}!important}
      *{scrollbar-color:${c1} transparent}
      *::-webkit-scrollbar-thumb{background:${c1}!important}
    `;
    if(scope==="matrix")return `
      :root{--jijin-color1:${c1};--jijin-color2:${c2};--jijin-on1:${ink};--jijin-alt:${alt};--accent:${c1}!important;--soft:${c2}!important;--panel:${c2}!important}
      html,body,.app{background:${bg}!important;background-attachment:fixed!important}
      .header-wrap,.library,.template-tabs-wrap,.stage,.settings,.source-card,.log-list{background:${c2}!important}
      .brand{color:${c1}!important}
      .comments-head,.comment-head,.comment-panel-head{background:${c1}!important;color:${ink}!important}
      .comments-head *,.comment-head *,.comment-panel-head *{color:${ink}!important}
      button,.btn{background:${c1}!important;border-color:${c1}!important;color:${ink}!important}
      *{scrollbar-color:${c1} transparent}
      *::-webkit-scrollbar-thumb{background:${c1}!important}
    `;
    return `
      :root{--jijin-color1:${c1};--jijin-color2:${c2};--jijin-on1:${ink};--jijin-alt:${alt};--accent:${c1}!important;--accent-bg:${c2}!important;--panel:${c2}!important}
      html,body{background:${bg}!important;background-attachment:fixed!important}
      .panel,.table-panel,.modal,.modal-head,.source-head,.group-box,.sheet-settings-panel{background:${c2}!important}
      .group-row td{background:${c2}!important;color:${c1}!important}
      .data-sheet thead th,.data-sheet .item-col{background:${c1}!important;color:${ink}!important}
      .data-sheet thead th *,.data-sheet .item-col *{color:${ink}!important}
      #sheetComments .sheet-comments-head,.sheet-comments-head{background:${c1}!important;color:${ink}!important}
      #sheetComments .sheet-comments-head *,.sheet-comments-head *{color:${ink}!important}
      button:not(.full-character-page-gear):not([data-full-character-design]),.btn{background:${c1}!important;border-color:${c1}!important;color:${ink}!important}
      .full-character-page-gear,[data-full-character-design]{background:transparent!important;color:inherit!important;border-color:transparent!important}
      ${t.alternateCells?`.data-sheet tbody tr:not(.group-row):nth-child(even) td:not(.item-col){background:${alt}!important}`:""}
      *{scrollbar-color:${c1} transparent}
      *::-webkit-scrollbar-thumb{background:${c1}!important}
      /* Character individual pages deliberately keep their own design freedom. */
      .full-character-page,.full-character-page *,#characterPopup .character-sheet-group,#characterPopup .character-sheet-group *{scrollbar-color:auto}
    `;
  }
  function inject(doc,scope){
    if(!doc?.head)return;
    let style=doc.getElementById("jijinboardThemeV2Style");
    if(!style){style=doc.createElement("style");style.id="jijinboardThemeV2Style";doc.head.append(style)}
    style.textContent=styleText(scope,theme);
  }
  function applyEverywhere(){
    inject(document,"board");
    [["logFrame","log"],["matrixFrame","matrix"],["spreadsheetFrame","spreadsheet"]].forEach(([id,scope])=>{
      const frame=document.getElementById(id);
      try{inject(frame?.contentDocument,scope)}catch{}
    });
    window.dispatchEvent(new CustomEvent("jijinboard-theme-change",{detail:theme}));
  }
  function update(patch,{remote=true}={}){
    theme=normalize({...theme,...patch});
    saveLocal();
    applyEverywhere();
    syncForm();
    if(remote)scheduleRemoteSave();
  }

  async function imageData(file){
    if(!file)return"";
    try{
      const bitmap=await createImageBitmap(file),max=1600,scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height));
      const canvas=document.createElement("canvas");
      canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      canvas.getContext("2d").drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();
      return canvas.toDataURL("image/webp",.8);
    }catch{
      return await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||""));r.onerror=reject;r.readAsDataURL(file)})
    }
  }

  function buildDesignUI(){
    const slot=document.getElementById("boardDesignSlot");
    if(!slot)return;
    slot.innerHTML=`
      <div class="jijin-theme-v2">
        <section class="jijin-theme-section">
          <div class="jijin-theme-head"><b>共通カラー</b><span>JIJINBOARD全体で使う2色です。</span></div>
          <div class="jijin-theme-grid two">
            <label><span>色1</span><input type="color" id="jijinThemeColor1"></label>
            <label><span>色2</span><input type="color" id="jijinThemeColor2"></label>
          </div>
          <div class="jijin-theme-note"><b>色1</b>：項目・名前・コメントヘッダー・ヘッダー文字・ボタン・スクロールバー　／　<b>色2</b>：インライン背景・スプシのグループ・上部ヘッダー背景</div>
        </section>
        <section class="jijin-theme-section">
          <div class="jijin-theme-head"><b>背景</b><span>いちばん外側の背景です。</span></div>
          <div class="jijin-bg-modes">
            <label><input type="radio" name="jijinBgMode" value="white-gradient"><i class="white"></i><span>白グラデーション</span></label>
            <label><input type="radio" name="jijinBgMode" value="black-gradient"><i class="black"></i><span>黒グラデーション</span></label>
            <label><input type="radio" name="jijinBgMode" value="color"><i class="solid"></i><span>色選択</span></label>
            <label><input type="radio" name="jijinBgMode" value="image"><i class="image"></i><span>背景画像</span></label>
          </div>
          <div class="jijin-theme-grid two jijin-bg-detail">
            <label><span>背景色</span><input type="color" id="jijinThemeBgColor"></label>
            <label class="jijin-file-field"><span>背景画像</span><input type="file" id="jijinThemeBgImage" accept="image/*"><button type="button" id="jijinThemeBgRemove">削除</button></label>
          </div>
        </section>
        <section class="jijin-theme-section">
          <div class="jijin-theme-head"><b>スプレッドシート</b><span>表全体の共通設定です。</span></div>
          <div class="jijin-theme-grid two">
            <label class="jijin-check"><input type="checkbox" id="jijinThemeAlt"><span>マスを交互に塗る</span></label>
            <label><span>マス用の色</span><input type="color" id="jijinThemeAltColor"></label>
          </div>
          <div class="jijin-theme-note">グループ色は色2を使います。初期値は薄い灰色です。</div>
        </section>
        <section class="jijin-theme-section individual">
          <div class="jijin-theme-head"><b>Character個別ページ</b><span>ここだけは共通テーマで縛りません。</span></div>
          <div class="jijin-theme-note">各Characterページ右上の歯車から、今まで通り色・背景画像などを自由に設定できます。既存の個別設定もそのまま維持します。</div>
        </section>
      </div>`;
    installThemeCss();
    bindForm();
    syncForm();
  }
  function installThemeCss(){
    if(document.getElementById("jijinThemeV2UiStyle"))return;
    const style=document.createElement("style");style.id="jijinThemeV2UiStyle";style.textContent=`
      #boardDesignSlot{overflow:auto!important;background:#fff!important}
      .jijin-theme-v2{display:grid;gap:8px;padding:8px;color:#303640;font-size:9px}
      .jijin-theme-section{border:1px solid #e4e7ec;border-radius:10px;background:#fff;padding:9px}
      .jijin-theme-head{display:flex;align-items:baseline;gap:8px;margin-bottom:8px}.jijin-theme-head b{font-size:10px}.jijin-theme-head span,.jijin-theme-note{font-size:8px;color:#8a929d;line-height:1.55}
      .jijin-theme-grid{display:grid;gap:7px}.jijin-theme-grid.two{grid-template-columns:repeat(2,minmax(0,1fr))}.jijin-theme-grid label{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:34px;border-bottom:1px solid #eef0f3}.jijin-theme-grid input[type=color]{width:42px;height:28px;padding:0;border:1px solid #dfe3e8;border-radius:7px;background:#fff}
      .jijin-theme-note{margin-top:7px}.jijin-check{justify-content:flex-start!important}.jijin-check input{width:15px;height:15px;margin:0}
      .jijin-bg-modes{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.jijin-bg-modes label{display:grid;grid-template-columns:14px 28px minmax(0,1fr);align-items:center;gap:5px;border:1px solid #e4e7ec;border-radius:8px;padding:6px;cursor:pointer}.jijin-bg-modes input{margin:0}.jijin-bg-modes i{width:28px;height:22px;border-radius:5px;border:1px solid #dfe3e8}.jijin-bg-modes i.white{background:linear-gradient(135deg,#fff,#edf0f5,#fff)}.jijin-bg-modes i.black{background:linear-gradient(135deg,#16181c,#343941,#16181c)}.jijin-bg-modes i.solid{background:#d9dce2}.jijin-bg-modes i.image{background:linear-gradient(135deg,#d9e8f5,#f4e5d5)}
      .jijin-file-field{display:grid!important;grid-template-columns:auto minmax(0,1fr) auto!important}.jijin-file-field input[type=file]{min-width:0;font-size:8px}.jijin-file-field button{height:27px!important;padding:0 8px!important}
      .jijin-theme-section.individual{border-style:dashed}
      @media(max-width:620px){.jijin-bg-modes{grid-template-columns:repeat(2,minmax(0,1fr))}.jijin-theme-grid.two{grid-template-columns:1fr}}
    `;document.head.append(style);
  }
  function bindForm(){
    const q=id=>document.getElementById(id);
    q("jijinThemeColor1")?.addEventListener("input",e=>update({color1:e.target.value}));
    q("jijinThemeColor2")?.addEventListener("input",e=>update({color2:e.target.value}));
    q("jijinThemeBgColor")?.addEventListener("input",e=>update({backgroundColor:e.target.value,backgroundMode:"color"}));
    q("jijinThemeAlt")?.addEventListener("change",e=>update({alternateCells:e.target.checked}));
    q("jijinThemeAltColor")?.addEventListener("input",e=>update({alternateCellColor:e.target.value}));
    document.querySelectorAll('input[name="jijinBgMode"]').forEach(input=>input.addEventListener("change",e=>{if(e.target.checked)update({backgroundMode:e.target.value})}));
    q("jijinThemeBgImage")?.addEventListener("change",async e=>{const file=e.target.files?.[0];if(!file)return;const data=await imageData(file);update({backgroundImage:data,backgroundMode:"image"})});
    q("jijinThemeBgRemove")?.addEventListener("click",()=>update({backgroundImage:"",backgroundMode:"white-gradient"}));
  }
  function syncForm(){
    const q=id=>document.getElementById(id);if(!q("jijinThemeColor1"))return;
    q("jijinThemeColor1").value=theme.color1;q("jijinThemeColor2").value=theme.color2;q("jijinThemeBgColor").value=theme.backgroundColor;q("jijinThemeAlt").checked=theme.alternateCells;q("jijinThemeAltColor").value=theme.alternateCellColor;
    document.querySelectorAll('input[name="jijinBgMode"]').forEach(i=>i.checked=i.value===theme.backgroundMode);
  }

  function openDesign(){
    const overlay=document.getElementById("boardSettingsOverlay");if(!overlay)return;
    const pages=overlay.querySelectorAll("[data-board-settings-page]");pages.forEach(p=>p.hidden=p.dataset.boardSettingsPage!=="design");
    overlay.querySelectorAll("[data-board-settings-tab]").forEach(b=>b.classList.toggle("active",b.dataset.boardSettingsTab==="design"));
    buildDesignUI();
  }
  document.addEventListener("click",event=>{
    const tab=event.target.closest?.('[data-board-settings-tab="design"]');
    if(!tab)return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();openDesign();
  },true);

  [["logFrame","log"],["matrixFrame","matrix"],["spreadsheetFrame","spreadsheet"]].forEach(([id,scope])=>{
    document.getElementById(id)?.addEventListener("load",()=>{try{inject(document.getElementById(id).contentDocument,scope)}catch{}});
  });

  applyEverywhere();
  const idle=()=>loadRemote();
  if("requestIdleCallback" in window)requestIdleCallback(idle,{timeout:1600});else setTimeout(idle,600);
})();