(()=>{
  const originalRenderEditor=window.renderSheetLayoutEditor;
  const originalRenderCharacter=window.renderCharacterView;
  if(typeof originalRenderEditor!=='function')return;

  const COLS=6;
  const CELL=72;
  const GAP=6;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const placed=id=>!!(state.layout?.sheetLayout?.positions?.[id]&&Number.isFinite(Number(state.layout.sheetLayout.positions[id].row))&&Number.isFinite(Number(state.layout.sheetLayout.positions[id].col)));
  const ids=()=>{ensureSheetLayoutOrder();return(state.layout.sheetLayout.order||[]).filter(id=>id!=='ungrouped'||sheetLayoutHasUngroupedContent())};
  const baseRows=()=>Math.max(4,Number(state.layout?.sheetLayout?.baseRows)||8);
  const setBaseRows=n=>{state.layout.sheetLayout.baseRows=Math.max(4,Math.floor(n));saveLayoutState()};
  const spanOf=id=>clamp(Number(state.layout.sheetLayout?.sizes?.[id])||1,1,COLS);
  const heightOf=id=>Math.max(1,Number(state.layout.sheetLayout?.heights?.[id])||1);
  const posOf=id=>state.layout.sheetLayout.positions[id]||null;
  const boxOf=(id,pos=posOf(id),span=spanOf(id),height=heightOf(id))=>pos?{id,row:Number(pos.row)||1,col:Number(pos.col)||1,span,height}:null;
  const overlaps=(a,b)=>a.col<b.col+b.span&&a.col+a.span>b.col&&a.row<b.row+b.height&&a.row+a.height>b.row;
  const canPlace=(id,row,col,span,height)=>{
    if(row<1||col<1||col+span-1>COLS)return false;
    const a={id,row,col,span,height};
    return !ids().some(other=>other!==id&&placed(other)&&overlaps(a,boxOf(other)));
  };
  const save=()=>saveLayoutState();

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
    workspace=document.createElement('div');
    workspace.className='sheet-layout-workspace';
    const side=document.createElement('aside');
    side.className='sheet-layout-unplaced';
    side.innerHTML='<div class="sheet-layout-unplaced-title">未配置</div><div class="sheet-layout-unplaced-list"></div>';
    const main=document.createElement('div');
    main.className='sheet-layout-command-area';
    const toolbar=document.createElement('div');
    toolbar.className='sheet-layout-row-tools';
    toolbar.innerHTML='<span>縦 <b data-sheet-row-count></b>マス</span><button type="button" data-sheet-row-minus>−1行</button><button type="button" data-sheet-row-plus>＋1行</button>';
    const wrap=document.createElement('div');
    wrap.className='sheet-layout-canvas-wrap';
    canvas.parentNode.insertBefore(workspace,canvas);
    workspace.append(side,main);
    main.append(toolbar,wrap);
    wrap.appendChild(canvas);
    return workspace;
  }

  function metrics(canvas){
    const rect=canvas.getBoundingClientRect();
    const width=(rect.width-GAP*(COLS-1))/COLS;
    return{rect,width,stepX:width+GAP,stepY:CELL+GAP};
  }
  function pointToCell(canvas,x,y,grabCol=0,grabRow=0,span=1){
    const m=metrics(canvas);
    const col=clamp(Math.round((x-m.rect.left)/m.stepX)+1-grabCol,1,COLS-span+1);
    const row=Math.max(1,Math.round((y-m.rect.top)/m.stepY)+1-grabRow);
    return{row,col};
  }
  function styleBox(el,row,col,span,height){
    el.style.gridColumn=`${col} / span ${span}`;
    el.style.gridRow=`${row} / span ${height}`;
  }

  function makeCard(id){
    const card=document.createElement('div');
    card.className='sheet-layout-command-card';
    card.dataset.commandId=id;
    card.innerHTML=`<div class="sheet-layout-command-name">${esc(groupNameForLayout(id))}</div><div class="sheet-layout-command-size">${spanOf(id)}×${heightOf(id)}</div><button type="button" class="sheet-layout-remove" title="未配置へ戻す">×</button><button type="button" class="sheet-layout-resize" title="ドラッグして大きさを変更" aria-label="サイズ変更"></button>`;
    const p=posOf(id);
    styleBox(card,p.row,p.col,spanOf(id),heightOf(id));
    return card;
  }

  function paintCanvas(canvas){
    canvas.innerHTML='';
    for(const id of ids())if(placed(id))canvas.appendChild(makeCard(id));
    const bottom=Math.max(baseRows(),...ids().filter(placed).map(id=>posOf(id).row+heightOf(id)-1));
    if(bottom>baseRows())state.layout.sheetLayout.baseRows=bottom;
    canvas.style.setProperty('--sheet-rows',String(Math.max(baseRows(),bottom)));
    canvas.style.minHeight=(Math.max(baseRows(),bottom)*(CELL+GAP)-GAP+12)+'px';
  }

  function renderUnplaced(workspace){
    const list=workspace.querySelector('.sheet-layout-unplaced-list');
    const unplaced=ids().filter(id=>!placed(id));
    list.innerHTML=unplaced.length?unplaced.map(id=>`<button type="button" class="sheet-layout-unplaced-item" data-unplaced-id="${id}">${esc(groupNameForLayout(id))}</button>`).join(''):'<div class="sheet-layout-unplaced-empty">すべて配置済みです</div>';
  }

  function refreshRowTools(workspace,canvas){
    const count=workspace.querySelector('[data-sheet-row-count]');if(count)count.textContent=baseRows();
    const plus=workspace.querySelector('[data-sheet-row-plus]');
    const minus=workspace.querySelector('[data-sheet-row-minus]');
    if(plus)plus.onclick=()=>{setBaseRows(baseRows()+1);paintCanvas(canvas);wire(canvas,workspace);refreshRowTools(workspace,canvas)};
    if(minus)minus.onclick=()=>{
      const occupied=Math.max(4,...ids().filter(placed).map(id=>posOf(id).row+heightOf(id)-1));
      setBaseRows(Math.max(occupied,baseRows()-1));paintCanvas(canvas);wire(canvas,workspace);refreshRowTools(workspace,canvas);
    };
  }

  function startMove(id,card,e,fromUnplaced=false){
    if(e.button!==0)return;
    e.preventDefault();
    const canvas=document.getElementById('sheetLayoutCanvas');if(!canvas)return;
    const span=fromUnplaced?1:spanOf(id),height=fromUnplaced?1:heightOf(id);
    const m=metrics(canvas);
    const rect=fromUnplaced?null:card.getBoundingClientRect();
    const grabCol=fromUnplaced?0:clamp(Math.floor((e.clientX-rect.left)/m.stepX),0,span-1);
    const grabRow=fromUnplaced?0:clamp(Math.floor((e.clientY-rect.top)/m.stepY),0,height-1);
    const preview=fromUnplaced?makeCard(id):card;
    if(fromUnplaced){preview.classList.add('is-preview');canvas.appendChild(preview)}
    preview.classList.add('is-moving');
    let candidate=null;

    const move=ev=>{
      const cell=pointToCell(canvas,ev.clientX,ev.clientY,grabCol,grabRow,span);
      const valid=canPlace(id,cell.row,cell.col,span,height);
      candidate={...cell,valid};
      styleBox(preview,cell.row,cell.col,span,height);
      preview.classList.toggle('is-invalid',!valid);
      const needed=cell.row+height-1;
      if(needed>baseRows()){
        state.layout.sheetLayout.baseRows=needed;
        canvas.style.minHeight=(needed*(CELL+GAP)-GAP+12)+'px';
        workspaceRowCount();
      }
    };
    const end=()=>{
      window.removeEventListener('pointermove',move);
      window.removeEventListener('pointerup',end);
      window.removeEventListener('pointercancel',end);
      preview.classList.remove('is-moving','is-invalid');
      if(fromUnplaced)preview.remove();
      if(candidate?.valid){
        state.layout.sheetLayout.sizes[id]=span;
        state.layout.sheetLayout.heights[id]=height;
        state.layout.sheetLayout.positions[id]={row:candidate.row,col:candidate.col};
        save();
      }
      paintCanvas(canvas);renderUnplaced(canvas.closest('.sheet-layout-workspace'));wire(canvas,canvas.closest('.sheet-layout-workspace'));refreshRowTools(canvas.closest('.sheet-layout-workspace'),canvas);
    };
    const workspaceRowCount=()=>{const w=canvas.closest('.sheet-layout-workspace');const b=w?.querySelector('[data-sheet-row-count]');if(b)b.textContent=baseRows()};
    window.addEventListener('pointermove',move);
    window.addEventListener('pointerup',end,{once:true});
    window.addEventListener('pointercancel',end,{once:true});
    move(e);
  }

  function startResize(id,card,e){
    e.preventDefault();e.stopPropagation();
    const canvas=document.getElementById('sheetLayoutCanvas');if(!canvas)return;
    const p={...posOf(id)},startSpan=spanOf(id),startHeight=heightOf(id),m=metrics(canvas),sx=e.clientX,sy=e.clientY;
    let candidate={span:startSpan,height:startHeight,valid:true};
    card.classList.add('is-resizing');
    const move=ev=>{
      const span=clamp(startSpan+Math.round((ev.clientX-sx)/m.stepX),1,COLS-p.col+1);
      const height=Math.max(1,startHeight+Math.round((ev.clientY-sy)/m.stepY));
      const valid=canPlace(id,p.row,p.col,span,height);
      candidate={span,height,valid};
      styleBox(card,p.row,p.col,span,height);
      card.querySelector('.sheet-layout-command-size').textContent=`${span}×${height}`;
      card.classList.toggle('is-invalid',!valid);
      const needed=p.row+height-1;
      if(needed>baseRows()){
        state.layout.sheetLayout.baseRows=needed;
        canvas.style.minHeight=(needed*(CELL+GAP)-GAP+12)+'px';
        const count=canvas.closest('.sheet-layout-workspace')?.querySelector('[data-sheet-row-count]');if(count)count.textContent=needed;
      }
    };
    const end=()=>{
      window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',end);window.removeEventListener('pointercancel',end);
      card.classList.remove('is-resizing','is-invalid');
      if(candidate.valid){state.layout.sheetLayout.sizes[id]=candidate.span;state.layout.sheetLayout.heights[id]=candidate.height;save()}
      paintCanvas(canvas);wire(canvas,canvas.closest('.sheet-layout-workspace'));refreshRowTools(canvas.closest('.sheet-layout-workspace'),canvas);
    };
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',end,{once:true});window.addEventListener('pointercancel',end,{once:true});
  }

  function wire(canvas,workspace){
    canvas.querySelectorAll('[data-command-id]').forEach(card=>{
      const id=card.dataset.commandId;
      card.querySelector('.sheet-layout-remove').onclick=e=>{e.stopPropagation();delete state.layout.sheetLayout.positions[id];save();paintCanvas(canvas);renderUnplaced(workspace);wire(canvas,workspace);refreshRowTools(workspace,canvas)};
      card.querySelector('.sheet-layout-resize').addEventListener('pointerdown',e=>startResize(id,card,e));
      card.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;startMove(id,card,e,false)});
    });
    workspace.querySelectorAll('[data-unplaced-id]').forEach(btn=>btn.addEventListener('pointerdown',e=>startMove(btn.dataset.unplacedId,btn,e,true)));
  }

  function repairOverlaps(){
    const occupied=[];let changed=false;
    for(const id of ids()){
      if(!placed(id))continue;
      let b=boxOf(id);
      if(!occupied.some(x=>overlaps(b,x))){occupied.push(b);continue}
      outer:for(let row=1;row<200;row++)for(let col=1;col<=COLS-spanOf(id)+1;col++)if(!occupied.some(x=>overlaps({id,row,col,span:spanOf(id),height:heightOf(id)},x))){state.layout.sheetLayout.positions[id]={row,col};b=boxOf(id);occupied.push(b);changed=true;break outer}
    }
    if(changed)saveLayoutState();
  }

  window.renderSheetLayoutEditor=function(){
    const before={...state.layout.sheetLayout.positions};
    originalRenderEditor();
    for(const id of ids())if(!Object.prototype.hasOwnProperty.call(before,id))delete state.layout.sheetLayout.positions[id];
    repairOverlaps();
    const canvas=document.getElementById('sheetLayoutCanvas');if(!canvas)return;
    const workspace=ensureWorkspace(canvas);
    paintCanvas(canvas);
    renderUnplaced(workspace);
    refreshRowTools(workspace,canvas);
    wire(canvas,workspace);
    hideUnplacedCharacterGroups();
  };
})();