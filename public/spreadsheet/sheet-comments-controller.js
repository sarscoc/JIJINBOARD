(()=>{
  "use strict";
  const board=new URL(location.href).searchParams.get('board');if(!board)return;
  let comments=[],cell='',reply='',edit='',posting=false,pendingAnchor=null;
  const api=async(path,options={})=>{
    const response=await fetch(path,{headers:{'content-type':'application/json',...(options.headers||{})},...options});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(data.error||'コメントの取得に失敗しました');
    return data;
  };
  const profile=()=>{try{return JSON.parse(localStorage.getItem('trpgMarkerProfile')||'null')}catch{return null}};
  const people=()=>{
    const p=profile()||{};
    return [{name:p.plName||'PL',type:'PL',icon:p.plIcon||''},...(p.personas||[]).map(person=>({name:person.name||'',type:person.type||'PC',icon:person.icon||''}))];
  };
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const iconFor=c=>c.persona_icon||people().find(person=>person.name===c.persona_name&&person.type===c.persona_type)?.icon||'';
  const dateText=value=>{
    if(!value)return'';
    const raw=String(value),normalized=/Z|[+-]\d\d:?\d\d$/.test(raw)?raw:raw.replace(' ','T')+'Z',date=new Date(normalized);
    return Number.isNaN(date.getTime())?raw:new Intl.DateTimeFormat('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(date);
  };
  const commentMode=()=>localStorage.getItem('sheetCommentMode')!=='edit';

  function applyAccent(){
    try{
      const id=new URL(parent.location.href).searchParams.get('id')||'';
      const value=JSON.parse(parent.localStorage.getItem(`jijinboardScopedTheme:${id}`)||'null');
      document.documentElement.style.setProperty('--jijin-sheet-comment-color',/^#[0-9a-f]{6}$/i.test(value?.color1||'')?value.color1:'#171a20');
    }catch{document.documentElement.style.setProperty('--jijin-sheet-comment-color','#171a20')}
  }

  function markCells(){
    document.querySelectorAll('[data-sheet-cell].sheet-has-comment').forEach(el=>el.classList.remove('sheet-has-comment'));
    const ids=new Set(comments.map(c=>c.cell_id).filter(Boolean));
    for(const id of ids)document.querySelector(`[data-sheet-cell="${CSS.escape(id)}"]`)?.classList.add('sheet-has-comment');
    applyAccent();
  }

  function panel(){
    let a=document.querySelector('#sheetComments');
    if(!a){
      a=document.createElement('aside');a.id='sheetComments';
      a.innerHTML='<div class="sheet-comments-head"><b>COMMENTS <span></span></b><button type="button" title="コメントを閉じる">×</button></div><section></section>';
      a.querySelector('button').onclick=()=>a.hidden=true;
      document.body.append(a);
    }
    return a;
  }

  function card(c,depth,children){
    const mine=c.author_id===profile()?.id,icon=iconFor(c),replies=children.get(c.id)||[];
    const avatar=icon?`<img class="sheet-comment-avatar" src="${esc(icon)}" alt="">`:'<span class="sheet-comment-avatar"></span>';
    return `<div class="sheet-comment-thread ${depth?'sheet-reply':''}"><article class="sheet-comment-card" data-cell="${esc(c.cell_id)}"><div class="sheet-comment-author">${avatar}<b>${esc(c.persona_name)}</b><em>${esc(c.persona_type)}</em>${mine?`<button data-edit="${esc(c.id)}" title="編集">✎</button>`:''}<time>${esc(dateText(c.created_at))}</time><button data-like="${esc(c.id)}" class="${c.liked_by_me?'liked':''}" aria-label="好き">${c.liked_by_me?'♥':'♡'}${Number(c.like_count)||''}</button><button data-reply="${esc(c.id)}" title="返信">↩</button></div><p class="sheet-comment-body">${esc(c.body).replace(/\n/g,'<br>')}</p></article>${replies.map(r=>card(r,depth+1,children)).join('')}</div>`;
  }

  function render(){
    const a=panel(),list=a.querySelector('section'),count=a.querySelector('.sheet-comments-head b span');
    const ids=new Set(comments.map(c=>c.id)),children=new Map();
    for(const c of comments){
      if(!c.parent_id)continue;
      const rows=children.get(c.parent_id)||[];rows.push(c);children.set(c.parent_id,rows);
    }
    const roots=comments.filter(c=>!c.parent_id||!ids.has(c.parent_id));
    if(count)count.textContent=String(comments.length);
    if(list)list.innerHTML=roots.length?roots.map(c=>card(c,0,children)).join(''):'<p class="sheet-comment-empty">セルへのコメントがここに並びます。</p>';
    a.classList.toggle('has-comments',roots.length>0);
    markCells();
  }

  async function load(){
    try{comments=(await api(`/api/boards/${board}/spreadsheet/comments?authorId=${encodeURIComponent(profile()?.id||'')}`)).comments||[]}
    catch(error){console.warn('Spreadsheet comments load failed',error);comments=[]}
    render();
  }

  function syncDialogAvatar(d){
    const select=d.querySelector('select'),avatar=d.querySelector('.sheet-comment-input-avatar');if(!select||!avatar)return;
    const person=people()[Number(select.value)||0],icon=person?.icon||'';
    avatar.innerHTML=icon?`<img src="${esc(icon)}" alt="">`:'';
  }

  function positionDialog(d){
    if(!pendingAnchor||innerWidth<=800){d.style.left='';d.style.top='';return}
    const width=Math.min(390,innerWidth-24),height=Math.min(d.offsetHeight||230,innerHeight-24);
    let left=pendingAnchor.right+12;
    if(left+width>innerWidth-12)left=Math.max(12,pendingAnchor.left-width-12);
    const top=Math.min(Math.max(12,pendingAnchor.top-24),Math.max(12,innerHeight-height-12));
    d.style.left=`${left}px`;d.style.top=`${top}px`;
  }

  function dialog(){
    let d=document.querySelector('#sheetCommentDialog');
    if(d&&d.dataset.singleController==='1')return d;
    if(d)d.remove();
    d=document.createElement('dialog');d.id='sheetCommentDialog';d.dataset.singleController='1';
    d.innerHTML='<form class="sheet-comment-log-form" method="dialog"><div class="comment-persona-picker"><span class="sheet-comment-input-avatar comment-input-avatar"></span><select aria-label="発言者"></select></div><textarea rows="5" maxlength="4000" aria-label="感想"></textarea><button class="comment-edit-delete" type="button" data-delete hidden>このコメントを削除</button></form>';
    document.body.append(d);
    d.querySelector('form').addEventListener('submit',post);
    d.querySelector('[data-delete]').addEventListener('click',remove);
    d.querySelector('select').addEventListener('change',()=>syncDialogAvatar(d));
    return d;
  }

  function open(id,r='',e='',anchor=null){
    if(posting)return;
    const p=profile();if(!p?.plName)return alert('先に発言者を登録してください。');
    panel().hidden=false;cell=id;reply=r;edit=e;pendingAnchor=anchor||pendingAnchor;
    const d=dialog(),old=comments.find(x=>x.id===e),ps=people(),select=d.querySelector('select');
    select.innerHTML=ps.map((x,i)=>`<option value="${i}">${esc(x.name)} [${esc(x.type)}]</option>`).join('');
    const oldIndex=old?ps.findIndex(x=>x.name===old.persona_name&&x.type===old.persona_type):-1;
    select.value=String(oldIndex>=0?oldIndex:0);
    d.querySelector('textarea').value=old?.body||'';
    d.querySelector('[data-delete]').hidden=!old;
    syncDialogAvatar(d);
    if(!d.open)d.show();
    positionDialog(d);
    setTimeout(()=>d.querySelector('textarea')?.focus(),0);
  }

  async function post(event){
    event.preventDefault();
    if(posting)return;
    const d=dialog(),p=profile(),person=people()[Number(d.querySelector('select').value)||0],body=d.querySelector('textarea').value.trim();
    if(!body||!p?.id||!person)return;
    posting=true;d.dataset.submitting='1';
    const targetCell=cell,parentId=reply,editingId=edit;
    try{
      if(editingId){
        await api(`/api/boards/${board}/spreadsheet/comments/${encodeURIComponent(editingId)}`,{method:'PATCH',body:JSON.stringify({authorId:p.id,body})});
      }else{
        await api(`/api/boards/${board}/spreadsheet/comments`,{method:'POST',body:JSON.stringify({cellId:targetCell,parentId,authorId:p.id,personaName:person.name,personaType:person.type,personaIcon:person.icon||'',body})});
      }
      d.close();
      await load();
    }catch(error){alert(error.message)}
    finally{posting=false;delete d.dataset.submitting}
  }

  async function remove(){
    if(posting||!edit||!confirm('このコメントを削除しますか？\n返信もまとめて削除されます。'))return;
    posting=true;
    try{
      await api(`/api/boards/${board}/spreadsheet/comments/${encodeURIComponent(edit)}`,{method:'DELETE',body:JSON.stringify({authorId:profile()?.id})});
      dialog().close();await load();
    }catch(error){alert(error.message)}
    finally{posting=false}
  }

  // Capture these interactions before the legacy sheet-comments-base listener.
  // From here on, this controller is the only code allowed to open or submit comments.
  document.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-like],[data-reply],[data-edit]');
    const cardEl=event.target.closest?.('#sheetComments .sheet-comment-card');
    const cellEl=event.target.closest?.('[data-sheet-cell]');
    if(!button&&!cardEl&&!(commentMode()&&cellEl))return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if(button){
      const id=button.dataset.like||button.dataset.reply||button.dataset.edit;
      const c=comments.find(x=>x.id===id);if(!c)return;
      if(button.dataset.like){
        api(`/api/boards/${board}/spreadsheet/comments/${encodeURIComponent(c.id)}/like`,{method:'POST',body:JSON.stringify({authorId:profile()?.id})}).then(load).catch(error=>alert(error.message));
        return;
      }
      const anchor=(button.closest('.sheet-comment-card')||button).getBoundingClientRect();
      open(c.cell_id,button.dataset.reply?c.id:'',button.dataset.edit?c.id:'',anchor);
      return;
    }

    if(cardEl){
      const target=document.querySelector(`[data-sheet-cell="${CSS.escape(cardEl.dataset.cell)}"]`);
      target?.classList.add('sheet-comment-flash');
      setTimeout(()=>target?.classList.remove('sheet-comment-flash'),1100);
      target?.scrollIntoView({behavior:'smooth',block:'center'});
      return;
    }

    if(cellEl&&!posting)open(cellEl.dataset.sheetCell,'','',cellEl.getBoundingClientRect());
  },true);

  document.addEventListener('pointerdown',event=>{
    const d=document.querySelector('#sheetCommentDialog');
    if(!d?.open||posting||d.contains(event.target))return;
    const textarea=d.querySelector('textarea');
    if(textarea?.value.trim())d.querySelector('form')?.requestSubmit();
    else d.close();
  });

  const root=document.getElementById('dataTableRoot');
  if(root&&window.MutationObserver)new MutationObserver(markCells).observe(root,{childList:true});
  applyAccent();
  try{
    parent.document.addEventListener('input',event=>{if(event.target?.closest?.('#boardDesignSlot'))setTimeout(applyAccent,0)},true);
    parent.document.addEventListener('change',event=>{if(event.target?.closest?.('#boardDesignSlot'))setTimeout(applyAccent,0)},true);
  }catch{}

  load();
})();
