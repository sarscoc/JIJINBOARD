(()=>{
  'use strict';
  const clone=value=>JSON.parse(JSON.stringify(value));
  const displayKeys=['sheetLayout','characterPageMode','questionStyle'];
  // Discard only startup auto-placement produced by the legacy inline renderer.
  // The persisted arrangement remains authoritative until remote hydration finishes.
  try{
    const stored=JSON.parse(localStorage.getItem('charaHub.layoutV1')||'null');
    if(stored?.sheetLayout)state.layout.sheetLayout=clone(stored.sheetLayout);
  }catch{}

  const modal=document.getElementById('sheetLayoutModal');
  let draft=null,committing=false,organizing=false,characterRendering=false;
  const hidden=id=>!!state.layout.hiddenGroups?.[id];
  const placed=id=>!!sheetGroupPosition(id);
  const allIds=()=>['ungrouped',...(state.layout.groups||[]).map(g=>g.id)];
  function orderedIds(){
    const ids=allIds(),saved=state.layout.groupOrder||[];
    return [...new Set([...saved.filter(id=>ids.includes(id)),...ids])];
  }
  function sortGroups(groups){if(!state.layout.groupOrder?.length)return groups.slice();const rank=new Map(orderedIds().map((id,i)=>[id,i]));return groups.slice().sort((a,b)=>(rank.get(a.id)??9999)-(rank.get(b.id)??9999))}
  const icon=visible=>visible
    ?'<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>'
    :'<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m3 3 18 18M10 5c7-1 12 7 12 7a22 22 0 0 1-4 5M6 6a22 22 0 0 0-4 6s4 7 10 7a12 12 0 0 0 5-1M10 10a3 3 0 0 0 4 4"/></svg>';

  function reorderNodes(root,selector,getId){
    if(!root)return;
    const nodes=[...root.querySelectorAll(selector)],rank=new Map(orderedIds().map((id,i)=>[id,i]));
    if(state.layout.groupOrder?.length)nodes.sort((a,b)=>(rank.get(getId(a))??9999)-(rank.get(getId(b))??9999));
    for(const node of nodes){node.hidden=hidden(getId(node));node.parentElement.appendChild(node)}
  }
  function applyPresentation(){
    reorderNodes(document.getElementById('dataTableRoot'),'tbody[data-group-body]',el=>el.dataset.groupBody);
    reorderNodes(document.getElementById('databaseToc'),'[data-db-jump]',el=>el.dataset.dbJump);
    reorderNodes(document.getElementById('questionViewRoot'),'.question-index-group',el=>el.id.slice('qgroup-'.length));
    reorderNodes(document.getElementById('jumpNav'),'[data-jump]',el=>el.dataset.jump);
    for(const section of document.querySelectorAll('[data-sheet-group-id]')){
      const id=section.dataset.sheetGroupId;section.hidden=hidden(id)||!placed(id);
    }
  }
  function redraw(){
    if(typeof setMainView==='function')setMainView();
    applyPresentation();
  }

  const rawNormalized=window.normalizedGroups;
  window.normalizedGroups=function(...args){
    const result=rawNormalized.apply(this,args);
    result.groups=sortGroups(result.groups);
    if(!organizing){
      result.groups=result.groups.filter(g=>!hidden(g.id));
      for(const id of orderedIds())if(hidden(id))result.buckets.set(id,[]);
    }
    return result;
  };
  const rawOrdered=window.orderedSheetGroups;
  window.orderedSheetGroups=function(...args){
    return sortGroups(rawOrdered.apply(this,args)).filter(g=>!hidden(g.id)&&(!characterRendering||placed(g.id)));
  };
  // Full sheets and popups must exclude unplaced sections before computing grid bounds.
  for(const name of ['renderCharacterSheetGroups','openCharacterPopup']){
    const raw=window[name];if(typeof raw!=='function')continue;
    window[name]=function(...args){const previous=characterRendering;characterRendering=true;try{return raw.apply(this,args)}finally{characterRendering=previous;applyPresentation()}};
  }
  for(const name of ['renderDataTable','renderQuestionView','renderCharacterView','renderFullCharacterMode']){
    const raw=window[name];if(typeof raw!=='function')continue;
    window[name]=function(...args){const result=raw.apply(this,args);applyPresentation();return result};
  }

  function changeGroup(id,action){
    if(action==='toggle'){
      state.layout.hiddenGroups||={};
      if(hidden(id))delete state.layout.hiddenGroups[id];else state.layout.hiddenGroups[id]=true;
    }else{
      const order=orderedIds(),index=order.indexOf(id),next=index+(action==='up'?-1:1);
      if(index<0||next<0||next>=order.length)return;
      [order[index],order[next]]=[order[next],order[index]];state.layout.groupOrder=order;
    }
    saveLayoutState();renderOrganizeModal();redraw();
  }
  const rawOrganize=window.renderOrganizeModal;
  window.renderOrganizeModal=function(...args){
    organizing=true;
    let result;try{result=rawOrganize.apply(this,args)}finally{organizing=false}
    const toc=document.getElementById('organizeToc'),grid=document.getElementById('organizeGrid');
    const links=[...toc.querySelectorAll('[data-organize-jump]')];
    for(const id of orderedIds()){
      const link=links.find(el=>el.dataset.organizeJump===id);if(!link)continue;
      const row=document.createElement('div');row.className='organize-group-row';row.dataset.groupControl=id;
      row.classList.toggle('is-group-hidden',hidden(id));
      toc.appendChild(row);row.appendChild(link);
      const controls=document.createElement('span');controls.className='organize-group-controls';
      for(const [action,label] of [['toggle',icon(!hidden(id))]]){
        const button=document.createElement('button');button.type='button';button.dataset.groupAction=action;
        const title=action==='toggle'?(hidden(id)?'グループを表示':'グループを非表示'):action==='up'?'グループを上へ':'グループを下へ';
        button.title=title;button.setAttribute('aria-label',title);button.innerHTML=label;
        if(action==='toggle')button.setAttribute('aria-pressed',String(hidden(id)));
        else button.disabled=action==='up'?id===orderedIds()[0]:id===orderedIds().at(-1);
        button.onclick=e=>{e.stopPropagation();changeGroup(id,action)};controls.appendChild(button);
      }
      const handle=document.createElement('span');handle.className='group-drag-handle';handle.textContent='⋮⋮';handle.title='ドラッグして並べ替え';handle.draggable=true;row.prepend(handle);
      handle.addEventListener('dragstart',event=>{event.stopPropagation();event.dataTransfer.setData('application/x-sheet-group',id);event.dataTransfer.effectAllowed='move';row.classList.add('is-dragging')});
      handle.addEventListener('dragend',()=>row.classList.remove('is-dragging'));
      row.addEventListener('dragover',event=>{if(event.dataTransfer.types.includes('application/x-sheet-group')){event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect='move'}});
      row.addEventListener('drop',event=>{
        const source=event.dataTransfer.getData('application/x-sheet-group');if(!source||source===id)return;
        event.preventDefault();event.stopPropagation();
        const order=orderedIds().filter(key=>key!==source),rect=row.getBoundingClientRect();
        const index=order.indexOf(id)+(event.clientY>rect.top+rect.height/2?1:0);order.splice(index,0,source);
        state.layout.groupOrder=order;saveLayoutState();renderOrganizeModal();redraw();
      });
      row.appendChild(controls);
      const box=[...grid.querySelectorAll('[data-group-id]')].find(el=>el.dataset.groupId===id);if(box)grid.appendChild(box);
    }
    return result;
  };

  function snapshotLayout(layout){
    if(!draft||committing)return layout;
    if(displayKeys.some(key=>JSON.stringify(layout[key])!==JSON.stringify(draft[key])))savedStatus.textContent='未保存';
    const out={...layout};
    for(const key of displayKeys){if(Object.hasOwn(draft,key))out[key]=clone(draft[key]);else delete out[key]}
    return out;
  }
  function cancelDraft(){
    if(!draft||committing)return;
    for(const key of displayKeys){if(Object.hasOwn(draft,key))state.layout[key]=clone(draft[key]);else delete state.layout[key]}
    draft=null;saveLayoutState();redraw();
  }
  window.sheetDisplaySettings={isEditing:()=>!!draft,snapshotLayout,cancel:cancelDraft};
  const rawOpen=window.openSheetLayoutEditor;
  window.openSheetLayoutEditor=function(...args){
    if(window.jijinSpreadsheetSync&&!window.jijinSpreadsheetSync.isReady()&&!window.jijinSpreadsheetSync.useExistingData()){showToast('読み込みが完了してから開いてください');return}
    if(!draft){draft={};for(const key of displayKeys)if(Object.hasOwn(state.layout,key))draft[key]=clone(state.layout[key])}
    savedStatus.textContent='';return rawOpen.apply(this,args);
  };
  document.getElementById('sheetLayoutBtn').onclick=window.openSheetLayoutEditor;
  const rawClose=window.closeSheetLayoutEditor;
  window.closeSheetLayoutEditor=function(...args){if(committing)return;cancelDraft();return rawClose.apply(this,args)};
  document.getElementById('sheetLayoutCloseBtn').onclick=window.closeSheetLayoutEditor;
  document.getElementById('sheetLayoutCancelBtn').onclick=window.closeSheetLayoutEditor;
  new MutationObserver(()=>{if(!modal.classList.contains('show'))cancelDraft()}).observe(modal,{attributes:true,attributeFilter:['class']});

  const actions=modal.querySelector('.modal-actions');
  const savedStatus=document.createElement('span');savedStatus.className='sheet-layout-save-status';savedStatus.setAttribute('role','status');actions.prepend(savedStatus);
  const saveButton=document.createElement('button');saveButton.type='button';saveButton.id='sheetLayoutSaveBtn';saveButton.className='btn';saveButton.textContent='保存';actions.appendChild(saveButton);
  saveButton.onclick=async()=>{
    if(committing)return;
    let failure='';
    committing=true;saveButton.disabled=true;saveButton.textContent='保存中…';savedStatus.textContent='';modal.classList.add('is-saving');
    try{
      saveLayoutState();
      const ok=window.jijinSpreadsheetSync?await window.jijinSpreadsheetSync.saveNow():true;
      if(!ok)throw new Error('save failed');
      draft=null;savedStatus.textContent='保存しました';showToast('表示設定を保存しました');redraw();
      // Continue editing with a new checkpoint; closing now keeps the saved arrangement.
      draft={};for(const key of displayKeys)if(Object.hasOwn(state.layout,key))draft[key]=clone(state.layout[key]);
    }catch(error){
      failure='保存できませんでした。もう一度保存してください';
    }finally{
      committing=false;saveButton.disabled=false;saveButton.textContent='保存';modal.classList.remove('is-saving');
      // Restore the committed local snapshot on failure; keep the in-memory draft editable.
      saveLayoutState();
      if(failure)savedStatus.textContent=failure;
    }
  };
  const help=modal.querySelector('.layout-help');if(help)help.textContent+=' 変更後は「保存」を押してください。';
  const style=document.createElement('style');style.textContent=`
    #sheetLayoutModal .modal-actions{position:sticky;bottom:0;background:#fff;padding:10px 0;z-index:20}
    #sheetLayoutModal.is-saving .sheet-settings-panel,#sheetLayoutModal.is-saving .sheet-settings-tabs{pointer-events:none;opacity:.7}
    .sheet-layout-save-status{font-size:12px;margin-right:auto;color:var(--muted)}
    #sheetLayoutSaveBtn{font-weight:700;min-width:72px}
    #organizeModal .organize-shell{grid-template-columns:220px minmax(0,1fr)!important}
    #organizeModal .organize-toc{min-width:0!important}
    #organizeModal .modal,#organizeModal .modal-body,#organizeModal .organize-shell,#organizeModal #organizeGrid,#organizeModal .group-box,#organizeModal .group-drop{min-width:0!important;max-width:100%;box-sizing:border-box}
    #organizeModal .modal-subtools{flex-wrap:wrap}
    #organizeModal .modal-subtools input{min-width:0!important;flex:1 1 140px;width:140px!important}
    #organizeModal #organizeGrid .item-chip{width:100%;max-width:100%;min-width:0!important;box-sizing:border-box}
    #organizeModal #organizeGrid .item-chip:not(.legacy-part-chip){grid-template-columns:16px minmax(0,1fr) 90px 32px 22px 22px minmax(70px,100px)!important;column-gap:4px!important}
    #organizeModal #organizeGrid .item-chip select{min-width:0!important;max-width:100%!important;width:100%!important}
    #organizeModal #organizeGrid .legacy-part-chip{display:flex!important;flex-wrap:wrap}
    .group-drag-handle{cursor:grab;flex-shrink:0;color:#8b93a2;padding:4px;user-select:none}
    .organize-group-row.is-dragging{opacity:.4}
    @media(max-width:900px){#organizeModal #organizeGrid .item-chip:not(.legacy-part-chip){grid-template-columns:16px minmax(0,1fr) 80px 28px 22px 22px!important;grid-template-areas:"drag name type config visibility delete" ". group group group group group"!important;row-gap:4px!important}}

    .organize-group-row{display:flex;align-items:center;gap:2px}
    .organize-group-row .organize-toc-btn{flex:1;min-width:0;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .organize-group-controls{display:flex;align-items:center;gap:1px;flex-shrink:0}
    .organize-group-controls button{display:grid;place-items:center;width:23px;height:27px;padding:0;border:0;border-radius:5px;background:transparent;color:inherit;cursor:pointer}
    .organize-group-controls button:hover{background:#edf0f4}.organize-group-controls button:disabled{opacity:.25;cursor:default}
    .is-group-hidden .organize-toc-btn{opacity:.45}.is-group-hidden [data-group-action="toggle"]{color:#8b93a2}
    [data-sheet-group-id][hidden],tbody[data-group-body][hidden],.database-toc-link[hidden],.question-index-group[hidden]{display:none!important}
    @media(max-width:680px){#organizeModal .organize-shell{grid-template-columns:165px minmax(0,1fr)!important}.organize-group-controls button{width:20px}}
  `;document.head.appendChild(style);
  redraw();
})();
