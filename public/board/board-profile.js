"use strict";
const profileDialog=document.querySelector("#boardProfileDialog"),profileForm=document.querySelector("#boardProfileForm");
function savedProfile(){try{return JSON.parse(localStorage.getItem("trpgMarkerProfile")||"null")}catch{return null}}
function openBoardProfile(){const profile=savedProfile();if(profile?.plName)return;document.querySelector("#boardProfileTitle").textContent=`${document.querySelector("#boardName")?.textContent||"この部屋"} に入る`;profileDialog.showModal()}
async function compactIcon(file){if(!file)return"";const bitmap=await createImageBitmap(file),canvas=document.createElement("canvas");canvas.width=canvas.height=96;const ctx=canvas.getContext("2d"),scale=Math.min(96/bitmap.width,96/bitmap.height),w=bitmap.width*scale,h=bitmap.height*scale;ctx.drawImage(bitmap,(96-w)/2,(96-h)/2,w,h);bitmap.close?.();return canvas.toDataURL("image/webp",.82)}
profileForm.addEventListener("submit",async event=>{event.preventDefault();const current=savedProfile()||{},name=document.querySelector("#boardPlName").value.trim();if(!name)return;const file=document.querySelector("#boardPlIcon").files?.[0],icon=file?await compactIcon(file):(current.plIcon||"");localStorage.setItem("trpgMarkerProfile",JSON.stringify({id:current.id||crypto.randomUUID(),plName:name,plIcon:icon,plColor:document.querySelector("#boardPlColor").value||"#ffe66b"}));profileDialog.close();const frame=document.querySelector("#logFrame");if(frame?.src)frame.src=frame.src});
setTimeout(openBoardProfile,120);

function installBoardSettingsMenu(){
  const actions=document.querySelector(".top-actions"),share=document.querySelector("#shareBoard"),profile=document.querySelector("#profileButton");
  if(!actions||!share||!profile||document.querySelector("#boardSettingsButton"))return;

  const style=document.createElement("style");
  style.id="boardSettingsStyle";
  style.textContent=`
    .board-settings-root{position:relative;display:flex;align-items:center}
    .board-settings-trigger{display:grid!important;place-items:center!important;width:34px!important;height:32px!important;padding:0!important;font-size:15px!important;line-height:1!important}
    .board-settings-menu{position:absolute;right:0;top:calc(100% + 7px);z-index:220;width:max-content;min-width:190px;padding:5px;border:1px solid var(--line);border-radius:9px;background:rgba(255,255,255,.98);box-shadow:0 12px 36px rgba(26,34,48,.14);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}
    .board-settings-menu[hidden]{display:none!important}
    .board-settings-menu button{display:block;width:100%;margin:0;padding:8px 10px;border:0;border-radius:6px;background:transparent;color:var(--ink);font-size:10px;font-weight:700;line-height:1.25;text-align:left;white-space:nowrap;cursor:pointer}
    .board-settings-menu button:hover{background:var(--soft)}
    .board-settings-menu .board-settings-divider{height:1px;margin:4px 5px;background:var(--line)}
    @media(max-width:520px){.board-settings-menu{right:-2px;min-width:176px}.board-settings-menu button{font-size:9px;padding:8px}}
  `;
  document.head.appendChild(style);

  const root=document.createElement("div");
  root.className="board-settings-root";
  const trigger=document.createElement("button");
  trigger.id="boardSettingsButton";
  trigger.type="button";
  trigger.className="icon-btn board-settings-trigger";
  trigger.textContent="⚙";
  trigger.title="設定";
  trigger.setAttribute("aria-label","設定");
  trigger.setAttribute("aria-expanded","false");

  const menu=document.createElement("div");
  menu.id="boardSettingsMenu";
  menu.className="board-settings-menu";
  menu.hidden=true;

  share.className="board-settings-item";
  share.textContent="共有URL";
  profile.className="board-settings-item";
  profile.textContent="発言者設定";

  const divider=document.createElement("div");
  divider.className="board-settings-divider";
  const globalDesign=document.createElement("button");
  globalDesign.id="boardGlobalDesignButton";
  globalDesign.type="button";
  globalDesign.textContent="全体のデザイン設定";
  const sheetDesign=document.createElement("button");
  sheetDesign.id="boardSheetDesignButton";
  sheetDesign.type="button";
  sheetDesign.textContent="スプシのデザイン設定";

  menu.append(share,profile,divider,globalDesign,sheetDesign);
  root.append(trigger,menu);
  actions.replaceChildren(root);

  const closeMenu=()=>{menu.hidden=true;trigger.setAttribute("aria-expanded","false")};
  trigger.addEventListener("click",event=>{event.stopPropagation();menu.hidden=!menu.hidden;trigger.setAttribute("aria-expanded",String(!menu.hidden))});
  menu.addEventListener("click",event=>event.stopPropagation());
  share.addEventListener("click",closeMenu);
  profile.addEventListener("click",closeMenu);
  document.addEventListener("click",event=>{if(!root.contains(event.target))closeMenu()});
  document.addEventListener("keydown",event=>{if(event.key==="Escape")closeMenu()});

  const spreadsheetFrame=document.querySelector("#spreadsheetFrame");
  function sheetDocument(){try{return spreadsheetFrame?.contentDocument||null}catch{return null}}
  function prepareSpreadsheetChrome(){
    const doc=sheetDocument();
    if(!doc?.getElementById("designToolBtn"))return false;
    if(!doc.getElementById("jijinBoardTopSettingsStyle")){
      const sheetStyle=doc.createElement("style");
      sheetStyle.id="jijinBoardTopSettingsStyle";
      sheetStyle.textContent="#designToolBtn{display:none!important}";
      doc.head.appendChild(sheetStyle);
    }
    return true;
  }
  function configureDesignModal(mode){
    const doc=sheetDocument(),modal=doc?.getElementById("designToolModal");
    if(!modal)return;
    const title=modal.querySelector(".modal-head b");
    if(title)title.textContent=mode==="sheet"?"スプシのデザイン設定":"全体のデザイン設定";
    const sections=[...modal.querySelectorAll(".design-section")];
    for(const section of sections){
      const heading=section.querySelector(".design-section-head b")?.textContent?.trim()||"";
      const isSpreadsheet=heading==="スプシのデザイン";
      section.style.display=mode==="sheet"?(isSpreadsheet?"":"none"):(isSpreadsheet?"none":"");
    }
    const scrollHost=modal.querySelector(".modal");
    if(scrollHost)scrollHost.scrollTop=0;
  }
  function revealDesign(mode){
    const doc=sheetDocument();
    if(!doc)return;
    prepareSpreadsheetChrome();
    const button=doc.getElementById("designToolBtn");
    if(!button)return;
    button.click();
    setTimeout(()=>configureDesignModal(mode),0);
  }
  function openDesign(mode){
    closeMenu();
    if(typeof window.selectTool==="function")window.selectTool("spreadsheet");
    const doc=sheetDocument();
    if(doc?.readyState==="complete"&&doc.getElementById("designToolBtn"))revealDesign(mode);
    else spreadsheetFrame?.addEventListener("load",()=>setTimeout(()=>revealDesign(mode),0),{once:true});
  }

  globalDesign.addEventListener("click",()=>openDesign("global"));
  sheetDesign.addEventListener("click",()=>openDesign("sheet"));
  spreadsheetFrame?.addEventListener("load",()=>setTimeout(prepareSpreadsheetChrome,0));
  prepareSpreadsheetChrome();
}

installBoardSettingsMenu();
