"use strict";
(()=>{
  const boardId=new URL(location.href).searchParams.get("id")||"";
  if(!boardId)return;
  const frame=document.getElementById("spreadsheetFrame");
  if(!frame)return;
  const storageKey=`jijinboardGroupRowColors:${boardId}`;
  const endpoint=`/api/boards/${encodeURIComponent(boardId)}/group-row-colors`;
  const styleId="jijinboardGroupRowColorsStyle";
  let colors=readLocal();
  let saveTimer=0;

  const validColor=value=>/^#[0-9a-f]{6}$/i.test(String(value||""));
  function normalize(value){
    const out={};
    if(!value||typeof value!=="object"||Array.isArray(value))return out;
    for(const [id,color] of Object.entries(value).slice(0,100)){
      if(id&&validColor(color))out[String(id).slice(0,160)]=color;
    }
    return out;
  }
  function readLocal(){try{return normalize(JSON.parse(localStorage.getItem(storageKey)||"{}"))}catch{return {}}}
  function writeLocal(){try{localStorage.setItem(storageKey,JSON.stringify(colors))}catch{}}
  function adminToken(){
    try{return localStorage.getItem(`boardAdmin:${boardId}`)||JSON.parse(localStorage.getItem("jijinboardOwnedBoards.v1")||"{}")[boardId]?.adminToken||""}
    catch{return localStorage.getItem(`boardAdmin:${boardId}`)||""}
  }
  function rgba(hex,alpha=.85){
    const n=parseInt(String(hex).slice(1),16);
    return `rgba(${n>>16},${(n>>8)&255},${n&255},${alpha})`;
  }
  function attr(value){return String(value).replace(/\\/g,"\\\\").replace(/"/g,'\\"')}
  function apply(){
    try{
      const doc=frame.contentDocument;if(!doc?.head)return;
      let style=doc.getElementById(styleId);
      if(!style){style=doc.createElement("style");style.id=styleId;doc.head.append(style)}
      style.textContent=Object.entries(colors).map(([id,color])=>`
        html.embedded tbody[data-group-body="${attr(id)}"] > tr.group-row > .group-sticky-cell,
        html.embedded tbody[data-group-body="${attr(id)}"] > tr.group-row > .group-fill-cell{
          background:${rgba(color,.85)}!important;
        }
      `).join("\n");
    }catch{}
  }
  function groups(){
    try{
      const doc=frame.contentDocument;if(!doc)return[];
      return [...doc.querySelectorAll("tbody[data-group-body]")].map(body=>({
        id:body.dataset.groupBody||"",
        name:(body.querySelector(".group-title")?.textContent||"").trim()
      })).filter(group=>group.id&&group.name).filter((group,index,list)=>list.findIndex(item=>item.id===group.id)===index);
    }catch{return[]}
  }
  function installUiStyle(){
    if(document.getElementById("jijinboardGroupRowColorsUiStyle"))return;
    const style=document.createElement("style");style.id="jijinboardGroupRowColorsUiStyle";
    style.textContent=`
      #boardSettingsOverlay .group-row-color-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;max-height:86px;overflow:auto}
      #boardSettingsOverlay .group-row-color-field{display:flex;align-items:center;justify-content:space-between;gap:5px;min-width:0;min-height:28px;padding:3px 5px;border:1px solid #e5e8ed;border-radius:6px;background:#fafbfc;font-size:8px;font-weight:750}
      #boardSettingsOverlay .group-row-color-field span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #boardSettingsOverlay .group-row-color-field input{width:32px;height:21px;min-width:32px;padding:0;border:1px solid #dfe3e8;border-radius:5px;background:transparent}
      @media(max-width:620px){#boardSettingsOverlay .group-row-color-grid{grid-template-columns:repeat(2,minmax(0,1fr));max-height:112px}}
    `;
    document.head.append(style);
  }
  function renderUi(){
    const root=document.querySelector("#boardDesignSlot .scoped-theme-ui");
    if(!root)return;
    installUiStyle();
    const list=groups();
    let section=root.querySelector("#scopedGroupRowColors");
    if(!list.length){section?.remove();return}
    if(!section){
      section=document.createElement("section");section.id="scopedGroupRowColors";section.className="scoped-theme-section";
      const sections=root.querySelectorAll(".scoped-theme-section");
      if(sections[1])sections[1].before(section);else root.prepend(section);
    }
    section.replaceChildren();
    const head=document.createElement("div");head.className="scoped-theme-head";
    const title=document.createElement("b");title.textContent="グループ行";
    const note=document.createElement("span");note.textContent="区切りごとに色を設定";
    head.append(title,note);
    const grid=document.createElement("div");grid.className="group-row-color-grid";
    for(const group of list){
      const label=document.createElement("label");label.className="group-row-color-field";
      const name=document.createElement("span");name.textContent=group.name;
      const input=document.createElement("input");input.type="color";input.value=colors[group.id]||"#ffffff";input.dataset.groupId=group.id;
      input.addEventListener("input",()=>{
        colors={...colors,[group.id]:input.value};writeLocal();apply();scheduleSave();
      });
      label.append(name,input);grid.append(label);
    }
    section.append(head,grid);
  }
  function scheduleSave(){clearTimeout(saveTimer);saveTimer=setTimeout(saveRemote,420)}
  async function saveRemote(){
    const token=adminToken();if(!token)return;
    try{await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json","x-board-admin-token":token},body:JSON.stringify({colors})})}catch{}
  }
  async function loadRemote(){
    try{
      const response=await fetch(endpoint);if(!response.ok)return;
      const body=await response.json().catch(()=>null);if(!body)return;
      colors=normalize(body.colors);writeLocal();apply();renderUi();
    }catch{}
  }

  frame.addEventListener("load",()=>{apply();requestAnimationFrame(renderUi)});
  document.addEventListener("click",event=>{
    if(event.target?.closest?.('[data-board-settings-tab="design"]'))requestAnimationFrame(()=>setTimeout(renderUi,0));
  },true);
  apply();
  loadRemote();
})();
