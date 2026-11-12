"use strict";
(()=>{
  if(window.__jijinMatrixCommentController)return;
  window.__jijinMatrixCommentController=true;
  let comments=[],targetId="",replyTo="",editingId="",posting=false,pendingAnchor=null,lastSerial="",composerPeople=[];
  const TARGET_SEP="@@matrix-template@@";
  const esc=value=>String(value??"").replace(/[&<>\"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const ctx=()=>window.matrixBoardContext;
  const profile=()=>ctx()?.profile?.();
  const commentApi=JijinComments.adapter(()=>ctx()?.boardId,(path,options)=>ctx().api(path,options));
  const commentRoom=()=>ctx()?.roomId||ctx()?.boardId||"";
  function targetParts(value){
    const raw=String(value||'');
    if(raw.startsWith('/boards/')){const t=JijinComments.target.parse(raw,ctx()?.boardId);return {templateId:t.templateId||'',itemId:t.pointId||t.legacyId||''}}
    // Selection IDs and pre-unification local references are converted once.
    const at=raw.indexOf(TARGET_SEP);return at>=0?{templateId:raw.slice(0,at),itemId:raw.slice(at+TARGET_SEP.length)}:{templateId:'',itemId:raw};
  }
  function storedTarget(value){
    if(String(value).startsWith('/boards/'))return JijinComments.target.parse(value,ctx()?.boardId).address;
    const parts=targetParts(value),tid=parts.templateId||(typeof currentTemplateId==='function'?currentTemplateId():'');
    return JijinComments.target.matrix(ctx().boardId,tid,parts.itemId);
  }
  const targetItem=id=>items.find(item=>item.id===targetParts(id).itemId);
  const targetImage=id=>displayImage(targetItem(id))||"";
  const targetName=id=>targetItem(id)?.name||"PC";
  const pcList=()=>{
    const p=profile(),pcs=new Map();
    let local=[];try{local=JSON.parse(localStorage.getItem(`personas:${commentRoom()}`)||"[]")}catch{}
    for(const item of (typeof items!=="undefined"?items:[])){
      if(item.ownerId===p?.id)pcs.set(String(item.personaId||item.id),{id:item.personaId,name:item.name,type:"PC",icon:item.baseImage||"",color:(window.JijinDesktop?item.markerColor:item.color)||"#ffe66b",...(window.JijinDesktop?{colorDark:item.markerColorDark||item.markerColor||"#ffe66b"}:{})});
    }
    for(const person of [...local,...(p?.personas||[])])if(person?.name)pcs.set(String(person.id||person.name),person);
    return [{name:p?.plName||"PL",type:"PL",icon:p?.plIcon||"",color:p?.plColor||"#ffe66b"},...[...pcs.values()].filter(person=>person.name)];
  };
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

  const typingPeers=new Map(),typingClient=crypto.randomUUID();let typingSent=0;
  function sendTyping(on,inlineTarget=""){
    const person=composerPeople[Number(document.querySelector('#matrixCommentPersona')?.value)||0];
    if(on&&Date.now()-typingSent<500)return;typingSent=Date.now();
    ctx()?.notifyChange?.('matrix-typing',{clientId:typingClient,authorId:profile()?.id,templateId:typeof currentTemplateId==='function'?currentTemplateId():'',targetId:inlineTarget||targetId,name:person?.name||profile()?.plName||'PL',icon:String(person?.icon||'').length<3000?person?.icon||'':'',typing:!!on});
  }
  function renderTyping(){
    const list=document.querySelector('#matrixIconCommentList');if(!list)return;
    list.querySelector('.matrix-typing-stack')?.remove();
    const tid=typeof currentTemplateId==='function'?currentTemplateId():'';
    const peers=new Map();
    for(const peer of typingPeers.values()){
      if(peer.templateId===tid)peers.set(peer.authorId||peer.clientId,peer.name||'PL');
    }
    if(!peers.size)return;
    const names=[...peers.values()].join('と');
    const stack=document.createElement('div');stack.className='matrix-typing-stack';
    const row=document.createElement('div');row.className='matrix-typing';
    row.setAttribute('role','status');
    row.title=names+'が入力中…';
    row.innerHTML=`<b>${esc(names)}</b><em>が入力中…</em><i aria-hidden="true"></i><i aria-hidden="true"></i><i aria-hidden="true"></i>`;
    stack.append(row);
    list.prepend(stack);
  }
  window.addEventListener('matrix-board-typing',event=>{
    const peer=event.detail;if(!peer?.clientId||peer.clientId===typingClient)return;
    const previous=typingPeers.get(peer.clientId);clearTimeout(previous?.timer);
    if(peer.typing){peer.timer=setTimeout(()=>{typingPeers.delete(peer.clientId);renderTyping()},6000);typingPeers.set(peer.clientId,peer)}else typingPeers.delete(peer.clientId);
    renderTyping();
  });
  document.addEventListener('input',event=>{if(event.target.id==='matrixCommentBody')sendTyping(!!event.target.value.trim());else if(event.target.matches?.('.inline-comment-editor textarea'))sendTyping(!!event.target.value.trim(),event.target.closest('.placed')?.dataset.id||'')});
  document.addEventListener('focusout',event=>{if(event.target.matches?.('.inline-comment-editor textarea'))sendTyping(false)});
  window.addEventListener('pagehide',()=>sendTyping(false));
  function syncDialogAvatar(d){
    const select=d.querySelector("#matrixCommentPersona"),avatar=d.querySelector(".matrix-comment-input-avatar");
    if(!select||!avatar)return;
    const person=composerPeople[Number(select.value)||0],icon=person?.icon||"",name=person?.name||"?";
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
    d.innerHTML='<form class="matrix-comment-log-form"><div class="comment-persona-picker"><span class="matrix-comment-input-avatar comment-input-avatar"></span><select id="matrixCommentPersona" aria-label="発言者"></select></div><textarea id="matrixCommentBody" rows="3" maxlength="4000" aria-label="感想"></textarea><p id="matrixCommentStatus" role="status" aria-live="polite"></p><button id="matrixCommentDelete" class="comment-edit-delete" type="button" hidden>このコメントを削除</button></form>';
    document.body.append(d);
    d.addEventListener("close",()=>sendTyping(false));
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
    el.classList.remove("matrix-comment-flash");
    void el.offsetWidth;
    const token=`${Date.now()}-${Math.random()}`;
    el.dataset.matrixFlashToken=token;
    const clear=()=>{
      if(el.dataset.matrixFlashToken!==token)return;
      el.classList.remove("matrix-comment-flash");
      delete el.dataset.matrixFlashToken;
    };
    el.addEventListener("animationend",clear,{once:true});
    el.classList.add("matrix-comment-flash");
    setTimeout(clear,1150);
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
  function commentColor(c){
    let value=c.color||c.marker_color||"";
    const p=profile();
    if(c.author_id===p?.id){
      if(c.persona_type==="PL")value=p.plColor?p.plColor+"|"+(p.plColorDark||p.plColor):value;
      else{const person=pcList().find(person=>person.name===c.persona_name);if(person?.color)value=person.color+"|"+(person.colorDark||person.color)}
      try{
        const saved=JSON.parse(localStorage.getItem(`jijinboardSelectedColors:${ctx()?.boardId}:${p.id}`)||"{}");
        const person=pcList().find(person=>person.name===c.persona_name&&person.type===c.persona_type);
        const choice=c.persona_type==="PL"?saved.PL:(saved[person?.id]||saved[`name:${c.persona_type}:${c.persona_name}`]);
        if(choice)value=choice.light+"|"+(choice.dark||choice.light);
      }catch{}
    }
    const pair=String(value||"#ffe66b").split("|");
    const color=document.documentElement.classList.contains("dark")?(pair[1]||pair[0]):pair[0];
    return /^#[0-9a-f]{3,8}$/i.test(color)?color:"#ffe66b";
  }
  function commentHtml(c,depth=0,children=new Map()){
    const mine=c.author_id===profile()?.id;
    const avatar=c.persona_icon?`<img class="matrix-comment-avatar" src="${esc(c.persona_icon)}" alt="">`:'<span class="matrix-comment-avatar"></span>';
    const target=targetImage(c.target||c.target_id),targetLabel=targetName(c.target||c.target_id),replies=children.get(c.id)||[];
    const targetIcon=target?`<img class="matrix-comment-target-icon" src="${esc(target)}" alt="" title="${esc(targetLabel)}">`:`<span class="matrix-comment-target-icon matrix-comment-target-empty" title="${esc(targetLabel)}"></span>`;
    return `<div class="matrix-comment-thread ${depth?"matrix-reply":""}${c.pointNote?" matrix-point-note-thread":""}"><article class="matrix-comment-card" style="--comment-marker:${esc(commentColor(c))};--speaker-name-color:${/^#[0-9a-f]{6}$/i.test(c.text_color||'')?c.text_color:'inherit'}" data-comment-target="${esc(c.target||c.target_id)}"><div class="matrix-comment-author">${avatar}<b>${esc(c.persona_name)}</b><em>${esc(c.persona_type)}</em>${c.pointNote?"":`<span class="matrix-comment-target-arrow" aria-hidden="true">＞</span>${targetIcon}`}${!c.pointNote&&mine?`<button data-matrix-edit="${esc(c.id)}" title="編集">✎</button>`:""}${c.pointNote?"":`<time>${esc(formatCommentDate(c.created_at))}</time><button data-matrix-like="${esc(c.id)}" class="${c.liked_by_me?"liked":""}" aria-label="好き">${c.liked_by_me?"♥":"♡"}${Number(c.like_count)||""}</button><button data-matrix-reply="${esc(c.id)}" title="返信">↩</button>`}</div><div class="matrix-comment-body-row"><p>${esc(c.body).replace(/\n/g,"<br>")}</p></div></article>${replies.map(r=>commentHtml(r,depth+1,children)).join("")}</div>`
  }
  const template=()=>typeof currentTemplateId==='function'?String(currentTemplateId()||''):'';
  function pointNote(state,id){
    return state.display?.showComment===false?'':String(state.items?.[id]?.comment||'').trim();
  }

  let hoveredPoint=null,previewBubble=null;
  function closePointPreview(){
    previewBubble?.remove();
    previewBubble=null;
    hoveredPoint=null;
  }
  document.addEventListener('pointerover',event=>{
    if(event.pointerType!=='mouse')return;
    const placed=event.target.closest?.('.placed[data-id]');
    if(!placed?.dataset.notePreview||placed===hoveredPoint||placed.classList.contains('comment-editing'))return;
    closePointPreview();
    hoveredPoint=placed;
    const bubble=document.createElement('div');
    bubble.className='matrix-point-hover-preview';
    bubble.textContent=placed.dataset.notePreview;
    document.body.append(bubble);
    previewBubble=bubble;
    const point=placed.getBoundingClientRect(),rect=bubble.getBoundingClientRect(),margin=8;
    const left=Math.max(margin,Math.min(point.left+(point.width-rect.width)/2,innerWidth-rect.width-margin));
    const top=point.top>=rect.height+margin*2?point.top-rect.height-margin:point.bottom+margin;
    bubble.style.left=left+'px';
    bubble.style.top=Math.max(margin,Math.min(top,innerHeight-rect.height-margin))+'px';
  });
  document.addEventListener('pointerout',event=>{
    if(hoveredPoint?.contains(event.target)&&!hoveredPoint.contains(event.relatedTarget))closePointPreview();
  });
  document.addEventListener('pointerdown',closePointPreview,true);
  document.addEventListener('scroll',closePointPreview,true);
  window.addEventListener('resize',closePointPreview);
  window.addEventListener('blur',closePointPreview);

  function refreshPointNotes(){
    const state=typeof appState==="function"?appState():{},tid=template();
    const notes=[];
    for(const placed of document.querySelectorAll('.placed[data-id]')){
      const id=placed.dataset.id,note=pointNote(state,id);
      if(note)placed.dataset.notePreview=note.length>100?note.slice(0,100)+'…':note;
      else delete placed.dataset.notePreview;
      if(note){
        const item=targetItem(id),address=`${tid}${TARGET_SEP}${id}`;
        notes.push(commentHtml({
          pointNote:true,target:address,body:note,persona_name:targetName(id),
          persona_type:'コマの補足',persona_icon:targetImage(id),
          color:item?.markerColor||item?.color,text_color:item?.color
        }));
      }
      let badge=placed.querySelector('.matrix-point-note-badge');
      if(!note){badge?.remove();continue}
      if(!badge){
        badge=document.createElement('button');
        badge.type='button';badge.className='matrix-point-note-badge';
        badge.setAttribute('aria-label','コマの補足とコメントを表示');
        badge.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>';
        badge.addEventListener('pointerdown',event=>event.stopPropagation());
        badge.addEventListener('click',event=>{event.stopPropagation();showPointComments(id)});
        placed.append(badge);
      }
    }
    if(hoveredPoint&&!hoveredPoint.isConnected)closePointPreview();
    const p=panel(),list=p.querySelector('section');
    const previous=[...list.querySelectorAll(':scope > .matrix-point-note-thread')];
    if(previous.length===notes.length&&previous.every((node,index)=>node.matrixPointNoteHtml===notes[index]))return;
    previous.forEach(node=>node.remove());
    const anchor=list.querySelector(':scope > .matrix-comment-thread, :scope > .matrix-comment-empty');
    for(const html of notes){
      const fragment=document.createElement('template');fragment.innerHTML=html;
      const card=fragment.content.firstElementChild;card.matrixPointNoteHtml=html;
      list.insertBefore(card,anchor);
    }
    const count=p.querySelector('#matrixIconCommentCount');
    if(count)count.textContent=String(list.querySelectorAll('.matrix-comment-card').length);
    const empty=list.querySelector('.matrix-comment-empty');
    if(empty)empty.hidden=notes.length>0;
  }

  function showPointComments(id){
    closePointPreview();
    const p=panel(),list=p.querySelector('section');
    p.hidden=false;
    window.dispatchEvent(new Event('matrix-point-comments-open'));
    const cards=[...list.querySelectorAll('.matrix-comment-card')];
    const card=cards.find(node=>targetParts(node.dataset.commentTarget).itemId===id);
    if(!card)return;
    cards.forEach(node=>node.classList.toggle('focused',node===card));
    list.scrollTop+=card.getBoundingClientRect().top-list.getBoundingClientRect().top-8;
  }

  function render(){
    const tid=typeof currentTemplateId==="function"?String(currentTemplateId()||""):"";
    const visibleComments=comments.filter(comment=>{
      const target=targetParts(comment.target||comment.target_id);
      if(!tid)return false;
      if(target.templateId)return target.templateId===tid;
      return !!(typeof appState==="function"&&appState()?.items?.[target.itemId]?.placed);
    });
const p=panel(),list=p.querySelector("section"),count=p.querySelector("#matrixIconCommentCount"),children=new Map(),ids=new Set(visibleComments.map(c=>c.id));visibleComments.forEach(c=>{if(c.parent_id){const a=children.get(c.parent_id)||[];a.push(c);children.set(c.parent_id,a)}});if(window.JijinDesktop)for(const rows of children.values())rows.sort((a,b)=>-window.JijinDesktop.newest(a,b));const roots=visibleComments.filter(c=>!c.parent_id||!ids.has(c.parent_id));if(window.JijinDesktop)roots.sort(window.JijinDesktop.newest);count.textContent=visibleComments.length;list.innerHTML=roots.length?roots.map(c=>commentHtml(c,0,children)).join(""):'<p class="matrix-comment-empty">マーカーされた感想がここに並びます。</p>';renderTyping();refreshPointNotes()}
  const changes=JijinSync.ledger();let cacheVersion=0;
  const load=JijinComments.loader(async()=>{
    const c=ctx();if(!c||!commentRoom())return null;
    return commentApi(`/api/boards/${encodeURIComponent(c.boardId)}/matrix/${encodeURIComponent(commentRoom())}/comments?authorId=${encodeURIComponent(profile()?.id||'')}`);
  },data=>{if(!data)return;cacheVersion=Math.max(cacheVersion,Number(data.version)||0);changes.snapshot(data.version);const next=data.comments||[],serial=JSON.stringify(next);if(serial!==lastSerial){comments=next;lastSerial=serial;render()}},{key:()=>ctx()?.boardId?JSON.stringify(['matrix',ctx().boardId,profile()?.id||'']):'',snapshot:()=>({comments,version:cacheVersion})});
  function applyChange(action,data,own=false){
    const next=JijinSync.reduce(comments,action,data,{scope:JijinComments.target.matrix(ctx()?.boardId),viewerId:profile()?.id,own});
    if(next===null)return false;
    if(next===comments)return true;
    if(!changes.accept(action,data))return true;
    load.patch(()=>{if(!changes.newer(data))return;cacheVersion=Math.max(cacheVersion,Number(data.version)||0);const rows=JijinSync.reduce(comments,action,data,{scope:JijinComments.target.matrix(ctx()?.boardId),viewerId:profile()?.id,own});if(rows===null)return;comments=rows;lastSerial=JSON.stringify(rows);render()});return true;
  }
  const commentLive=JijinComments.live({board:()=>ctx()?.boardId,refresh:load,onChange:applyChange,onNote:data=>{
    if(ctx()?.isActive?.())ctx()?.applyRemotePoint?.(data?.point);
    window.dispatchEvent(new CustomEvent('matrix-board-comments-changed',{detail:{action:'matrix-template-state'}}));
  }});
  window.addEventListener('matrix-board-active',()=>{commentLive.setActive(true)});
  window.addEventListener('message',event=>{if(event.origin===location.origin&&event.data?.type==='jijinboard-matrix-active')commentLive.setActive(!!event.data.active)});
  commentLive.setActive(!!ctx()?.isActive?.());


  const desktopDrafts=new Map();
  const desktopDraftKey=(id,reply,edit)=>JSON.stringify([id,reply,edit]);
  window.jijinSuspendMatrixComment=()=>{
    if(!window.JijinDesktop)return true;
    const d=document.querySelector('#matrixIconCommentDialog');if(!d?.open)return true;
    if(posting){d.querySelector('textarea')?.focus();return false}
    desktopDrafts.set(desktopDraftKey(targetId,replyTo,editingId),{body:d.querySelector('#matrixCommentBody')?.value||'',persona:d.querySelector('#matrixCommentPersona')?.value||'0'});
    d.close();sendTyping(false);return true;
  };
  async function open(id,reply="",edit="",anchor=null){
    if(!id||posting)return;
    if(window.JijinDesktop&&window.jijinSuspendMatrixNote?.()===false)return;
    const existing=document.querySelector('#matrixIconCommentDialog');
    if(window.JijinCommentComposer?.keep(existing))return;
    if(existing?.open&&existing.querySelector('textarea')?.value.trim()){
      await post({preventDefault(){}});
      if(existing.open)return;
    }
    panel().hidden=false;
    const p=profile();if(!p?.plName)return alert("先に発言者を登録してください。");
    targetId=id;replyTo=reply;editingId=edit;pendingAnchor=anchor||targetAnchor(id);
    const d=dialog(),select=d.querySelector("#matrixCommentPersona"),all=pcList();
    composerPeople=all;
    select.innerHTML=all.map((person,i)=>`<option value="${i}">${esc(person.name)}（${esc(person.type||"PC")}）</option>`).join("");
    const sessionTarget=id;
    d.querySelector("#matrixCommentStatus").textContent="";
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
    if(window.JijinDesktop){const draft=desktopDrafts.get(desktopDraftKey(id,reply,edit));if(draft){d.querySelector('#matrixCommentBody').value=draft.body;select.value=draft.persona}}
    syncDialogAvatar(d);
    positionDialog(d);
    if(!d.open)d.show();
    positionDialog(d);
    setTimeout(()=>{if(d.open)d.querySelector("textarea")?.focus({preventScroll:true})},0);
    try{
      const data=await ctx().api(`/api/boards/${encodeURIComponent(ctx().boardId)}/participants`);
      if(!d.open||targetId!==sessionTarget||posting)return;
      const selected=composerPeople[Number(select.value)||0];
      const own=(data.participants||[]).filter(person=>String(person.authorId)===String(p.id)).map(person=>({id:person.personaId,name:person.name,type:person.type||"PC",icon:person.baseIcon||person.icon||"",color:person.color||"#ffe66b"}));
      const byId=new Map(composerPeople.slice(1).map(person=>[String(person.id||person.name),person]));
      for(const person of own)byId.set(String(person.id||person.name),person);
      composerPeople=[composerPeople[0],...byId.values()];
      select.innerHTML=composerPeople.map((person,i)=>`<option value="${i}">${esc(person.name)}（${esc(person.type||"PC")}）</option>`).join("");
      select.value=String(Math.max(0,composerPeople.findIndex(person=>person.type===selected?.type&&(person.id?person.id===selected?.id:person.name===selected?.name))));
      syncDialogAvatar(d);
    }catch(error){d.querySelector("#matrixCommentStatus").textContent="PC一覧を取得できませんでした："+error.message;}
  }

  async function post(event){
    event.preventDefault();
    if(posting)return;
    const c=ctx(),p=profile(),d=dialog(),body=d.querySelector("#matrixCommentBody").value.trim(),person=composerPeople[Number(d.querySelector("#matrixCommentPersona").value)||0];
    if(!body)return;
    if(!c||!commentRoom()||!p?.id||!person){alert("発言者情報を確認してください。");return;}
    posting=true;sendTyping(false);d.dataset.submitting="1";
    const status=d.querySelector("#matrixCommentStatus");status.textContent="";
    try{
      let result;if(editingId)result=await commentApi(`/api/boards/${encodeURIComponent(c.boardId)}/matrix/${encodeURIComponent(commentRoom())}/comments/${encodeURIComponent(editingId)}`,{method:"PATCH",body:JSON.stringify({authorId:p.id,body})});
      else result=await commentApi(`/api/boards/${encodeURIComponent(c.boardId)}/matrix/${encodeURIComponent(commentRoom())}/comments`,{method:"POST",body:JSON.stringify({target:storedTarget(targetId),parentId:replyTo,authorId:p.id,authorName:p.plName,characterId:person.id||"",personaName:person.name,personaType:person.type||"PC",personaIcon:person.icon||"",body})});
      if(window.JijinDesktop)desktopDrafts.delete(desktopDraftKey(targetId,replyTo,editingId));d.close();if(!applyChange(editingId?'comment:edit':'comment:create',{...result,target:result.comment?.target||result.annotation?.target},true))load().catch(console.warn);
    }catch(error){status.textContent="保存できませんでした："+error.message;}finally{posting=false;delete d.dataset.submitting}
  }
  async function remove(){const c=ctx(),p=profile();if(posting||!editingId||!confirm("このコメントを削除しますか？\n返信もまとめて削除されます。"))return;posting=true;try{await commentApi(`/api/boards/${encodeURIComponent(c.boardId)}/matrix/${encodeURIComponent(commentRoom())}/comments/${encodeURIComponent(editingId)}`,{method:"DELETE",body:JSON.stringify({authorId:p.id})});dialog().close();await load(true)}catch(error){alert(error.message)}finally{posting=false}}
  async function like(id){const c=ctx();try{await commentApi(`/api/boards/${encodeURIComponent(c.boardId)}/matrix/${encodeURIComponent(commentRoom())}/comments/${encodeURIComponent(id)}/like`,{method:"POST",body:JSON.stringify({authorId:profile()?.id})});await load(true)}catch(error){alert(error.message)}}

  document.addEventListener("click",event=>{
    const likeButton=event.target.closest("[data-matrix-like]"),replyButton=event.target.closest("[data-matrix-reply]"),editButton=event.target.closest("[data-matrix-edit]"),card=event.target.closest("[data-comment-target]");
    if(likeButton){event.stopPropagation();like(likeButton.dataset.matrixLike);return}
    if(replyButton){event.stopPropagation();const c=comments.find(x=>x.id===replyButton.dataset.matrixReply);open(c?.target||c?.target_id,c?.id,"",replyButton.closest(".matrix-comment-card")?.getBoundingClientRect());return}
    if(editButton){event.stopPropagation();const c=comments.find(x=>x.id===editButton.dataset.matrixEdit);open(c?.target||c?.target_id,"",c?.id,editButton.closest(".matrix-comment-card")?.getBoundingClientRect());return}
    if(card){document.querySelectorAll(".matrix-comment-card.focused").forEach(node=>node.classList.remove("focused"));card.classList.add("focused");revealTarget(card.dataset.commentTarget)}
  });
  function saveOutside(){
    const d=document.querySelector("#matrixIconCommentDialog");
    if(!d?.open||posting)return;
    if(window.JijinCommentComposer?.outside(d))return;
    if(d.querySelector("#matrixCommentBody")?.value.trim())post({preventDefault(){}});
    else d.close();
  }
  document.addEventListener("click",event=>{
    const d=document.querySelector("#matrixIconCommentDialog");
    if(d?.open&&!d.contains(event.target))saveOutside();
  },true);
  document.addEventListener("keydown",event=>{if((event.ctrlKey||event.metaKey)&&event.key==="Enter"&&event.target.closest?.('#matrixIconCommentDialog')){event.preventDefault();saveOutside()}});
  try{if(parent!==window)parent.document.addEventListener("pointerdown",saveOutside,true)}catch{}
  window.addEventListener("message",event=>{if(event.origin===location.origin&&event.data?.type==="jijinboard-save-matrix-comment")saveOutside()});


  window.addEventListener("matrix-template-selected",()=>{render()});
  window.addEventListener("storage",()=>render());
  window.addEventListener("matrix-board-participants-changed",()=>load(true));
  new MutationObserver(()=>render()).observe(document.documentElement,{attributes:true,attributeFilter:["class"]});
  render();
  window.openMatrixIconComment=id=>open(id);
  window.showMatrixPointComments=showPointComments;
  window.refreshMatrixPointNotes=refreshPointNotes;
  window.addEventListener("matrix-board-room",()=>{lastSerial="";load(true).catch(console.warn)});
  window.addEventListener("matrix-board-comments-changed",event=>{
    // Template/point layout updates do not require reloading comment threads.
    if(event.detail?.action==="matrix-template-state")return;
    load().catch(console.warn);
  });
  // The shared channel loads once and catches up on reconnect.
})();

