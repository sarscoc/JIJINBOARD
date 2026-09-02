"use strict";
(()=>{
  function install(){
    if(window.__jijinboardCommentVirtualList)return;
    if(typeof state==='undefined'||typeof renderComments!=='function'||typeof jumpToComment!=='function'){
      setTimeout(install,12);
      return;
    }
    const list=document.getElementById('commentsList');
    if(!list){setTimeout(install,12);return}
    window.__jijinboardCommentVirtualList=true;

    let roomKey='';
    let limit=0;
    let batchSize=18;
    let lastItemCount=0;
    let fillQueued=false;

    const initialBatch=()=>{
      const h=Math.max(420,list.clientHeight||0);
      return Math.max(18,Math.min(36,Math.ceil(h/62)+7));
    };

    function resetIfNeeded(){
      const next=String(state.roomId||'');
      if(next===roomKey&&limit>0)return;
      roomKey=next;
      batchSize=initialBatch();
      limit=batchSize;
    }

    function model(){
      const messages=state.room?.messages||[];
      const order=new Map(messages.map((message,index)=>[message.id,index]));
      const messageTabs=new Map(messages.map(message=>[message.id,message.tab]));
      const annotationIds=new Set(state.annotations.map(annotation=>annotation.id));
      const annotations=[...state.annotations].sort((a,b)=>(order.get(a.message_id)??Infinity)-(order.get(b.message_id)??Infinity)||a.start_offset-b.start_offset||String(a.created_at).localeCompare(String(b.created_at)));
      const children=new Map();
      annotations.forEach(annotation=>{
        if(!annotation.parent_id)return;
        const items=children.get(annotation.parent_id)||[];
        items.push(annotation);
        children.set(annotation.parent_id,items);
      });
      const roots=annotations.filter(annotation=>!annotation.parent_id||!annotationIds.has(annotation.parent_id));
      const typing=state.presence.filter(person=>person.is_typing&&person.typing_message_id).map(person=>({typing:true,message_id:person.typing_message_id,person}));
      const items=[...roots.map(annotation=>({annotation,message_id:annotation.message_id})),...typing].sort((a,b)=>(order.get(a.message_id)??Infinity)-(order.get(b.message_id)??Infinity));
      return{items,children,messageTabs};
    }

    function cardHtml(a,children,messageTabs,depth=0){
      const tab=messageTabs.get(a.message_id)||'';
      const replies=children.get(a.id)||[];
      const interactive=!state.archiveMode;
      const mine=interactive&&a.author_id===state.profile.id;
      const archivedImage=state.archiveImages?.[`annotation:${a.id}`];
      return `<div class="comment-thread ${depth?'is-reply':''}" style="--reply-depth:${Math.min(depth,3)}"><div class="comment-card" style="--comment-marker:${esc(markerColor(a.color))}" id="comment-${esc(a.id)}" data-target="${esc(a.message_id)}"><div class="comment-author">${a.persona_icon?`<img class="comment-avatar" src="${esc(a.persona_icon)}" alt="" loading="lazy">`:'<span class="comment-avatar empty-avatar"></span>'}<span class="comment-name">${esc(a.persona_name)}<span class="persona-type">${esc(a.persona_type)}</span></span>${mine?`<button class="comment-edit" type="button" data-edit-comment="${esc(a.id)}" title="編集">✎</button>`:''}<time class="comment-date">${tab?`${esc(tab)} `:''}${esc(formatCommentDate(a.created_at))}</time>${interactive?`<button class="comment-like ${a.liked_by_me?'liked':''}" type="button" data-like-comment="${esc(a.id)}" aria-label="好き">${a.liked_by_me?'♥':'♡'}${Number(a.like_count)||''}</button><button class="comment-reply" type="button" data-reply-comment="${esc(a.id)}" title="返信">↩</button>`:''}</div>${a.body?`<p class="comment-body">${commentBodyHtml(a.body)}</p>`:''}${archivedImage?`<img class="comment-image" data-expand-image src="${esc(archivedImage)}" alt="添付画像" loading="lazy">`:a.has_image&&!state.archiveMode?`<img class="comment-image" data-expand-image src="/api/rooms/${encodeURIComponent(state.roomId)}/annotations/${encodeURIComponent(a.id)}/image" alt="添付画像" loading="lazy">`:''}</div>${replies.map(reply=>cardHtml(reply,children,messageTabs,depth+1)).join('')}</div>`;
    }

    const typingHtml=item=>`<button type="button" class="typing-comment" data-typing-target="${esc(item.message_id)}" title="入力中のログへ移動"><span class="comment-avatar">${item.person.typing_icon?`<img src="${esc(item.person.typing_icon)}" alt="">`:esc((item.person.typing_name||item.person.pl_name||'?').slice(0,1))}</span><b>${esc(item.person.typing_name||item.person.pl_name)}</b><em>入力中…</em><i></i><i></i><i></i></button>`;

    function queueFill(){
      if(fillQueued)return;
      fillQueued=true;
      requestAnimationFrame(()=>{
        fillQueued=false;
        if(lastItemCount<=limit)return;
        if(list.scrollHeight<=list.clientHeight+Math.max(90,list.clientHeight*.18)){
          limit=Math.min(lastItemCount,limit+batchSize);
          renderComments();
        }
      });
    }

    renderComments=function(){
      resetIfNeeded();
      const scrollTop=list.scrollTop;
      const {items,children,messageTabs}=model();
      lastItemCount=items.length;
      const count=document.getElementById('commentCount');
      if(count)count.textContent=state.annotations.length;
      if(limit<=0)limit=batchSize;
      limit=Math.min(Math.max(limit,batchSize),Math.max(items.length,batchSize));
      const visible=items.slice(0,limit);
      list.innerHTML=visible.length?visible.map(item=>item.typing?typingHtml(item):cardHtml(item.annotation,children,messageTabs)).join(''):'<p class="empty">マーカーされた感想がここに並びます。</p>';
      list.scrollTop=Math.max(0,Math.min(scrollTop,Math.max(0,list.scrollHeight-list.clientHeight)));
      queueFill();
    };
    window.renderComments=renderComments;

    list.addEventListener('scroll',()=>{
      if(lastItemCount<=limit)return;
      const threshold=Math.max(160,list.clientHeight*.35);
      if(list.scrollTop+list.clientHeight<list.scrollHeight-threshold)return;
      limit=Math.min(lastItemCount,limit+batchSize);
      renderComments();
    },{passive:true});

    const rawJumpToComment=jumpToComment;
    jumpToComment=function(id){
      if(!document.getElementById(`comment-${CSS.escape(id)}`)){
        const {items}=model();
        const byId=new Map(state.annotations.map(a=>[a.id,a]));
        let target=byId.get(id),guard=0;
        while(target?.parent_id&&byId.has(target.parent_id)&&guard++<20)target=byId.get(target.parent_id);
        const index=items.findIndex(item=>item.annotation?.id===target?.id);
        if(index>=0&&index>=limit){
          limit=Math.min(items.length,index+Math.max(4,Math.ceil(batchSize/3)));
          renderComments();
        }
      }
      return rawJumpToComment(id);
    };
    window.jumpToComment=jumpToComment;

    addEventListener('resize',()=>{
      batchSize=initialBatch();
      if(limit<batchSize){limit=batchSize;renderComments()}
    },{passive:true});
  }
  setTimeout(install,0);
})();
