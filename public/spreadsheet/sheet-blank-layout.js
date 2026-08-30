(()=>{
  "use strict";
  if(typeof window.renderSheetLayoutEditor!=="function"||typeof window.ensureSheetLayoutOrder!=="function")return;

  const style=document.createElement("style");
  style.textContent=`
    .sheet-layout-workspace{display:grid;grid-template-columns:180px minmax(0,1fr);gap:10px;align-items:start}
    .sheet-layout-unplaced{position:sticky;top:54px;border:1px solid var(--line);border-radius:10px;background:#fff;padding:7px;min-height:120px;max-height:calc(88vh - 130px);overflow:auto}
    .sheet-layout-unplaced-title{font-size:10px;font-weight:900;margin:1px 2px 6px;color:#59616f}
    .sheet-layout-unplaced-note{font-size:8px;line-height:1.35;color:var(--muted);margin:0 2px 7px}
    .sheet-layout-unplaced-list{display:grid;gap:5px}
    .sheet-layout-unplaced .sheet-layout-card{display:grid!important;position:relative!important;grid-column:auto!important;grid-row:auto!important;width:100%!important;min-height:44px!important;margin:0!important}
    .sheet-layout-unplaced-empty{font-size:9px;color:var(--muted);padding:12px 4px;text-align:center}
    .sheet-layout-canvas:empty::after{content:"ここへ項目をドラッグして配置";display:grid;place-items:center;min-height:220px;color:#9aa2af;font-size:10px}
    @media(max-width:760px){.sheet-layout-workspace{grid-template-columns:1fr}.sheet-layout-unplaced{position:static;max-height:180px}}
  `;
  document.head.appendChild(style);

  // Missing positions are now truly "unplaced". Existing saved positions are kept.
  window.ensureSheetGridPositions=function(){
    ensureSheetLayoutOrder();
  };

  const baseRender=window.renderSheetLayoutEditor;
  let dropHooked=false;

  function ensureWorkspace(){
    const canvas=document.getElementById("sheetLayoutCanvas");
    if(!canvas)return null;
    let workspace=canvas.parentElement?.classList?.contains("sheet-layout-workspace")?canvas.parentElement:null;
    if(!workspace){
      workspace=document.createElement("div");
      workspace.className="sheet-layout-workspace";
      canvas.parentNode.insertBefore(workspace,canvas);
      const shelf=document.createElement("aside");
      shelf.className="sheet-layout-unplaced";
      shelf.innerHTML='<div class="sheet-layout-unplaced-title">未配置</div><div class="sheet-layout-unplaced-note">項目を右のマスへドラッグして配置</div><div class="sheet-layout-unplaced-list"></div>';
      workspace.append(shelf,canvas);
    }
    return {workspace,canvas,shelf:workspace.querySelector(".sheet-layout-unplaced-list")};
  }

  function separateUnplaced(){
    const parts=ensureWorkspace();
    if(!parts)return;
    const {canvas,shelf}=parts;
    const cards=[...canvas.querySelectorAll("[data-layout-card]")];
    for(const card of cards){
      const id=card.dataset.layoutCard;
      if(!sheetGroupPosition(id))shelf.appendChild(card);
    }
    if(!shelf.querySelector("[data-layout-card]"))shelf.innerHTML='<div class="sheet-layout-unplaced-empty">すべて配置済みです</div>';

    if(!dropHooked){
      dropHooked=true;
      canvas.addEventListener("drop",()=>setTimeout(()=>window.renderSheetLayoutEditor(),0));
    }
  }

  window.renderSheetLayoutEditor=function(){
    baseRender();
    separateUnplaced();
  };

  // Character view should contain only groups that have actually been placed.
  const baseCharacterView=typeof window.renderCharacterView==="function"?window.renderCharacterView:null;
  function hideUnplacedCharacterGroups(){
    const groups=[{id:"ungrouped",name:"未分類"},...(state.layout?.groups||[])];
    const byName=new Map(groups.map(g=>[String(g.name||"").trim(),g.id]));
    document.querySelectorAll(".character-sheet-grid .character-sheet-group").forEach(section=>{
      const title=String(section.querySelector(".character-sheet-group-title")?.textContent||"").trim();
      const id=byName.get(title);
      if(id)section.hidden=!sheetGroupPosition(id);
    });
  }
  if(baseCharacterView){
    window.renderCharacterView=function(){
      const result=baseCharacterView.apply(this,arguments);
      requestAnimationFrame(hideUnplacedCharacterGroups);
      return result;
    };
  }
})();
