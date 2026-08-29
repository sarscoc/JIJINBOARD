(()=>{
  const bridge=window.__jijinSheetCommentBridge||{comments:[],ready:false};
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const profile=()=>{try{return JSON.parse(localStorage.getItem('trpgMarkerProfile')||'null')}catch{return null}};
  const people=()=>{const p=profile()||{};return [{name:p.plName||'PL',type:'PL',icon:p.plIcon||''},...(p.personas||[]).map(person=>({name:person.name||'',type:person.type||'PC',icon:person.icon||''}))]};
  const iconFor=c=>c.persona_icon||people().find(person=>person.name===c.persona_name&&person.type===c.persona_type)?.icon||'';
  const dateText=value=>{if(!value)return'';const raw=String(value),normalized=/Z|[+-]\d\d:?\d\d$/.test(raw)?raw:raw.replace(' ','T')+'Z',date=new Date(normalized);return Number.isNaN(date.getTime())?raw:new Intl.DateTimeFormat('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(date)};
  function applyAccent(){try{const id=new URL(parent.location.href).searchParams.get('id')||'';const value=JSON.parse(parent.localStorage.getItem(`jijinboardScopedTheme:${id}`)||'null');document.documentElement.style.setProperty('--jijin-sheet-comment-color',/^#[0-9a-f]{6}$/i.test(value?.color1||'')?value.color1:'#171a20')}catch{document.documentElement.style.setProperty('--jijin-sheet-comment-color','#171a20')}}

  function markCells(comments=bridge.comments){
    document.querySelectorAll('[data-sheet-cell].sheet-has-comment').forEach(el=>el.classList.remove('sheet-has-comment'));
    const ids=new Set((comments||[]).map(c=>c.cell_id).filter(Boolean));
    for(const id of ids)document.querySelector(`[data-sheet-cell="${CSS.escape(id)}"]`)?.classList.add('sheet-has-comment');
    applyAccent();
  }
  function card(c,depth,children){
    const mine=c.author_id===profile()?.id,icon=iconFor(c),replies=children.get(c.id)||[];
    const avatar=icon?`<img class="sheet-comment-avatar" src="${esc(icon)}" alt="">`:'<span class="sheet-comment-avatar"></span>';
    return `<div class="sheet-comment-thread ${depth?'sheet-reply':''}"><article class="sheet-comment-card" data-cell="${esc(c.cell_id)}"><div class="sheet-comment-author">${avatar}<b>${esc(c.persona_name)}</b><em>${esc(c.persona_type)}</em>${mine?`<button data-edit="${esc(c.id)}" title="編集">✎</button>`:''}<time>${esc(dateText(c.created_at))}</time><button data-like="${esc(c.id)}" class="${c.liked_by_me?'liked':''}" aria-label="好き">${c.liked_by_me?'♥':'♡'}${Number(c.like_count)||''}</button><button data-reply="${esc(c.id)}" title="返信">↩</button></div><p class="sheet-comment-body">${esc(c.body).replace(/\n/g,'<br>')}</p></article>${replies.map(r=>card(r,depth+1,children)).join('')}</div>`;
  }
  function render(comments=bridge.comments){
    const panel=document.getElementById('sheetComments');if(!panel)return;
    const list=panel.querySelector('section'),count=panel.querySelector('.sheet-comments-head b span');if(!list)return;
    const ids=new Set((comments||[]).map(c=>c.id)),children=new Map();
    for(const c of comments||[]){if(c.parent_id){const rows=children.get(c.parent_id)||[];rows.push(c);children.set(c.parent_id,rows)}}
    const roots=(comments||[]).filter(c=>!c.parent_id||!ids.has(c.parent_id));
    if(count)count.textContent=String((comments||[]).length);
    list.innerHTML=roots.length?roots.map(c=>card(c,0,children)).join(''):'<p class="sheet-comment-empty">セルへのコメントがここに並びます。</p>';
    panel.classList.toggle('has-comments',roots.length>0);
    markCells(comments);
  }

  function syncDialogAvatar(dialog){
    const select=dialog.querySelector('select'),avatar=dialog.querySelector('.sheet-comment-input-avatar');if(!select||!avatar)return;
    const person=people()[Number(select.value)||0],icon=person?.icon||'';
    avatar.innerHTML=icon?`<img src="${esc(icon)}" alt="">`:'';
  }
  let pendingAnchor=null;
  function positionDialog(dialog){
    if(!pendingAnchor||innerWidth<=800){dialog.style.left='';dialog.style.top='';return}
    const width=Math.min(390,innerWidth-24),height=Math.min(dialog.offsetHeight||230,innerHeight-24);
    let left=pendingAnchor.right+12;
    if(left+width>innerWidth-12)left=Math.max(12,pendingAnchor.left-width-12);
    const top=Math.min(Math.max(12,pendingAnchor.top-24),Math.max(12,innerHeight-height-12));
    dialog.style.left=`${left}px`;dialog.style.top=`${top}px`;
  }
  function enhanceDialog(){
    const dialog=document.getElementById('sheetCommentDialog'),form=dialog?.querySelector('form');if(!dialog||!form)return;
    if(!form.dataset.logcommentsBox){
      form.dataset.logcommentsBox='1';form.className='sheet-comment-log-form';
      const select=form.querySelector('select'),textarea=form.querySelector('textarea'),del=form.querySelector('[data-delete]');
      const persona=document.createElement('div');persona.className='comment-persona-picker';
      const avatar=document.createElement('span');avatar.className='sheet-comment-input-avatar comment-input-avatar';
      persona.append(avatar,select);
      if(del){del.className='comment-edit-delete';del.textContent='このコメントを削除';}
      textarea.removeAttribute('placeholder');textarea.setAttribute('rows','5');textarea.setAttribute('maxlength','4000');textarea.setAttribute('aria-label','感想');
      form.replaceChildren(persona,textarea,...(del?[del]:[]));
      select.addEventListener('change',()=>syncDialogAvatar(dialog));
    }
    if(dialog.matches?.(':modal')){dialog.close();dialog.show()}
    syncDialogAvatar(dialog);positionDialog(dialog);
    setTimeout(()=>dialog.querySelector('textarea')?.focus(),0);
  }

  document.addEventListener('click',event=>{
    const target=event.target.closest('[data-reply],[data-edit],[data-sheet-cell]');
    if(!target)return;
    const anchor=target.closest('.sheet-comment-card,[data-sheet-cell]')||target;
    pendingAnchor=anchor.getBoundingClientRect();
    setTimeout(enhanceDialog,0);
  });
  document.addEventListener('pointerdown',event=>{
    const dialog=document.getElementById('sheetCommentDialog');if(!dialog?.open||dialog.contains(event.target))return;
    const form=dialog.querySelector('form'),textarea=dialog.querySelector('textarea');
    if(textarea?.value.trim())form?.requestSubmit();else dialog.close();
  });
  window.addEventListener('jijin-sheet-comments-data',event=>render(event.detail?.comments||[]));
  const root=document.getElementById('dataTableRoot');
  if(root&&window.MutationObserver)new MutationObserver(()=>markCells()).observe(root,{childList:true});
  applyAccent();
  try{parent.document.addEventListener('input',event=>{if(event.target?.closest?.('#boardDesignSlot'))setTimeout(applyAccent,0)},true);parent.document.addEventListener('change',event=>{if(event.target?.closest?.('#boardDesignSlot'))setTimeout(applyAccent,0)},true)}catch{}
  if(bridge.ready)setTimeout(()=>render(bridge.comments),0);else setTimeout(()=>markCells(),0);
})();
