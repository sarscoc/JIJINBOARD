"use strict";
(()=>{
  if(typeof state==='undefined'||typeof api!=='function')return;
  const attachedSockets=new WeakSet();
  const commentsList=()=>document.getElementById('commentsList');
  const setVersion=value=>{const n=Number(value);if(Number.isFinite(n)&&n>=0)state.annotationVersion=n};
  const messageOrder=id=>{const i=state.room?.messages?.findIndex?.(m=>m.id===id);return i>=0?i:Number.MAX_SAFE_INTEGER};
  const tabFor=id=>state.room?.messages?.find?.(m=>m.id===id)?.tab||'';

  function cardHtml(a,depth=0){
    const interactive=!state.archiveMode,mine=interactive&&a.author_id===state.profile.id,tab=tabFor(a.message_id);
    return `<div class="comment-thread ${depth?'is-reply':''}" style="--reply-depth:${Math.min(depth,3)}"><div class="comment-card" style="--comment-marker:${esc(markerColor(a.color))}" id="comment-${esc(a.id)}" data-target="${esc(a.message_id)}"><div class="comment-author">${a.persona_icon?`<img class="comment-avatar" src="${esc(a.persona_icon)}" alt="" loading="lazy">`:'<span class="comment-avatar empty-avatar"></span>'}<span class="comment-name">${esc(a.persona_name)}<span class="persona-type">${esc(a.persona_type)}</span></span>${mine?`<button class="comment-edit" type="button" data-edit-comment="${esc(a.id)}" title="編集">✎</button>`:''}<time class="comment-date">${tab?`${esc(tab)} `:''}${esc(formatCommentDate(a.created_at))}</time>${interactive?`<button class="comment-like ${a.liked_by_me?'liked':''}" type="button" data-like-comment="${esc(a.id)}" aria-label="好き">${a.liked_by_me?'♥':'♡'}${Number(a.like_count)||''}</button><button class="comment-reply" type="button" data-reply-comment="${esc(a.id)}" title="返信">↩</button>`:''}</div>${a.body?`<p class="comment-body">${commentBodyHtml(a.body)}</p>`:''}${a.has_image&&!state.archiveMode?`<img class="comment-image" data-expand-image src="/api/rooms/${encodeURIComponent(state.roomId)}/annotations/${encodeURIComponent(a.id)}/image" alt="添付画像" loading="lazy">`:''}</div></div>`;
  }

  function updateCount(){const el=document.getElementById('commentCount');if(el)el.textContent=state.annotations.length}
  function refreshMarkerView(){if(typeof renderLog!=='function')return;const anchor=typeof currentReadingTime==='function'?currentReadingTime():'';requestAnimationFrame(()=>renderLog(anchor))}

  function insertAnnotation(annotation){
    if(!annotation?.id||state.annotations.some(a=>a.id===annotation.id))return;
    state.annotations.push(annotation);updateCount();
    const list=commentsList();if(!list)return;
    list.querySelector(':scope > .empty')?.remove();
    if(annotation.parent_id){
      const parentCard=document.getElementById(`comment-${CSS.escape(annotation.parent_id)}`),thread=parentCard?.closest('.comment-thread');
      if(!thread){renderComments();return}
      thread.insertAdjacentHTML('beforeend',cardHtml(annotation,1));return;
    }
    const roots=[...list.querySelectorAll(':scope > .comment-thread')],myOrder=messageOrder(annotation.message_id),before=roots.find(node=>{const target=node.querySelector(':scope > .comment-card')?.dataset.target||'';return messageOrder(target)>myOrder});
    const holder=document.createElement('div');holder.innerHTML=cardHtml(annotation,0);const node=holder.firstElementChild;if(before)list.insertBefore(node,before);else list.appendChild(node);
    refreshMarkerView();
  }

  function patchAnnotation(patch){
    if(!patch?.id)return;const a=state.annotations.find(x=>x.id===patch.id);if(!a)return;
    const markerChanged=patch.color!==undefined&&patch.color!==a.color&&!a.parent_id;Object.assign(a,patch);
    const card=document.getElementById(`comment-${CSS.escape(a.id)}`);if(card){
      card.style.setProperty('--comment-marker',markerColor(a.color));
      let body=card.querySelector(':scope > .comment-body');
      if(a.body){if(!body){body=document.createElement('p');body.className='comment-body';const image=card.querySelector(':scope > .comment-image');card.insertBefore(body,image||null)}body.innerHTML=commentBodyHtml(a.body)}else body?.remove();
      let image=card.querySelector(':scope > .comment-image');if(a.has_image){if(!image){image=document.createElement('img');image.className='comment-image';image.dataset.expandImage='';image.alt='添付画像';image.loading='lazy';card.appendChild(image)}image.src=`/api/rooms/${encodeURIComponent(state.roomId)}/annotations/${encodeURIComponent(a.id)}/image?v=${encodeURIComponent(a.updated_at||Date.now())}`}else image?.remove();
    }
    if(markerChanged)refreshMarkerView();
  }

  function removeAnnotations(ids){
    const gone=new Set((ids||[]).map(String));if(!gone.size)return;
    const markerChanged=state.annotations.some(a=>gone.has(String(a.id))&&!a.parent_id);
    state.annotations=state.annotations.filter(a=>!gone.has(String(a.id)));updateCount();
    for(const id of gone)document.getElementById(`comment-${CSS.escape(id)}`)?.closest('.comment-thread')?.remove();
    const list=commentsList();if(list&&!list.querySelector('.comment-thread')&&!list.querySelector('.typing-comment'))list.innerHTML='<p class="empty">マーカーされた感想がここに並びます。</p>';
    if(markerChanged)refreshMarkerView();
  }

  function applyLike(data){
    const a=state.annotations.find(x=>x.id===data?.id);if(!a)return;
    a.like_count=Math.max(0,Number(data.likeCount)||0);if(data.actorId===state.profile.id)a.liked_by_me=!!data.liked;
    const button=document.querySelector(`[data-like-comment="${CSS.escape(a.id)}"]`);if(button){button.classList.toggle('liked',!!a.liked_by_me);button.textContent=`${a.liked_by_me?'♥':'♡'}${a.like_count||''}`}
  }

  function applyRealtime(action,data){
    if(!data||String(data.logId||'')!==String(state.roomId||''))return;
    setVersion(data.version);
    if(action==='comment:create')insertAnnotation(data.annotation);
    else if(action==='comment:edit')patchAnnotation(data.patch);
    else if(action==='comment:delete')removeAnnotations(data.deletedIds);
    else if(action==='comment:like')applyLike(data);
  }

  function socketMessage(event){let message;try{message=JSON.parse(event.data)}catch{return}if(message?.type==='comment-change')applyRealtime(message.action,message.data)}
  function attachSocket(socket){if(!socket||attachedSockets.has(socket))return;attachedSockets.add(socket);socket.addEventListener('message',socketMessage)}
  try{attachSocket(state.realtime);const rawConnect=connectRealtime;connectRealtime=function(...args){const result=rawConnect.apply(this,args);attachSocket(state.realtime);queueMicrotask(()=>attachSocket(state.realtime));return result};window.connectRealtime=connectRealtime}catch{}

  async function fastPostComment(event){
    event.preventDefault();const persona=currentPersona(),body=document.getElementById('commentBody').value.trim();if(!body&&!state.commentImage&&state.commentImage!==null)return;
    const pending=state.pendingSelection||{},payload={...pending,parentId:state.replyTo||'',color:persona.color||'#ffe66b',authorId:state.profile.id,authorName:state.profile.plName,personaName:persona.name,personaType:persona.type,personaIcon:persona.icon||'',characterId:persona.id||'',body,imageData:state.commentImage};
    try{
      const editingId=state.editingCommentId,result=await api(editingId?`/api/rooms/${encodeURIComponent(state.roomId)}/annotations/${encodeURIComponent(editingId)}`:`/api/rooms/${encodeURIComponent(state.roomId)}/annotations`,{method:editingId?'PATCH':'POST',body:JSON.stringify(payload)});
      setVersion(result.version);if(editingId)patchAnnotation(result.patch);else insertAnnotation(result.annotation);
      setTyping(false);document.getElementById('commentDialog').close();state.pendingSelection=null;state.selection=null;state.replyTo=null;state.editingCommentId=null;getSelection()?.removeAllRanges();document.getElementById('selectionBar').classList.add('hidden');if(!payload.parentId&&!editingId)jumpToMessage(payload.messageId);
    }catch(error){alert(error.message)}
  }

  async function fastDeleteComment(id,confirmed=false){
    if(!confirmed&&!confirm('このコメントを削除しますか？\n返信もまとめて削除されます。'))return;
    try{const result=await api(`/api/rooms/${encodeURIComponent(state.roomId)}/annotations/${encodeURIComponent(id)}`,{method:'DELETE',body:JSON.stringify({authorId:state.profile.id}),headers:{'x-admin-token':localStorage.getItem(`admin:${state.roomId}`)||''}});setVersion(result.version);removeAnnotations(result.deletedIds)}catch(error){alert(error.message)}
  }

  async function fastToggleLike(id,button){
    const a=state.annotations.find(x=>x.id===id);if(!a)return;const before=!!a.liked_by_me,count=Number(a.like_count)||0;
    a.liked_by_me=!before;a.like_count=Math.max(0,count+(before?-1:1));if(button){button.classList.toggle('liked',!before);button.textContent=`${before?'♡':'♥'}${a.like_count||''}`;button.classList.remove('heart-pop');void button.offsetWidth;button.classList.add('heart-pop')}
    try{const result=await api(`/api/rooms/${encodeURIComponent(state.roomId)}/annotations/${encodeURIComponent(id)}/like`,{method:'POST',body:JSON.stringify({authorId:state.profile.id})});setVersion(result.version);a.liked_by_me=!!result.liked;a.like_count=Math.max(0,Number(result.likeCount)||0);if(button){button.classList.toggle('liked',a.liked_by_me);button.textContent=`${a.liked_by_me?'♥':'♡'}${a.like_count||''}`}}catch(error){a.liked_by_me=before;a.like_count=count;if(button){button.classList.toggle('liked',before);button.textContent=`${before?'♥':'♡'}${count||''}`}alert(error.message)}
  }

  try{postComment=fastPostComment;deleteComment=fastDeleteComment;toggleLike=fastToggleLike;window.postComment=postComment;window.deleteComment=deleteComment;window.toggleLike=toggleLike;const form=document.getElementById('commentForm');if(form)form.onsubmit=postComment}catch{}
})();
