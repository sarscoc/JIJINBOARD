(()=>{
  const originalRenderEditor=window.renderSheetLayoutEditor;
  const originalRenderCharacter=window.renderCharacterView;
  if(typeof originalRenderEditor!=='function')return;

  const ROW=78;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const placed=id=>!!(state.layout?.sheetLayout?.positions?.[id]&&Number.isFinite(Number(state.layout.sheetLayout.positions[id].row))&&Number.isFinite(Number(state.layout.sheetLayout.positions[id].col)));
  const ids=()=>{ensureSheetLayoutOrder();return(state.layout.sheetLayout.order||[]).filter(id=>id!=='ungrouped'||sheetLayoutHasUngroupedContent())};
  const save=()=>{saveLayoutState();if(typeof renderCharacterView==='function')renderCharacterView()};

  function rectFor(id,pos=null,span=null,height=null){
    const p=pos||state.layout.sheetLayout.positions[id];
    if(!p)return null;
    return{row:Number(p.row)||1,col:Number(p.col)||1,span:span||sheetGroupSpan(id),height:height||sheetGroupHeight(id)};
  }
  function overlaps(a,b){
    return a.col<a.col+b.span&&a.col+a.span>b.col&&a.row<b.row+b.height&&a.row+a.height>b.row;
  }
  function canOccupy(id,row,col,span,height){
    const candidate={row,col,span,height};
    if(col<1||row<1||col+span-1>6)return false;
    for(const other of ids()){
      if(other===id||!placed(other))continue;
      const box=rectFor(other);if(box&&overlaps(candidate,box))return false;
    }
    return true;
  }
  function firstFree(id,startRow,startCol,span,height){
    const maxStart=Math.max(1,7-span);
    for(let row=Math.max(1,startRow);row<startRow+100;row++){
      for(let offset=0;offset<6;offset++){
        const col=clamp(startCol+offset,1,maxStart);
        if(canOccupy(id,row,col,span,height))return{row,col};
      }
      for(let col=1;col<=maxStart;col++)if(canOccupy(id,row,col,span,height))return{row,col};
    }
    return null;
  }

  function hideUnplacedCharacterGroups(){
    const hidden=new Set(ids().filter(id=>!placed(id)).map(id=>groupNameForLayout(id).trim()));
    document.querySelectorAll('.character-sheet-group').forEach(section=>{
      const title=section.querySelector('.character-sheet-group-title')?.textContent?.trim();
      if(title)section.style.display=hidden.has(title)?'none':'';
    });
  }
  window.renderCharacterView=function(){originalRenderCharacter();hideUnplacedCharacterGroups()};

  function ensureWorkspace(canvas){
    let workspace=canvas.closest('.sheet-layout-workspace');
    if(workspace)return workspace;
    workspace=document.createElement('div');workspace.className='sheet-layout-workspace';
    const side=document.createElement('aside');side.className='sheet-layout-unplaced';side.innerHTML='<div class="sheet-layout-unplaced-title">未配置</div><div class="sheet-layout-unplaced-list"></div>';
    const wrap=document.createElement('div');wrap.className='sheet-layout-canvas-wrap';
    canvas.parentNode.insertBefore(workspace,canvas);workspace.append(side,wrap);wrap.appendChild(canvas);
    return workspace;
  }
  function metrics(canvas){
    const r=canvas.getBoundingClientRect(),cs=getComputedStyle(canvas),gap=parseFloat(cs.columnGap)||6;
    return{rect:r,gap,cw:(r.width-gap*5)/6,rh:ROW};
  }
  function cellFromTopLeft(canvas,left,top,span=1){
    const m=metrics(canvas),stepX=m.cw+m.gap,stepY=m.rh+m.gap;
    return{col:clamp(Math.round((left-m.rect.left)/stepX)+1,1,Math.max(1,7-span)),row:Math.max(1,Math.round((top-m.rect.top)/stepY)+1)};
  }
  function cellBox(canvas,row,col,span,height){
    const m=metrics(canvas),stepX=m.cw+m.gap,stepY=m.rh+m.gap;
    return{left:m.rect.left+(col-1)*stepX,top:m.rect.top+(row-1)*stepY,width:m.cw*span+m.gap*(span-1),height:m.rh*height+m.gap*(height-1)};
  }
  function makeGhost(source,name){
    const ghost=source?.cloneNode(true)||document.createElement('div');
    ghost.removeAttribute('draggable');ghost.removeAttribute('data-layout-card');ghost.classList.add('sheet-layout-drag-ghost');ghost.classList.remove('dragging','is-resizing');
    ghost.querySelectorAll('button,select,input,.sheet-layout-resize,.sheet-layout-remove').forEach(el=>el.remove());
    if(!source){ghost.classList.add('sheet-layout-card');ghost.innerHTML=`<div class="sheet-layout-name">${esc(name||'')}</div>`}
    document.body.appendChild(ghost);return ghost;
  }
  function setGhost(ghost,box,valid){
    ghost.style.left=box.left+'px';ghost.style.top=box.top+'px';ghost.style.width=box.width+'px';ghost.style.height=box.height+'px';
    ghost.classList.toggle('is-invalid',!valid);ghost.classList.toggle('is-valid',valid);
  }

  function beginDrag({id,source,event,fromUnplaced=false}){
    if(event.button!==0)return;
    event.preventDefault();
    const canvas=document.getElementById('sheetLayoutCanvas');if(!canvas)return;
    const span=fromUnplaced?1:sheetGroupSpan(id),height=fromUnplaced?1:sheetGroupHeight(id);
    const sourceRect=source?.getBoundingClientRect?.()||{left:event.clientX,top:event.clientY,width:1,height:1};
    const grabX=fromUnplaced?Math.min(18,sourceRect.width/2):event.clientX-sourceRect.left;
    const grabY=fromUnplaced?Math.min(18,sourceRect.height/2):event.clientY-sourceRect.top;
    const ghost=makeGhost(fromUnplaced?null:source,groupNameForLayout(id));
    source?.classList.add('is-being-dragged');
    let candidate=null;

    const move=ev=>{
      const rawLeft=ev.clientX-grabX,rawTop=ev.clientY-grabY;
      const cell=cellFromTopLeft(canvas,rawLeft,rawTop,span);
      const valid=canOccupy(id,cell.row,cell.col,span,height);
      candidate={...cell,valid};
      setGhost(ghost,cellBox(canvas,cell.row,cell.col,span,height),valid);
      canvas.classList.toggle('drop-invalid',!valid);canvas.classList.toggle('drag-over',valid);
    };
    const finish=()=>{
      window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish);window.removeEventListener('pointercancel',finish);
      ghost.remove();source?.classList.remove('is-being-dragged');canvas.classList.remove('drop-invalid','drag-over');
      if(candidate?.valid){
        state.layout.sheetLayout.sizes[id]=span;state.layout.sheetLayout.heights[id]=height;state.layout.sheetLayout.positions[id]={row:candidate.row,col:candidate.col};
        save();renderSheetLayoutEditor();
      }
    };
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',finish,{once:true});window.addEventListener('pointercancel',finish,{once:true});
    move(event);
  }

  function renderUnplaced(workspace){
    const list=workspace.querySelector('.sheet-layout-unplaced-list'),unplaced=ids().filter(id=>!placed(id));
    list.innerHTML=unplaced.length?unplaced.map(id=>`<button type="button" class="sheet-layout-unplaced-item" data-unplaced-id="${id}">${esc(groupNameForLayout(id))}</button>`).join(''):'<div class="sheet-layout-unplaced-empty">すべて配置済みです</div>';
    list.querySelectorAll('[data-unplaced-id]').forEach(el=>el.addEventListener('pointerdown',e=>beginDrag({id:el.dataset.unplacedId,source:el,event:e,fromUnplaced:true})));
  }

  function addControls(canvas,workspace){
    canvas.ondragover=null;canvas.ondragleave=null;canvas.ondrop=null;
    canvas.querySelectorAll('[data-layout-card]').forEach(card=>{
      const id=card.dataset.layoutCard;card.draggable=false;card.removeAttribute('draggable');
      card.querySelector('.sheet-layout-controls')?.remove();
      const remove=document.createElement('button');remove.type='button';remove.className='sheet-layout-remove';remove.title='未配置へ戻す';remove.textContent='×';
      remove.onclick=e=>{e.stopPropagation();delete state.layout.sheetLayout.positions[id];save();renderSheetLayoutEditor()};
      const resize=document.createElement('button');resize.type='button';resize.className='sheet-layout-resize';resize.title='ドラッグして大きさを変更';
      resize.addEventListener('pointerdown',e=>{
        e.preventDefault();e.stopPropagation();card.classList.add('is-resizing');
        const startX=e.clientX,startY=e.clientY,startSpan=sheetGroupSpan(id),startH=sheetGroupHeight(id),p={...state.layout.sheetLayout.positions[id]},m=metrics(canvas);
        let last={span:startSpan,height:startH};
        const move=ev=>{
          const wantedSpan=clamp(startSpan+Math.round((ev.clientX-startX)/(m.cw+m.gap)),1,6);
          const wantedH=Math.max(1,startH+Math.round((ev.clientY-startY)/(m.rh+m.gap)));
          const span=clamp(wantedSpan,1,7-p.col),height=wantedH;
          const valid=canOccupy(id,p.row,p.col,span,height);
          card.classList.toggle('resize-invalid',!valid);
          if(!valid)return;
          last={span,height};state.layout.sheetLayout.sizes[id]=span;state.layout.sheetLayout.heights[id]=height;
          card.style.gridColumn=`${p.col} / span ${span}`;card.style.gridRow=`${p.row} / span ${height}`;
        };
        const up=()=>{card.classList.remove('is-resizing','resize-invalid');window.removeEventListener('pointermove',move);save();renderSheetLayoutEditor()};
        window.addEventListener('pointermove',move);window.addEventListener('pointerup',up,{once:true});
      });
      card.append(remove,resize);
      card.addEventListener('pointerdown',e=>{
        if(e.target.closest('button,select,input,.sheet-layout-resize,.sheet-layout-remove'))return;
        beginDrag({id,source:card,event:e,fromUnplaced:false});
      });
    });
    renderUnplaced(workspace);
  }

  function repairExistingOverlaps(){
    const used=[];let changed=false;
    for(const id of ids()){
      if(!placed(id))continue;
      const box=rectFor(id);if(!box)continue;
      const conflict=used.some(other=>overlaps(box,other.box));
      if(conflict){
        const free=firstFree(id,box.row,box.col,box.span,box.height);
        if(free){state.layout.sheetLayout.positions[id]=free;changed=true;used.push({id,box:{...box,...free}})}
      }else used.push({id,box});
    }
    if(changed)saveLayoutState();
  }

  window.renderSheetLayoutEditor=function(){
    const before={...state.layout.sheetLayout.positions};
    originalRenderEditor();
    for(const id of ids())if(!Object.prototype.hasOwnProperty.call(before,id))delete state.layout.sheetLayout.positions[id];
    repairExistingOverlaps();
    const canvas=document.getElementById('sheetLayoutCanvas');if(!canvas)return;
    const workspace=ensureWorkspace(canvas);
    canvas.querySelectorAll('[data-layout-card]').forEach(card=>{if(!placed(card.dataset.layoutCard))card.remove()});
    const bottom=Math.max(8,...ids().filter(placed).map(id=>(state.layout.sheetLayout.positions[id].row||1)+(sheetGroupHeight(id)||1)));
    canvas.style.minHeight=Math.max(720,bottom*ROW)+'px';canvas.style.height='auto';
    addControls(canvas,workspace);hideUnplacedCharacterGroups();
  };
})();