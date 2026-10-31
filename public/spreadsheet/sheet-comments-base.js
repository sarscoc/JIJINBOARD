(()=>{
  const board=new URL(location.href).searchParams.get('board');if(!board)return;
  let mode=localStorage.getItem('sheetCommentMode')||'comment';

  function setupTocOverlay(){
    if(!document.documentElement.classList.contains('embedded'))return;
    const existing=document.querySelector('#jijinSheetTocRail');
    if(existing){existing.__place?.();return}
    document.querySelector('#sheetTocRail')?.remove();
    const source=document.querySelector('#databaseLayout>.database-toc');
    const inner=source?.querySelector('.database-toc-inner');
    const layout=document.querySelector('#databaseLayout');
    if(!source||!inner||!layout)return;

    inner.querySelector('.database-toc-title')?.remove();
    const style=document.createElement('style');
    style.id='jijinSheetTocStyle';
    style.textContent=`
      #jijinSheetTocRail{position:fixed!important;left:0!important;width:18px!important;margin:0!important;padding:0!important;border:0!important;background:transparent!important;overflow:visible!important;z-index:2147483000!important;cursor:pointer!important}
      #jijinSheetTocRail[hidden]{display:none!important}
      #jijinSheetTocHandle{position:absolute!important;left:9px!important;top:50%!important;transform:translate(-50%,-50%)!important;margin:0!important;padding:0!important;border:0!important;background:transparent!important;box-shadow:none!important;color:rgba(73,82,96,.68)!important;font:400 16px/1 system-ui!important;pointer-events:none!important;user-select:none!important}
      #jijinSheetTocPopover{position:absolute!important;left:14px!important;top:0;margin:0!important;padding:6px!important;width:max-content!important;min-width:96px!important;max-width:calc(100vw - 32px)!important;height:max-content!important;max-height:none!important;overflow:visible!important;border:1px solid #e2e7ed!important;border-radius:8px!important;background:rgba(255,255,255,.97)!important;backdrop-filter:blur(18px) saturate(130%)!important;-webkit-backdrop-filter:blur(18px) saturate(130%)!important;box-shadow:0 8px 24px rgba(42,51,67,.10)!important;opacity:0!important;visibility:hidden!important;pointer-events:none!important;transform:translateX(-4px)!important;transition:opacity .08s ease,transform .08s ease!important}
      #jijinSheetTocRail.open #jijinSheetTocPopover{opacity:1!important;visibility:visible!important;pointer-events:auto!important;transform:translateX(0)!important}
      #jijinSheetTocPopover>.database-toc-inner{position:static!important;inset:auto!important;display:block!important;width:max-content!important;min-width:100%!important;max-width:none!important;height:max-content!important;max-height:none!important;margin:0!important;padding:0!important;border:0!important;background:transparent!important;box-shadow:none!important;overflow:visible!important;opacity:1!important;visibility:visible!important;pointer-events:auto!important;transform:none!important}
      #jijinSheetTocPopover .database-toc-title{display:none!important}
      #jijinSheetTocPopover #databaseToc{display:grid!important;grid-template-columns:max-content!important;gap:1px!important;width:max-content!important;min-width:100%!important;margin:0!important;padding:0!important;background:transparent!important}
      #jijinSheetTocPopover .database-toc-link{display:block!important;width:auto!important;min-width:100%!important;margin:0!important;padding:3px 5px!important;border:0!important;border-radius:5px!important;background:transparent!important;color:#626b78!important;font:500 7px/1.25 system-ui,-apple-system,"Segoe UI","Noto Sans JP",sans-serif!important;letter-spacing:0!important;text-align:left!important;text-decoration:none!important;white-space:nowrap!important;overflow:visible!important;text-overflow:clip!important}
      #jijinSheetTocPopover .database-toc-link:hover{background:#f0f3f8!important;color:#303843!important}
    `;
    document.head.appendChild(style);

    const rail=document.createElement('div');
    rail.id='jijinSheetTocRail';
    rail.innerHTML='<span id="jijinSheetTocHandle" aria-hidden="true">︙</span><div id="jijinSheetTocPopover"></div>';
    const popover=rail.querySelector('#jijinSheetTocPopover');
    popover.appendChild(inner);
    source.remove();
    document.body.appendChild(rail);

    const place=()=>{
      const target=document.querySelector('#databaseLayout');
      if(!target)return;
      const cs=getComputedStyle(target),rect=target.getBoundingClientRect();
      const hidden=cs.display==='none'||cs.visibility==='hidden'||rect.width<1||rect.height<1;
      rail.hidden=hidden;
      if(hidden)return;
      const top=Math.max(0,rect.top),bottom=Math.min(window.innerHeight,rect.bottom);
      rail.style.top=`${top}px`;
      rail.style.height=`${Math.max(0,bottom-top)}px`;
    };
    const placePopoverAt=clientY=>{
      const rr=rail.getBoundingClientRect();
      const y=Math.max(0,Math.min(rr.height,clientY-rr.top));
      popover.style.top=`${y}px`;
      requestAnimationFrame(()=>{
        const h=popover.offsetHeight,room=rr.height;
        let top=y;
        if(h<=room-8){if(top+h>room-4)top=room-h-4;if(top<4)top=4}else top=4;
        popover.style.top=`${top}px`;
      });
    };
    let closeTimer=0;
    const cancelClose=()=>{if(closeTimer){clearTimeout(closeTimer);closeTimer=0}};
    const openAt=clientY=>{cancelClose();placePopoverAt(clientY);rail.classList.add('open')};
    const close=()=>{cancelClose();rail.classList.remove('open')};
    const scheduleClose=()=>{cancelClose();closeTimer=setTimeout(close,200)};

    rail.addEventListener('mouseenter',event=>{cancelClose();if(!rail.classList.contains('open'))openAt(event.clientY)});
    rail.addEventListener('mouseleave',scheduleClose);
    popover.addEventListener('mouseenter',cancelClose);
    popover.addEventListener('mouseleave',scheduleClose);
    popover.addEventListener('click',event=>{
      const link=event.target.closest('.database-toc-link[data-db-jump]');
      if(!link)return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const target=document.getElementById(`group-${link.dataset.dbJump}`),wrap=document.getElementById('sheetWrap');
      if(target&&wrap){
        const wr=wrap.getBoundingClientRect(),tr=target.getBoundingClientRect();
        const stickyCell=[...wrap.querySelectorAll('thead th')].find(el=>getComputedStyle(el).position==='sticky');
        const stickyHeight=stickyCell?.getBoundingClientRect().height||0;
        const top=wrap.scrollTop+(tr.top-wr.top)-stickyHeight-1;
        wrap.scrollTo({top:Math.max(0,top),behavior:'smooth'});
      }
      close();
    },true);
    document.addEventListener('click',event=>{if(rail.classList.contains('open')&&!rail.contains(event.target))close()},true);

    rail.__place=place;
    place();
    requestAnimationFrame(place);
    window.addEventListener('resize',place,{passive:true});
    if(window.ResizeObserver){const ro=new ResizeObserver(place);ro.observe(layout)}
    if(window.MutationObserver){const mo=new MutationObserver(place);mo.observe(layout,{attributes:true,attributeFilter:['class','style']})}
  }

  function bindTocJumpFallback(){
    if(document.documentElement.dataset.jijinTocJumpBound==='1')return;
    document.documentElement.dataset.jijinTocJumpBound='1';
    document.addEventListener('click',event=>{
      const link=event.target.closest?.('.database-toc-link[data-db-jump]');
      if(!link)return;
      const target=document.getElementById(`group-${link.dataset.dbJump}`),wrap=document.getElementById('sheetWrap');
      if(!target||!wrap)return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const wr=wrap.getBoundingClientRect(),tr=target.getBoundingClientRect();
      const stickyCell=[...wrap.querySelectorAll('thead th')].find(el=>getComputedStyle(el).position==='sticky');
      const stickyHeight=stickyCell?.getBoundingClientRect().height||0;
      const top=wrap.scrollTop+(tr.top-wr.top)-stickyHeight-1;
      wrap.scrollTo({top:Math.max(0,top),behavior:'smooth'});
      document.querySelector('#jijinSheetTocRail')?.classList.remove('open');
    },true);
  }

  function syncModeToggle(){
    const head=document.querySelector('.data-sheet thead .item-col');
    if(!head)return;
    let button=head.querySelector('#sheetModeToggle');
    if(!button){
      head.textContent='';
      button=document.createElement('button');
      button.type='button';
      button.id='sheetModeToggle';
      button.onclick=event=>{event.preventDefault();event.stopPropagation();setMode(mode==='comment'?'edit':'comment')};
      head.append(button);
    }
    const nextLabel=mode==='comment'?'コメントモード':'編集モード';
    if(button.textContent!==nextLabel)button.textContent=nextLabel;
    button.dataset.mode=mode;
    button.title=mode==='comment'?'スプレッドシートにコメントをする':'スプレッドシートを編集する';
  }
  function setMode(next){
    mode=next;
    localStorage.setItem('sheetCommentMode',mode);
    document.body.classList.toggle('sheet-comment-mode',mode==='comment');
    syncModeToggle();
  }
  function controls(){
    document.querySelector('#sheetCommentModes')?.remove();
    syncModeToggle();
    const root=document.getElementById('dataTableRoot');
    if(root&&!root.dataset.modeToggleObserved){
      root.dataset.modeToggleObserved='1';
      new MutationObserver(syncModeToggle).observe(root,{childList:true});
    }
    setMode(mode);
  }

  function installDuplicateSafeItems(){
    const duplicateAwareCollect=()=>{
      const map=new Map();
      const chars=state.characters;
      const ensureItem=(key,label,sourceName,sourceKind,sourceRef)=>{
        if(!map.has(key))map.set(key,{key,label,sourceName,sourceKind,sourceRef,cells:{}});
        return map.get(key);
      };
      const keyForRow=(sourceKey,row,src,seen)=>{
        const label=String(row.label||'').trim();
        const count=(seen.get(label)||0)+1;
        seen.set(label,count);
        const base=itemKeyFor(sourceKey,row.label);
        if(count===1)return base;
        const axisPos=src?.questionDirection==='column'?row.col:row.row;
        return `${base}::dup:${count}${Number.isFinite(Number(axisPos))?`@${axisPos}`:''}`;
      };

      for(const ch of chars){
        if(!ch.base?.matrix)continue;
        const src=ch.base,sk=sourceIdentity(src,'base');
        const result=getCharacterRows(src.matrix,src,[ch.key,ch.alias,ch.name]);
        if(result.invalid||result.notFound)continue;
        const seen=new Map();
        for(const r of result.rows){
          const key=keyForRow(sk,r,src,seen);
          const item=ensureItem(key,r.label,'','base',ch.id);
          item.cells[ch.id]={value:String(r.value??''),kind:'base',ownerId:ch.id,row:r.row,col:r.col};
        }
      }

      for(const src of state.sources){
        const sk=sourceIdentity(src,'linked');
        for(const ch of chars){
          const detectedName=Object.keys(src.mapping||{}).find(k=>src.mapping[k]===ch.id);
          if(!detectedName)continue;
          const result=getCharacterRows(src.matrix||[],src,[ch.key,detectedName,ch.alias,ch.name]);
          if(result.invalid||result.notFound)continue;
          const seen=new Map();
          for(const r of result.rows){
            const key=keyForRow(sk,r,src,seen);
            const item=ensureItem(key,r.label,src.name||'Data Source','linked',src.id);
            item.cells[ch.id]={value:String(r.value??''),kind:'linked',ownerId:src.id,row:r.row,col:r.col};
          }
        }
      }

      for(const li of state.layout.localItems||[]){
        const key=`local::${li.id}`;
        const item=ensureItem(key,li.label,'ローカル','local',li.id);
        for(const ch of chars){
          const lv=ensureLocalValues(ch);
          item.cells[ch.id]={value:String(lv[key]??''),kind:'local',ownerId:ch.id,itemKey:key};
        }
      }

      for(const item of map.values()){
        for(const ch of chars){
          if(item.cells[ch.id])continue;
          const lv=ensureLocalValues(ch);
          item.cells[ch.id]={value:String(lv[item.key]??''),kind:'override',ownerId:ch.id,itemKey:item.key};
        }
      }
      return [...map.values()].filter(item=>!state.layout.deletedItems?.[item.key]);
    };

    collectUnifiedItems=duplicateAwareCollect;
    if(typeof renderDataTable==='function')renderDataTable();
    if(state.layout.mainMode==='characters'&&typeof renderFullCharacterMode==='function')renderFullCharacterMode();
  }

  function setupOrganizeShiftGrouping(){
    const selected=new Set();
    let anchorKey='';
    const style=document.createElement('style');
    style.textContent='#organizeGrid .item-chip.bulk-selected{background:#eef3ff!important;border-color:#b9c9ff!important;box-shadow:inset 3px 0 0 #8da8ff!important}';
    document.head.appendChild(style);

    const chips=()=>[...document.querySelectorAll('#organizeGrid .item-chip[data-item-key]')];
    const paint=()=>{
      for(const chip of chips()){
        chip.classList.toggle('bulk-selected',selected.has(chip.dataset.itemKey));
        chip.title='クリックで選択 / Shift＋クリックで範囲選択';
      }
    };
    const clearSelection=()=>{selected.clear();anchorKey='';paint()};

    document.addEventListener('click',e=>{
      const chip=e.target.closest?.('#organizeGrid .item-chip[data-item-key]');
      if(!chip)return;
      if(e.target.closest('select,button,input,textarea,.drag-handle'))return;
      e.preventDefault();
      e.stopPropagation();
      const key=chip.dataset.itemKey;
      const all=chips();

      if(e.shiftKey&&anchorKey){
        const from=all.findIndex(x=>x.dataset.itemKey===anchorKey);
        const to=all.findIndex(x=>x.dataset.itemKey===key);
        if(from>=0&&to>=0){
          selected.clear();
          for(const row of all.slice(Math.min(from,to),Math.max(from,to)+1))selected.add(row.dataset.itemKey);
        }else{
          selected.clear();selected.add(key);anchorKey=key;
        }
      }else{
        selected.clear();
        selected.add(key);
        anchorKey=key;
      }
      paint();
    },true);

    document.addEventListener('change',e=>{
      const sel=e.target.closest?.('#organizeGrid .item-group-select[data-item-key]');
      if(!sel||!selected.has(sel.dataset.itemKey)||!selected.size)return;
      e.stopImmediatePropagation();
      const gid=sel.value,keys=[...selected];
      for(const key of keys){
        if(gid==='ungrouped')delete state.layout.assignments[key];
        else state.layout.assignments[key]=gid;
        moveItemToGroupOrder(key,gid);
      }
      selected.clear();anchorKey='';
      saveState();
      renderOrganizeModal();
      renderDataTable();
      renderQuestionView();
      renderCharacterView();
      if(state.layout.mainMode==='characters')renderFullCharacterMode();
      showToast(`${keys.length}項目をまとめて移動しました`);
    },true);

    document.addEventListener('click',e=>{
      const btn=e.target.closest?.('#organizeGrid [data-delete-item]');
      if(!btn||selected.size<2||!selected.has(btn.dataset.deleteItem))return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const keys=[...selected];
      if(!confirm(`選択した${keys.length}項目を削除しますか？\n\n元のGoogle Sheets / CSVそのものは変更しません。`))return;

      for(const itemKey of keys){
        if(String(itemKey).startsWith('local::')){
          const localId=String(itemKey).slice('local::'.length);
          state.layout.localItems=(state.layout.localItems||[]).filter(li=>li.id!==localId);
        }else{
          state.layout.deletedItems[itemKey]=true;
        }
        delete state.layout.assignments[itemKey];
        removeItemFromAllOrders(itemKey);
        delete state.layout.hiddenItems[itemKey];
        delete state.layout.itemTypes[itemKey];

        const visualId=itemVisualId(itemKey);
        delete state.layout.radarItems?.[visualId];
        delete state.layout.ratingItems?.[visualId];
        delete state.layout.bipolarItems?.[visualId];
        delete state.layout.distributionItems?.[visualId];
        delete state.layout.relationItems?.[visualId];
        delete state.layout.relationData?.[visualId];
        delete state.layout.timelineItems?.[visualId];
        delete state.layout.comparisonItems?.[visualId];
        delete state.layout.imageCaptions?.[visualId];

        for(const ch of state.characters||[]){
          const lv=ensureLocalValues(ch);
          delete lv[itemKey];
          for(const localKey of Object.keys(lv)){
            if(localKey.startsWith(`radar::${visualId}::`))delete lv[localKey];
            if(localKey===`bipolar::${visualId}`||localKey===`distribution::${visualId}`||localKey===`timeline::${visualId}`)delete lv[localKey];
          }
        }
      }

      clearSelection();
      saveState();
      renderOrganizeModal();
      renderDataTable();
      renderQuestionView();
      renderCharacterView();
      if(state.layout.mainMode==='characters')renderFullCharacterMode();
      showToast(`${keys.length}項目を削除しました`);
    },true);

    const grid=document.getElementById('organizeGrid');
    if(grid&&window.MutationObserver)new MutationObserver(paint).observe(grid,{childList:true,subtree:true});
    paint();
  }

  installDuplicateSafeItems();
  document.body.classList.toggle('sheet-comment-mode',mode==='comment');
  setupTocOverlay();
  bindTocJumpFallback();
  controls();
  setupOrganizeShiftGrouping();
})();