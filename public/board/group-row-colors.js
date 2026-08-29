"use strict";
(()=>{
  const boardId=new URL(location.href).searchParams.get("id")||"";
  if(!boardId)return;
  const frame=document.getElementById("spreadsheetFrame");
  if(!frame)return;
  const storageKey=`jijinboardGroupRowColors:${boardId}`;
  const endpoint=`/api/boards/${encodeURIComponent(boardId)}/group-row-colors`;
  const styleId="jijinboardGroupRowColorsStyle";
  let color=readLocal();
  let saveTimer=0;

  const validColor=value=>/^#[0-9a-f]{6}$/i.test(String(value||""));
  function normalize(value){
    if(validColor(value))return value;
    if(value&&typeof value==="object"){
      if(validColor(value.color))return value.color;
      const first=Object.values(value).find(validColor);
      if(first)return first;
    }
    return "#ffffff";
  }
  function readLocal(){try{return normalize(JSON.parse(localStorage.getItem(storageKey)||"null"))}catch{return "#ffffff"}}
  function writeLocal(){try{localStorage.setItem(storageKey,JSON.stringify({color}))}catch{}}
  function adminToken(){
    try{return localStorage.getItem(`boardAdmin:${boardId}`)||JSON.parse(localStorage.getItem("jijinboardOwnedBoards.v1")||"{}")[boardId]?.adminToken||""}
    catch{return localStorage.getItem(`boardAdmin:${boardId}`)||""}
  }
  function rgba(hex,alpha=.85){
    const n=parseInt(String(hex).slice(1),16);
    return `rgba(${n>>16},${(n>>8)&255},${n&255},${alpha})`;
  }
  function apply(){
    try{
      const doc=frame.contentDocument;if(!doc?.head)return;
      let style=doc.getElementById(styleId);
      if(!style){style=doc.createElement("style");style.id=styleId;doc.head.append(style)}
      style.textContent=`
        html.embedded .group-row .group-sticky-cell,
        html.embedded .group-row .group-fill-cell,
        html.embedded .group-row td{
          background:${rgba(color,.85)}!important;
          background-image:none!important;
        }
      `;
    }catch{}
  }
  function hasGroups(){
    try{return !!frame.contentDocument?.querySelector(".group-row")}catch{return false}
  }
  function installUiStyle(){
    if(document.getElementById("jijinboardGroupRowColorsUiStyle"))return;
    const style=document.createElement("style");style.id="jijinboardGroupRowColorsUiStyle";
    style.textContent=`
      #boardSettingsOverlay .group-row-color-field{display:flex;align-items:center;justify-content:space-between;gap:6px;min-height:30px;padding:4px 6px;border:1px solid #e5e8ed;border-radius:7px;background:#fafbfc;font-size:8px;font-weight:750}
      #boardSettingsOverlay .group-row-color-field input{width:34px;height:22px;padding:0;border:1px solid #dfe3e8;border-radius:5px;background:transparent}
    `;
    document.head.append(style);
  }
  function renderUi(){
    const root=document.querySelector("#boardDesignSlot .scoped-theme-ui");
    if(!root)return;
    installUiStyle();
    let section=root.querySelector("#scopedGroupRowColors");
    if(!hasGroups()){section?.remove();return}
    if(!section){
      section=document.createElement("section");section.id="scopedGroupRowColors";section.className="scoped-theme-section";
      const first=root.querySelector(".scoped-theme-section");
      if(first)first.after(section);else root.prepend(section);
    }
    section.replaceChildren();
    const head=document.createElement("div");head.className="scoped-theme-head";
    const title=document.createElement("b");title.textContent="グループ行";
    head.append(title);
    const label=document.createElement("label");label.className="group-row-color-field";
    const name=document.createElement("span");name.textContent="区切り行の色";
    const input=document.createElement("input");input.type="color";input.value=color;
    input.addEventListener("input",()=>{color=input.value;writeLocal();apply();scheduleSave()});
    label.append(name,input);section.append(head,label);
  }
  function scheduleSave(){clearTimeout(saveTimer);saveTimer=setTimeout(saveRemote,420)}
  async function saveRemote(){
    const token=adminToken();if(!token)return;
    try{
      await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json","x-board-admin-token":token},body:JSON.stringify({color,colors:{color}})});
    }catch{}
  }
  async function loadRemote(){
    try{
      const response=await fetch(endpoint);if(!response.ok)return;
      const body=await response.json().catch(()=>null);if(!body)return;
      color=normalize(body.color??body.colors);writeLocal();apply();renderUi();
    }catch{}
  }

  frame.addEventListener("load",()=>{apply();requestAnimationFrame(renderUi)});
  document.addEventListener("click",event=>{
    if(event.target?.closest?.('[data-board-settings-tab="design"]'))requestAnimationFrame(()=>setTimeout(renderUi,0));
  },true);
  apply();
  loadRemote();
})();
