"use strict";
(()=>{
  let comments=[],targetId="",replyTo="",editingId="",posting=false,pendingAnchor=null,loadPromise=null,lastSerial="";
  const TARGET_SEP="@@matrix-template@@";
  const esc=value=>String(value??"").replace(/[&<>\"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const ctx=()=>window.matrixBoardContext;
  const profile=()=>ctx()?.profile?.();
  function targetParts(value){const raw=String(value||""),at=raw.indexOf(TARGET_SEP);return at>=0?{templateId:raw.slice(0,at),itemId:raw.slice(at+TARGET_SEP.length)}:{templateId:"",itemId:raw}}
  function storedTarget(value){const parts=targetParts(value);if(parts.templateId)return value;const tid=typeof currentTemplateId==="function"?currentTemplateId():"";return tid?`${tid}${TARGET_SEP}${parts.itemId}`:parts.itemId}
  const targetItem=id=>items.find(item=>item.id===targetParts(id).itemId);
  const targetImage=id=>displayImage(targetItem(id))||"";
  const targetName=id=>targetItem(id)?.name||"PC";
  const pcList=()=>{const p=profile();return [{name:p?.plName||"PL",type:"PL",icon:p?.plIcon||"",color:p?.plColor||"#ffe66b"},...(p?.personas||[]).map(person=>({...person,color:person.color||"#ffe66b"}))];};
  function formatCommentDate(value){if(!value)return"";const raw=String(value),normalized=/Z|[+-]\d\d:?\d\d$/.test(raw)?raw:raw.replace(" ","T")+"Z",date=new Date(normalized);return Number.isNaN(date.getTime())?raw:new Intl.DateTimeFormat("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}).format(date)}

  function panel(){
    let p=document.querySelector("#matrixIconComments");
    const host=document.querySelector(".stage-shell")||document.body;
    if(p){if(host!==document.body&&p.parentNode!==host)host.append(p);return p}
    p=document.createElement("aside");
    p.id="matrixIconComments";
    p.innerHTML='<div class="matrix-comment-head"><b>COMMENTS</b><span id="matrixIconCommentCount">0</span><button type="button" title="コメントを閉じる">×</button></div><section id="matrixIconCommentList"></section>';
    p.querySelector("button").onclick=()=>p.hidden=true;
    host.append(p);
    return p;
  }

  function syncDialogAvatar(d){
    const select=d.querySelector("#matrixCommentPersona"),avatar=d.querySelector(".matrix-comment-input-avatar");
    if(!select||!avatar)return;
    const person=pcList()[Number(select.value)||0],icon=person?.icon||"",name=person?.name||"?";
    avatar.style.setProperty("--persona-marker",person?.color||"#ffe66b");
    avatar.innerHTML=icon?`<img src="${esc(icon)}" alt="">`:`<span>${esc(name.slice(0,1))}</span>`;
  }

  function dialog(){
    let d=document.querySelector("#matrixIconCommentDialog");
    if(d&&d.dataset.logcommentsInput==="1")return d;
    if(d)d.remove();
    d=document.createElement("dialog");
    d.id="matrixIconCommentDialog";
    d.dataset.logcommentsInput="1";
    d.innerHTML='<form class="matrix-comment-log-form" method="dialog"><div class="comment-persona-picker"><span class="matrix-comment-input-avatar comment-input-avatar"></span><select id="matrixCommentPersona" aria-label="発言者"></select></div><textarea id="matrixCommentBody" rows="5" maxlength="4000" aria-label="感想"></textarea><button id="matrixCommentDelete" class="comment-edit-delete" type="button" hidden>このコメントを削除</button></form>';
    document.body.append(d);
    d.querySelector("form").addEventListener("submit",post);
    d.querySelector("#matrixCommentDelete").addEventListener("click",remove);
    d.querySelector("#matrixCommentPersona").addEventListener("change",()=>syncDialogAvatar(d));
    return d;
  }

  function targetAnchor(id){
    const itemId=targetParts(id).itemId;
    const el=document.querySelector(`.placed[data-id="${CSS.escape(itemId)}"] .placed-avatar`)||document.querySelector(`.placed[data-id="${CSS.escape(itemId)}"]`);
    return el?.getBoundingClientRect?.()||null;
  }
  function positionDialog(d,anchor=pendingAnchor){
    if(!anchor||innerWidth<=800){d.style.left="";d.style.top="";return}
    const width=Math.min(390,innerWidth-24),height=Math.min(d.offsetHeight||230,innerHeight-24);
    let left=anchor.right+12;
    if(left+width>innerWidth-12)left=Math.max(12,anchor.left-width-12);
    const top=Math.min(Math.max(12,anchor.top-24),Math.max(12,innerHeight-height-12));
    d.style.left=`${left}px`;d.style.top=`${top}px`;
  }

  function flash(id){
    const itemId=targetParts(id).itemId,el=document.querySelector(`.placed[data-id="${CSS.escape(itemId)}"]`);
    if(!el)return false;
    const img=el.querySelector(".placed-avatar img");
    el.classList.remove("matrix-comment-flash");
    void el.offsetWidth;
    const token=`${Date.now()}-${Math.random()}`;
    el.dataset.matrixFlashToken=token;
    const clear=()=>{
      if(el.dataset.matrixFlashToken!==token)return;
      el.classList.remove("matrix-comment-flash");
      delete el.dataset.matrixFlashToken;
    };
    if(img)img.addEventListener("animationend",clear,{once:true});
    el.classList.add("matrix-comment-flash");
    setTimeout(clear,1150);
    el.scrollIntoView({behavior:"smooth",block:"center",inline:"center"});
    return true
  }
  async function revealTarget(id){
    if(!id)return;
    const parts=targetParts(id),itemId=parts.itemId;
    if(parts.templateId){
      try{
        const current=typeof currentTemplateId==="function"?currentTemplateId():"";
        if(parts.templateId!==current&&typeof switchTemplate==="function")await switchTemplate(parts.templateId);
      }catch(error){console.warn(error)}
      requestAnimationFrame(()=>requestAnimationFrame(()=>flash(itemId)));
      return;
    }
    if(flash(itemId))return;
    try{
      const current=typeof currentTemplateId==="function"?currentTemplateId():"";
      const states=typeof templateStates==="function"?templateStates():{};
      let targetTemplate="";
      for(const [templateId,saved] of Object.entries(states||{})){
        if(saved?.items?.[itemId]?.placed){targetTemplate=templateId;if(templateId===current)break}
      }
      if(targetTemplate&&targetTemplate!==current&&typeof switchTemplate==="function")await switchTemplate(targetTemplate);
    }catch(error){console.warn(error)}
    requestAnimationFrame(()=>requestAnimationFrame(()=>flash(itemId)));
  }
  function commentHtml(c,depth=0,children=new Map()){
    const mine=c.author_id===profile()?.id;
    const avatar=c.persona_icon?`<img class="matrix-comment-avatar" src="${esc(c.persona_icon)}" alt="">`:'<span class="matrix-comment-avatar"></span>';
    const target=targetImage(c.target_id),targetLabel=targetName(c.target_id),replies=children.get(c.id)||[];
    const targetIcon=target?`<img class="matrix-comment-target-icon" src="${esc(target)}" alt="" title="${esc(targetLabel)}">`:`<span class="matrix-comment-target-icon matrix-comment-target-empty" title="${esc(targetLabel)}"></span>`;
    return `<div class="matrix-comment-thread ${depth?"matrix-reply":""}"><article class="matrix-comment-card" data-comment-target="${esc(c.target_id)}"><div class="matrix-comment-author">${avatar}<b>${esc(c.persona_name)}</b><em>${esc(c.persona_type)}</em>${mine?`<button data-matrix-edit="${esc(c.id)}" title="編集">✎</button>`:""}<time>${esc(formatCommentDate(c.created_at))}</time><button data-matrix-like="${esc(c.id)}" class="${c.liked_by_me?"liked":""}" aria-label="好き">${c.liked_by_me?"♥":"♡"}${Number(c.like_count)||""}</button><button data-matrix-reply="${esc(c.id)}" title="返信">↩</button></div><div class="matrix-comment-body-row">${targetIcon}<span class="matrix-comment-target-arrow" aria-hidden="true">›</span><p>${esc(c.body).replace(/\n/g,"<br>")}</p></div></article>${replies.map(r=>commentHtml(r,depth+1,children)).join("")}</div>`
  }
  function render(){const p=panel(),list=p.querySelector("section"),count=p.querySelector("#matrixIconCommentCount"),children=new Map(),ids=new Set(comments.map(c=>c.id));comments.forEach(c=>{if(c.parent_id){const a=children.get(c.parent_id)||[];a.push(c);children.set(c.parent_id,a)}});const roots=comments.filter(c=>!c.parent_id||!ids.has(c.parent_id));count.textContent=comments.length;list.innerHTML=roots.length?roots.map(c=>commentHtml(c,0,children)).join(""):'<p class="matrix-comment-empty">配置したPCへの感想がここに並びます。</p>'}
  async function load(force=false){
    const c=ctx();if(!c?.roomId)return;
    if(loadPromise)return loadPromise;
    const task=(async()=>{
      const data=await c.api(`/api/boards/${encodeURIComponent(c.boardId)}/matrix/${encodeURIComponent(c.roomId)}/comments?authorId=${encodeURIComponent(profile()?.id||"")}`);
      const next=data.comments||[],serial=JSON.stringify(next);
      if(force||serial!==lastSerial){comments=next;lastSerial=serial;render()}
    })();
    loadPromise=task;
    try{return await task}finally{if(loadPromise===task)loadPromise=null}
  }

  function open(id,reply="",edit="",anchor=null){
    if(!id||posting)return;
    panel().hidden=false;
    const p=profile();if(!p?.plName)return alert("先に発言者を登録してください。");
    targetId=id;replyTo=reply;editingId=edit;pendingAnchor=anchor||targetAnchor(id);
    const d=dialog(),select=d.querySelector("#matrixCommentPersona"),all=pcList();
    select.innerHTML=all.map((person,i)=>`<option value="${i}">${esc(person.name)}（${esc(person.type||"PC")}）</option>`).join("");
    const old=comments.find(c=>c.id===edit);
    if(old){
      const index=all.findIndex(person=>person.name===old.persona_name&&person.type===old.persona_type);
      select.value=String(Math.max(0,index));
      d.querySelector("#matrixCommentBody").value=old.body||"";
      d.querySelector("#matrixCommentDelete").hidden=false;
    }else{
      d.querySelector("#matrixCommentBody").value="";
      d.querySelector("#matrixCommentDelete").hidden=true;
    }
    syncDialogAvatar(d);
    if(!d.open)d.show();
    positionDialog(d);
    setTimeout(()=>d.querySelector("textarea")?.focus(),0);
  }

  async function post(event){
    event.preventDefault();
    if(posting)return;
    const c=ctx(),p=profile(),d=dialog(),body=d.querySelector("#matrixCommentBody").value.trim(),person=pcList()[Number(d.querySelector("#matrixCommentPersona").value)||0];
    if(!body||!c?.roomId||!p?.id||!person)return;
    posting=true;d.dataset.submitting="1";
    try{
      if(editingId)await c.api(`/api/boards/${encodeURIComponent(c.boardId)}/matrix/${encodeURIComponent(c.roomId)}/comments/${encodeURIComponent(editingId)}`,{method:"PATCH",body:JSON.stringify({authorId:p.id,body})});
      else await c.api(`/api/boards/${encodeURIComponent(c.boardId)}/matrix/${encodeURIComponent(c.roomId)}/comments`,{method:"POST",body:JSON.stringify({targetId:storedTarget(targetId),parentId:replyTo,authorId:p.id,authorName:p.plName,personaName:person.name,personaType:person.type||"PC",personaIcon:person.icon||"",body})});
      d.close();await load(true);
    }catch(error){alert(error.message)}finally{posting=false;delete d.dataset.submitting}
  }
  async function remove(){const c=ctx(),p=profile();if(posting||!editingId||!confirm("このコメントを削除しますか？\n返信もまとめて削除されます。"))return;posting=true;try{await c.api(`/api/boards/${encodeURIComponent(c.boardId)}/matrix/${encodeURIComponent(c.roomId)}/comments/${encodeURIComponent(editingId)}`,{method:"DELETE",body:JSON.stringify({authorId:p.id})});dialog().close();await load(true)}catch(error){alert(error.message)}finally{posting=false}}
  async function like(id){const c=ctx();try{await c.api(`/api/boards/${encodeURIComponent(c.boardId)}/matrix/${encodeURIComponent(c.roomId)}/comments/${encodeURIComponent(id)}/like`,{method:"POST",body:JSON.stringify({authorId:profile()?.id})});await load(true)}catch(error){alert(error.message)}}

  document.addEventListener("click",event=>{
    const likeButton=event.target.closest("[data-matrix-like]"),replyButton=event.target.closest("[data-matrix-reply]"),editButton=event.target.closest("[data-matrix-edit]"),card=event.target.closest("[data-comment-target]");
    if(likeButton){event.stopPropagation();like(likeButton.dataset.matrixLike);return}
    if(replyButton){event.stopPropagation();const c=comments.find(x=>x.id===replyButton.dataset.matrixReply);open(c?.target_id,c?.id,"",replyButton.closest(".matrix-comment-card")?.getBoundingClientRect());return}
    if(editButton){event.stopPropagation();const c=comments.find(x=>x.id===editButton.dataset.matrixEdit);open(c?.target_id,"",c?.id,editButton.closest(".matrix-comment-card")?.getBoundingClientRect());return}
    if(card){revealTarget(card.dataset.commentTarget)}
  });
  document.addEventListener("pointerdown",event=>{
    const d=document.querySelector("#matrixIconCommentDialog");
    if(!d?.open||posting||d.contains(event.target))return;
    const textarea=d.querySelector("#matrixCommentBody");
    if(textarea?.value.trim())d.querySelector("form")?.requestSubmit();
    else d.close();
  });

  window.openMatrixIconComment=id=>open(id);
  window.addEventListener("matrix-board-room",()=>{lastSerial="";load(true).catch(console.warn)});
  window.addEventListener("matrix-board-comments-changed",()=>load().catch(console.warn));
  setTimeout(()=>load().catch(console.warn),900);
})();
