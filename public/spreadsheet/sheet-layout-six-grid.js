(()=>{
  const originalRenderEditor=window.renderSheetLayoutEditor;
  const originalRenderCharacter=window.renderCharacterView;
  if(typeof originalRenderEditor!=='function')return;

  const placed=id=>!!(state.layout?.sheetLayout?.positions?.[id] && Number.isFinite(Number(state.layout.sheetLayout.positions[id].row)) && Number.isFinite(Number(state.layout.sheetLayout.positions[id].col)));
  const ids=()=>{
    ensureSheetLayoutOrder();
    return (state.layout.sheetLayout.order||[]).filter(id=>id!=='ungrouped'||sheetLayoutHasUngroupedContent());
  };
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const save=()=>{saveLayoutState(); if(typeof renderCharacterView==='function')renderCharacterView()};

  function hideUnplacedCharacterGroups(){
    const hidden=new Set(ids().filter(id=>!placed(id)).map(id=>groupNameForLayout(id).trim()));
    document.querySelectorAll('.character-sheet-group').forEach(section=>{
      const title=section.querySelector('.character-sheet-group-title')?.textContent?.trim();
      if(title)section.style.display=hidden.has(title)?'none':'';
    });
  }
  window.renderCharacterView=function(){
    originalRenderCharacter();
    hideUnplacedCharacterGroups();
  };

  function ensureWorkspace(canvas){
    let workspace=canvas.closest('.sheet-layout-workspace');
    if(workspace)return workspace;
    workspace=document.createElement('div');workspace.className='sheet-layout-workspace';
    const side=document.createElement('aside');side.className='sheet-layout-unplaced';side.innerHTML='<div class="sheet-layout-unplaced-title">未配置</div><div class="sheet-layout-unplaced-list"></div>';
    const wrap=document.createElement('div');wrap.className='sheet-layout-canvas-wrap';
    canvas.parentNode.insertBefore(workspace,canvas);workspace.append(side,wrap);wrap.appendChild(canvas);
    return workspace;
  }
  function renderUnplaced(workspace){
    const list=workspace.querySelector('.sheet-layout-unplaced-list');
    const unplaced=ids().filter(id=>!placed(id));
    list.innerHTML=unplaced.length?unplaced.map(id=>`<div class="sheet-layout-unplaced-item" draggable="true" data-unplaced-id="${id}">${esc(groupNameForLayout(id))}</div>`).join(''):'<div class="sheet-layout-unplaced-empty">すべて配置済みです</div>';
    list.querySelectorAll('[data-unplaced-id]').forEach(el=>{
      el.addEventListener('dragstart',e=>{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/x-sheet-group',el.dataset.unplacedId);e.dataTransfer.setData('text/plain',el.dataset.unplacedId)});
    });
  }
  function canvasCell(canvas,e){
    const r=canvas.getBoundingClientRect(), cs=getComputedStyle(canvas), gap=parseFloat(cs.columnGap)||6;
    const cw=(r.width-gap*5)/6, rh=78;
    return {col:clamp(Math.floor((e.clientX-r.left)/(cw+gap))+1,1,6),row:Math.max(1,Math.floor((e.clientY-r.top)/(rh+gap))+1)};
  }
  function addControls(canvas,workspace){
    canvas.querySelectorAll('[data-layout-card]').forEach(card=>{
      const id=card.dataset.layoutCard;
      card.querySelector('.sheet-layout-controls')?.remove();
      const remove=document.createElement('button');remove.type='button';remove.className='sheet-layout-remove';remove.title='未配置へ戻す';remove.textContent='×';
      remove.onclick=e=>{e.stopPropagation();delete state.layout.sheetLayout.positions[id];save();renderSheetLayoutEditor()};
      const resize=document.createElement('button');resize.type='button';resize.className='sheet-layout-resize';resize.title='ドラッグして大きさを変更';
      resize.addEventListener('pointerdown',e=>{
        e.preventDefault();e.stopPropagation();resize.setPointerCapture?.(e.pointerId);card.classList.add('is-resizing');
        const startX=e.clientX,startY=e.clientY,startSpan=sheetGroupSpan(id),startH=sheetGroupHeight(id),rect=canvas.getBoundingClientRect(),gap=parseFloat(getComputedStyle(canvas).columnGap)||6,cw=(rect.width-gap*5)/6,rh=78;
        const move=ev=>{const span=clamp(startSpan+Math.round((ev.clientX-startX)/(cw+gap)),1,6),h=Math.max(1,startH+Math.round((ev.clientY-startY)/(rh+gap)));state.layout.sheetLayout.sizes[id]=span;state.layout.sheetLayout.heights[id]=h;const p=state.layout.sheetLayout.positions[id];if(p)p.col=clamp(p.col,1,7-span);card.style.gridColumn=`${p?.col||1} / span ${span}`;card.style.gridRow=`${p?.row||1} / span ${h}`};
        const up=()=>{card.classList.remove('is-resizing');window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);save()};
        window.addEventListener('pointermove',move);window.addEventListener('pointerup',up,{once:true});
      });
      card.append(remove,resize);
    });
    canvas.ondragover=e=>{e.preventDefault();canvas.classList.add('drag-over');e.dataTransfer.dropEffect='move'};
    canvas.ondragleave=()=>canvas.classList.remove('drag-over');
    canvas.ondrop=e=>{
      e.preventDefault();canvas.classList.remove('drag-over');const id=e.dataTransfer.getData('text/x-sheet-group')||e.dataTransfer.getData('text/plain');if(!ids().includes(id))return;
      const c=canvasCell(canvas,e),span=placed(id)?sheetGroupSpan(id):1,h=placed(id)?sheetGroupHeight(id):1;
      state.layout.sheetLayout.sizes[id]=span;state.layout.sheetLayout.heights[id]=h;state.layout.sheetLayout.positions[id]={row:c.row,col:clamp(c.col,1,7-span)};save();renderSheetLayoutEditor();
    };
    renderUnplaced(workspace);
  }

  window.renderSheetLayoutEditor=function(){
    // Prevent the legacy editor from auto-placing new groups.
    const before={...state.layout.sheetLayout.positions};
    originalRenderEditor();
    for(const id of ids())if(!Object.prototype.hasOwnProperty.call(before,id))delete state.layout.sheetLayout.positions[id];
    const canvas=document.getElementById('sheetLayoutCanvas');if(!canvas)return;
    const workspace=ensureWorkspace(canvas);
    // Remove cards which are not actually placed.
    canvas.querySelectorAll('[data-layout-card]').forEach(card=>{if(!placed(card.dataset.layoutCard))card.remove()});
    canvas.style.minHeight=Math.max(720,(Math.max(8,...ids().filter(placed).map(id=>(state.layout.sheetLayout.positions[id].row||1)+(sheetGroupHeight(id)||1))) * 78))+'px';
    canvas.style.height='auto';
    addControls(canvas,workspace);hideUnplacedCharacterGroups();
  };
})();
