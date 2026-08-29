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
    avatar.style.backgroundImage=icon?`url("${String(icon).replace(/["\\\n\r]/g,'')}")`:'';
    avatar.classList.toggle('has-image',!!icon);
  }
  function enhanceDialog(kind='new'){
    const dialog=document.getElementById('sheetCommentDialog'),form=dialog?.querySelector('form');if(!dialog||!form)return;
    if(!form.dataset.unified){
      form.dataset.unified='1';form.classList.add('sheet-comment-unified-form');
      const title=form.querySelector('b'),select=form.querySelector('select'),textarea=form.querySelector('textarea'),submit=[...form.querySelectorAll('button')].find(b=>!b.hasAttribute('type')),close=form.querySelector('[data-close]'),del=form.querySelector('[data-delete]');
      const head=document.createElement('div');head.className='sheet-dialog-head';
      const x=document.createElement('button');x.type='button';x.className='sheet-dialog-x';x.textContent='×';x.onclick=()=>dialog.close();
      head.append(title,x);
      const persona=document.createElement('div');persona.className='sheet-comment-persona';
      const avatar=document.createElement('span');avatar.className='sheet-comment-input-avatar';persona.append(avatar,select);
      const actions=document.createElement('div');actions.className='sheet-dialog-actions';
      if(close){close.textContent='閉じる';actions.append(close)}if(del){del.textContent='削除';actions.append(del)}if(submit){submit.id='sheetCommentSubmit';actions.append(submit)}
      form.replaceChildren(head,persona,textarea,actions);
      select.addEventListener('change',()=>syncDialogAvatar(dialog));
    }
    const title=dialog.querySelector('.sheet-dialog-head b'),submit=dialog.querySelector('#sheetCommentSubmit'),del=dialog.querySelector('[data-delete]');
    if(title)title.textContent=kind==='reply'?'返信':kind==='edit'?'コメントを編集':'セルにコメント';
    if(submit)submit.textContent=kind==='reply'?'返信':kind==='edit'||(del&&!del.hidden)?'保存':'投稿';
    syncDialogAvatar(dialog);
    setTimeout(()=>dialog.querySelector('textarea')?.focus(),0);
  }

  let nextKind='new';
  document.addEventListener('click',event=>{
    if(event.target.closest('[data-reply]'))nextKind='reply';
    else if(event.target.closest('[data-edit]'))nextKind='edit';
    else if(event.target.closest('[data-sheet-cell]'))nextKind='new';
    else return;
    setTimeout(()=>enhanceDialog(nextKind),0);
  });
  window.addEventListener('jijin-sheet-comments-data',event=>render(event.detail?.comments||[]));
  const root=document.getElementById('dataTableRoot');
  if(root&&window.MutationObserver)new MutationObserver(()=>markCells()).observe(root,{childList:true});
  applyAccent();
  try{parent.document.addEventListener('input',event=>{if(event.target?.closest?.('#boardDesignSlot'))setTimeout(applyAccent,0)},true);parent.document.addEventListener('change',event=>{if(event.target?.closest?.('#boardDesignSlot'))setTimeout(applyAccent,0)},true)}catch{}
  if(bridge.ready)setTimeout(()=>render(bridge.comments),0);else setTimeout(()=>markCells(),0);
})();
