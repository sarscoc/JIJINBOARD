"use strict";
const profileDialog=document.querySelector("#boardProfileDialog"),profileForm=document.querySelector("#boardProfileForm");
function savedProfile(){try{return JSON.parse(localStorage.getItem("trpgMarkerProfile")||"null")}catch{return null}}
function openBoardProfile(){const profile=savedProfile();if(profile?.plName)return;document.querySelector("#boardProfileTitle").textContent=`${document.querySelector("#boardName")?.textContent||"この部屋"} に入る`;profileDialog.showModal()}
async function compactIcon(file){if(!file)return"";const bitmap=await createImageBitmap(file),canvas=document.createElement("canvas");canvas.width=canvas.height=96;const ctx=canvas.getContext("2d"),scale=Math.min(96/bitmap.width,96/bitmap.height),w=bitmap.width*scale,h=bitmap.height*scale;ctx.drawImage(bitmap,(96-w)/2,(96-h)/2,w,h);bitmap.close?.();return canvas.toDataURL("image/webp",.82)}
profileForm.addEventListener("submit",async event=>{event.preventDefault();const current=savedProfile()||{},name=document.querySelector("#boardPlName").value.trim();if(!name)return;const file=document.querySelector("#boardPlIcon").files?.[0],icon=file?await compactIcon(file):(current.plIcon||"");localStorage.setItem("trpgMarkerProfile",JSON.stringify({id:current.id||crypto.randomUUID(),plName:name,plIcon:icon,plColor:document.querySelector("#boardPlColor").value||"#ffe66b"}));profileDialog.close();const frame=document.querySelector("#logFrame");if(frame?.src)frame.src=frame.src});
setTimeout(openBoardProfile,120);

function installBoardSettingsWorkspace(){
  const actions=document.querySelector(".top-actions"),shareButton=document.querySelector("#shareBoard"),profileButton=document.querySelector("#profileButton"),logFrame=document.querySelector("#logFrame"),sheetFrame=document.querySelector("#spreadsheetFrame");
  if(!actions||!shareButton||!profileButton||!logFrame||!sheetFrame||document.querySelector("#boardSettingsButton"))return;

  const style=document.createElement("style");
  style.id="boardSettingsStyle";
  style.textContent=`
    .board-settings-trigger{display:grid!important;place-items:center!important;width:34px!important;height:32px!important;padding:0!important;border-radius:8px!important;font-size:15px!important;line-height:1!important}
    .board-settings-overlay{position:fixed;inset:0;z-index:2300;display:grid;place-items:center;padding:24px;background:rgba(24,29,37,.24);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px)}
    .board-settings-overlay[hidden]{display:none!important}
    .board-settings-panel{display:grid;grid-template-columns:70px minmax(0,1fr);width:min(940px,calc(100vw - 48px));height:min(700px,calc(100vh - 48px));min-height:420px;overflow:hidden;border:1px solid rgba(218,223,231,.96);border-radius:15px;background:#fff;box-shadow:0 24px 70px rgba(28,35,48,.18)}
    .board-settings-tabs{display:flex;flex-direction:column;gap:2px;padding:12px 7px;border-right:1px solid #e4e7ec;background:#f7f8fa}
    .board-settings-tab{width:100%;min-height:42px;padding:6px 3px;border:0;border-radius:7px;background:transparent;color:#8a929d;font-size:8px;font-weight:800;line-height:1.25;cursor:pointer}
    .board-settings-tab.active{background:#fff;color:#252b34;box-shadow:inset 0 0 0 1px #e0e4ea}
    .board-settings-main{display:grid;grid-template-rows:48px minmax(0,1fr);min-width:0;min-height:0;background:#fff}
    .board-settings-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 14px;border-bottom:1px solid #e4e7ec}
    .board-settings-head strong{font-size:12px;letter-spacing:.01em}
    .board-settings-close{display:grid;place-items:center;width:30px;height:30px;padding:0;border:1px solid #e1e5ea;border-radius:8px;background:#fff;color:#4d5560;font-size:17px;line-height:1;cursor:pointer}
    .board-settings-pages{position:relative;min-width:0;min-height:0;overflow:hidden}
    .board-settings-page{position:absolute;inset:0;display:grid;min-width:0;min-height:0;padding:12px 14px 14px;background:#fff}
    .board-settings-page[hidden]{display:none!important}
    .board-settings-general{grid-template-rows:auto minmax(0,1fr);gap:11px}
    .board-settings-section{min-width:0;border:1px solid #e4e7ec;border-radius:10px;background:#fff;overflow:hidden}
    .board-settings-section-head{display:flex;align-items:baseline;gap:8px;padding:8px 10px;border-bottom:1px solid #eceef2}
    .board-settings-section-head b{font-size:9px;color:#343a44}
    .board-settings-section-head span{font-size:7px;color:#9299a4}
    .board-share-body{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;padding:8px 10px}
    .board-share-url{width:100%;min-width:0;height:30px;padding:5px 8px;border:1px solid #e1e5ea;border-radius:7px;background:#fafbfc;color:#59616d;font:500 9px/1.2 system-ui,-apple-system,"Segoe UI","Noto Sans JP",sans-serif;outline:none}
    .board-settings-copy{height:30px;padding:0 10px!important;border:1px solid #e1e5ea!important;border-radius:7px!important;background:#fff!important;color:#343b45!important;font-size:8px!important;font-weight:800!important;white-space:nowrap!important}
    .board-speaker-section{display:grid;grid-template-rows:auto minmax(0,1fr);min-height:0}
    .board-settings-frame-slot{position:relative;min-width:0;min-height:0;overflow:hidden;background:#fff}
    .board-settings-loading{position:absolute;inset:0;display:grid;place-items:center;color:#959ca6;font-size:9px}
    .board-settings-design{padding:0}
    .board-settings-design .board-settings-frame-slot{height:100%}
    .tool-frame.board-settings-surface-frame{position:fixed!important;inset:auto!important;display:block!important;margin:0!important;padding:0!important;border:0!important;border-radius:0!important;background:#fff!important;z-index:2310!important;pointer-events:auto!important}
    @media(max-width:720px){
      .board-settings-overlay{padding:10px}
      .board-settings-panel{grid-template-columns:58px minmax(0,1fr);width:calc(100vw - 20px);height:calc(100vh - 20px);min-height:0;border-radius:11px}
      .board-settings-tabs{padding:9px 5px}
      .board-settings-tab{font-size:7px;min-height:38px}
      .board-settings-page{padding:9px}
      .board-share-body{grid-template-columns:1fr}
      .board-settings-copy{justify-self:end}
    }
  `;
  document.head.appendChild(style);

  const trigger=document.createElement("button");
  trigger.id="boardSettingsButton";
  trigger.type="button";
  trigger.className="quiet board-settings-trigger";
  trigger.textContent="⚙";
  trigger.title="設定";
  trigger.setAttribute("aria-label","設定");
  trigger.setAttribute("aria-expanded","false");

  const overlay=document.createElement("div");
  overlay.id="boardSettingsOverlay";
  overlay.className="board-settings-overlay";
  overlay.hidden=true;
  overlay.innerHTML=`
    <div class="board-settings-panel" role="dialog" aria-modal="true" aria-label="設定">
      <nav class="board-settings-tabs" aria-label="設定ページ">
        <button type="button" class="board-settings-tab active" data-board-settings-tab="general">基本</button>
        <button type="button" class="board-settings-tab" data-board-settings-tab="design">デザイン</button>
      </nav>
      <div class="board-settings-main">
        <div class="board-settings-head"><strong id="boardSettingsTitle">設定</strong><button type="button" class="board-settings-close" id="boardSettingsClose" aria-label="閉じる">×</button></div>
        <div class="board-settings-pages">
          <section class="board-settings-page board-settings-general" data-board-settings-page="general">
            <div class="board-settings-section">
              <div class="board-settings-section-head"><b>共有URL</b><span>この部屋へのリンク</span></div>
              <div class="board-share-body"><input class="board-share-url" id="boardShareUrl" readonly></div>
            </div>
            <div class="board-settings-section board-speaker-section">
              <div class="board-settings-section-head"><b>発言者設定</b><span>PL・PC・マーカー色・画像・引き継ぎ</span></div>
              <div class="board-settings-frame-slot" id="boardSpeakerSlot"><div class="board-settings-loading">読み込み中…</div></div>
            </div>
          </section>
          <section class="board-settings-page board-settings-design" data-board-settings-page="design" hidden>
            <div class="board-settings-frame-slot" id="boardDesignSlot"><div class="board-settings-loading">読み込み中…</div></div>
          </section>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const shareBody=overlay.querySelector(".board-share-body");
  shareButton.className="board-settings-copy";
  shareButton.textContent="コピー";
  shareBody.appendChild(shareButton);
  profileButton.style.display="none";
  actions.replaceChildren(trigger,profileButton);

  const shareUrl=overlay.querySelector("#boardShareUrl"),title=overlay.querySelector("#boardSettingsTitle"),speakerSlot=overlay.querySelector("#boardSpeakerSlot"),designSlot=overlay.querySelector("#boardDesignSlot");
  const frameSnapshots=new Map();
  let currentTab="general",activeSurface=null,surfaceToken=0,settingsOpen=false;

  function boardId(){return new URL(location.href).searchParams.get("id")||""}
  function roomId(){return new URL(location.href).searchParams.get("room")||logFrame.dataset.room||document.querySelector("#logList [data-room]")?.dataset.room||""}
  function safeDoc(frame){try{return frame.contentDocument}catch{return null}}

  function snapshotFrame(frame){
    if(frameSnapshots.has(frame))return;
    frameSnapshots.set(frame,{className:frame.className,style:frame.getAttribute("style")});
  }
  function restoreFrame(frame){
    const snap=frameSnapshots.get(frame);if(!snap)return;
    frame.className=snap.className;
    if(snap.style===null)frame.removeAttribute("style");else frame.setAttribute("style",snap.style);
    frameSnapshots.delete(frame);
  }
  function placeSurface(frame,slot){
    if(!settingsOpen||overlay.hidden||!slot||slot.offsetParent===null)return;
    const rect=slot.getBoundingClientRect();
    frame.style.setProperty("left",`${Math.round(rect.left)}px`,"important");
    frame.style.setProperty("top",`${Math.round(rect.top)}px`,"important");
    frame.style.setProperty("width",`${Math.max(1,Math.round(rect.width))}px`,"important");
    frame.style.setProperty("height",`${Math.max(1,Math.round(rect.height))}px`,"important");
  }
  function beginSurface(frame,slot){
    snapshotFrame(frame);
    frame.classList.remove("hidden","profile-overlay-frame");
    frame.classList.add("board-settings-surface-frame");
    frame.style.setProperty("visibility","visible","important");
    frame.style.setProperty("opacity","0","important");
    placeSurface(frame,slot);
    const place=()=>placeSurface(frame,slot);
    window.addEventListener("resize",place,{passive:true});
    const ro=window.ResizeObserver?new ResizeObserver(place):null;ro?.observe(slot);
    return ()=>{window.removeEventListener("resize",place);ro?.disconnect()};
  }
  function endSurface(){
    surfaceToken++;
    if(!activeSurface)return;
    try{activeSurface.cleanup?.()}catch{}
    restoreFrame(activeSurface.frame);
    activeSurface=null;
  }

  function waitForFrame(frame,url,test,callback,token){
    const ready=()=>{const doc=safeDoc(frame);return !!(doc&&test(doc))};
    if(ready())return callback();
    const onLoad=()=>{if(token!==surfaceToken)return;setTimeout(()=>{if(token===surfaceToken&&ready())callback()},0)};
    frame.addEventListener("load",onLoad,{once:true});
    if(!frame.getAttribute("src"))frame.src=url;
  }

  function surfaceProfile(){
    const token=surfaceToken;
    const board=boardId(),room=roomId();
    const url=`/log/?embedded=1${board?`&board=${encodeURIComponent(board)}`:""}${room?`&room=${encodeURIComponent(room)}`:""}`;
    waitForFrame(logFrame,url,doc=>!!doc.querySelector("#profileDialog"),()=>{
      if(token!==surfaceToken||currentTab!=="general"||!settingsOpen)return;
      const doc=safeDoc(logFrame),win=logFrame.contentWindow,dialog=doc?.querySelector("#profileDialog");if(!doc?.head||!dialog||!win)return;
      doc.querySelector("#jijinboard-profile-overlay-style")?.remove();
      const stopPlace=beginSurface(logFrame,speakerSlot);
      const sheetStyle=doc.createElement("style");
      sheetStyle.id="jijinboard-settings-profile-style";
      sheetStyle.textContent=`
        html,body{width:100%!important;height:100%!important;margin:0!important;background:#fff!important;overflow:hidden!important}
        body>*:not(#profileDialog){display:none!important}
        #profileDialog{position:fixed!important;inset:0!important;width:100%!important;max-width:none!important;height:100%!important;max-height:none!important;margin:0!important;padding:0!important;border:0!important;border-radius:0!important;background:#fff!important;box-shadow:none!important;overflow:auto!important}
        #profileDialog::backdrop{background:transparent!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
        #profileForm{width:100%!important;max-width:none!important;min-height:100%!important;margin:0!important;padding:9px 11px 10px!important;gap:5px!important;background:#fff!important;box-shadow:none!important}
        .profile-close-row{display:none!important}
        .profile-person-row{min-height:34px!important;gap:5px!important;padding:3px 0!important}
        #plName,.profile-name-input{min-height:28px!important;padding:4px 6px!important;font-size:9px!important}
        .profile-image-pair,.profile-color-pair{gap:3px!important}
        .profile-image-control,.profile-image-preview{width:28px!important;height:28px!important;min-width:28px!important;min-height:28px!important}
        .profile-image-preview img{max-width:100%!important;max-height:100%!important}
        .marker-choice{width:25px!important;height:25px!important;min-width:25px!important;min-height:25px!important}
        .marker-choice b{width:15px!important;height:15px!important}
        .profile-remove{width:25px!important;height:25px!important;padding:0!important}
        .profile-persona-list{gap:2px!important}
        .profile-add-wrap{margin:2px 0!important}
        .profile-add-button{width:28px!important;height:25px!important;padding:0!important;font-size:14px!important}
        .profile-transfer{margin-top:3px!important}
        .profile-transfer-toggle{font-size:7px!important;padding:3px 0!important}
        .profile-transfer-panel{gap:4px!important;padding:5px 0!important}
        .profile-transfer-panel input,.profile-transfer-panel button{min-height:27px!important;padding:4px 6px!important;font-size:8px!important}
        .profile-save{min-height:30px!important;margin-top:2px!important;padding:5px 9px!important;font-size:9px!important}
      `;
      doc.head.appendChild(sheetStyle);
      let live=true;
      const reopen=()=>{
        if(!live||!settingsOpen||currentTab!=="general")return;
        setTimeout(()=>{if(!live||!settingsOpen||currentTab!=="general")return;win.postMessage({type:"jijinboard-open-profile"},location.origin)},35);
      };
      dialog.addEventListener("close",reopen);
      const open=()=>{win.postMessage({type:"jijinboard-open-profile"},location.origin);setTimeout(()=>{if(!dialog.open&&typeof win.openProfile==="function")try{win.openProfile()}catch{};logFrame.style.setProperty("opacity","1","important");placeSurface(logFrame,speakerSlot)},60)};
      open();
      activeSurface={frame:logFrame,cleanup:()=>{live=false;dialog.removeEventListener("close",reopen);try{if(dialog.open)dialog.close()}catch{};sheetStyle.remove();stopPlace()}};
    },token);
  }

  function prepareSpreadsheetDoc(doc){
    if(!doc?.head)return;
    let hide=doc.querySelector("#jijinBoardTopSettingsStyle");
    if(!hide){hide=doc.createElement("style");hide.id="jijinBoardTopSettingsStyle";hide.textContent="#designToolBtn{display:none!important}";doc.head.appendChild(hide)}
  }
  function surfaceDesign(){
    const token=surfaceToken,board=boardId(),url=`/spreadsheet/?embedded=1${board?`&board=${encodeURIComponent(board)}`:""}`;
    waitForFrame(sheetFrame,url,doc=>!!doc.querySelector("#designToolBtn")&&!!doc.querySelector("#designToolModal"),()=>{
      if(token!==surfaceToken||currentTab!=="design"||!settingsOpen)return;
      const doc=safeDoc(sheetFrame),modal=doc?.querySelector("#designToolModal"),button=doc?.querySelector("#designToolBtn");if(!doc?.head||!modal||!button)return;
      prepareSpreadsheetDoc(doc);
      const stopPlace=beginSurface(sheetFrame,designSlot);
      modal.querySelectorAll(".design-section").forEach(section=>section.style.display="");
      const modalTitle=modal.querySelector(".modal-head b");if(modalTitle)modalTitle.textContent="デザイン設定";
      const sheetStyle=doc.createElement("style");
      sheetStyle.id="jijinboard-settings-design-style";
      sheetStyle.textContent=`
        html,body{width:100%!important;height:100%!important;margin:0!important;background:#fff!important;overflow:hidden!important}
        body>*:not(#designToolModal){display:none!important}
        #designToolModal{position:fixed!important;inset:0!important;display:block!important;width:100%!important;height:100%!important;margin:0!important;padding:0!important;background:#fff!important;overflow:auto!important}
        #designToolModal .modal{width:100%!important;max-width:none!important;min-height:100%!important;max-height:none!important;margin:0!important;border:0!important;border-radius:0!important;background:#fff!important;overflow:visible!important;box-shadow:none!important}
        #designToolModal .modal-head{display:none!important}
        #designToolModal .modal-body{padding:10px 12px 14px!important}
        #designToolModal .design-tool-page{gap:10px!important}
        #designToolModal .design-section{display:grid!important;gap:6px!important;padding:0 0 10px!important;margin:0!important}
        #designToolModal .design-section-head{gap:6px!important}
        #designToolModal .design-section-head b{font-size:9px!important}
        #designToolModal .design-section-head span{font-size:7px!important}
        #designToolModal .design-color-field,#designToolModal .design-select-field{min-height:30px!important;padding:4px 6px!important}
        #designToolModal .design-color-field>span,#designToolModal .design-select-field>span{font-size:7px!important}
        #designToolModal .design-photo-row{margin-top:7px!important;padding-top:7px!important}
        #designToolModal .design-actions{margin-top:7px!important}
      `;
      doc.head.appendChild(sheetStyle);
      if(!modal.classList.contains("show"))button.click();
      setTimeout(()=>{sheetFrame.style.setProperty("opacity","1","important");placeSurface(sheetFrame,designSlot)},40);
      activeSurface={frame:sheetFrame,cleanup:()=>{modal.classList.remove("show");sheetStyle.remove();stopPlace()}};
    },token);
  }

  function showTab(name){
    currentTab=name;surfaceToken++;endSurface();
    overlay.querySelectorAll("[data-board-settings-tab]").forEach(btn=>btn.classList.toggle("active",btn.dataset.boardSettingsTab===name));
    overlay.querySelectorAll("[data-board-settings-page]").forEach(page=>page.hidden=page.dataset.boardSettingsPage!==name);
    title.textContent=name==="design"?"デザイン設定":"設定";
    requestAnimationFrame(()=>{if(name==="design")surfaceDesign();else surfaceProfile()});
  }
  function openSettings(){
    settingsOpen=true;overlay.hidden=false;trigger.setAttribute("aria-expanded","true");
    shareUrl.value=`${location.origin}/board/?id=${encodeURIComponent(boardId())}`;
    showTab("general");
  }
  function closeSettings(){
    if(!settingsOpen)return;settingsOpen=false;surfaceToken++;endSurface();overlay.hidden=true;trigger.setAttribute("aria-expanded","false");
  }

  trigger.addEventListener("click",()=>settingsOpen?closeSettings():openSettings());
  overlay.querySelector("#boardSettingsClose").addEventListener("click",closeSettings);
  overlay.addEventListener("click",event=>{if(event.target===overlay)closeSettings()});
  overlay.querySelectorAll("[data-board-settings-tab]").forEach(btn=>btn.addEventListener("click",()=>showTab(btn.dataset.boardSettingsTab)));
  document.addEventListener("keydown",event=>{if(event.key==="Escape"&&settingsOpen)closeSettings()});
  sheetFrame.addEventListener("load",()=>setTimeout(()=>prepareSpreadsheetDoc(safeDoc(sheetFrame)),0));
  prepareSpreadsheetDoc(safeDoc(sheetFrame));
}

installBoardSettingsWorkspace();
