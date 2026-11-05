'use strict';
(()=>{
 if(!window.JijinDesktop)return;
 const originalOpen=window.openInlineCommentEditor,originalRender=window.renderPlaced;
 let editor=null,redraw=false;
 window.jijinSuspendMatrixNote=()=>{if(editor?.busy){editor.field.focus();return false}if(editor)close({keep:true});return true};
 const draftKey=(tid,id)=>`desktop-note:${window.matrixBoardContext?.boardId||''}:${tid}:${id}`;
 function close({keep=false}={}){
  if(!editor)return;const e=editor;editor=null;
  document.removeEventListener('pointerdown',e.outside,true);try{if(parent!==window)parent.document.removeEventListener('pointerdown',e.outside,true)}catch{}
  if(!keep)try{localStorage.removeItem(e.key)}catch{}
  e.box.remove();e.el.classList.remove('comment-editing');
  if(typeof activeCommentEditor!=='undefined'&&activeCommentEditor?.box===e.box)activeCommentEditor=null;
  window.dispatchEvent(new Event('matrix-editor-finished'));
  if(redraw){redraw=false;window.renderPlaced?.()}
 }
 window.renderPlaced=function(...args){if(editor?.box.isConnected){redraw=true;return}return originalRender.apply(this,args)};
 window.openInlineCommentEditor=function(id,el){
  if(!window.JijinDesktop)return originalOpen.apply(this,arguments);
  if(window.jijinSuspendMatrixComment?.()===false)return;
  if(editor?.id===id&&editor.box.isConnected){editor.field.focus();return}
  if(editor)close({keep:true});
  // Dispose detached references left by an earlier remote repaint without saving them.
  if(typeof activeCommentEditor!=='undefined')activeCommentEditor=null;
  document.querySelectorAll('.inline-comment-editor').forEach(node=>node.remove());
  document.querySelectorAll('.placed.comment-editing').forEach(node=>node.classList.remove('comment-editing'));
  const tid=String(window.currentTemplateId?.()||''),local=appState()?.items?.[id];if(!local||!el||!tid)return;
  const base=String(local.comment||''),key=draftKey(tid,id),box=document.createElement('div');box.className='inline-comment-editor pos-'+(local.commentPosition||'top');
  const field=document.createElement('textarea');field.value=base;field.placeholder='コメント';field.setAttribute('aria-label','コマの補足');
  const direction=document.createElement('select');direction.setAttribute('aria-label','補足の位置');for(const [value,label] of [['top','上'],['bottom','下'],['left','左'],['right','右']]){const option=document.createElement('option');option.value=value;option.textContent=label;direction.append(option)}direction.value=local.commentPosition||'top';
  const status=document.createElement('small');status.setAttribute('role','status');direction.hidden=true;const layer=document.createElement('div');layer.className='comment-direction-layer';const updateArrows=()=>layer.querySelectorAll('button').forEach(button=>button.hidden=button.dataset.position===direction.value);for(const [position,label,title] of [['top','︿','上に置く'],['bottom','﹀','下に置く'],['left','〈','左に置く'],['right','〉','右に置く']]){const button=document.createElement('button');button.type='button';button.className='comment-direction-btn dir-'+position;button.dataset.position=position;button.textContent=label;button.setAttribute('aria-label',title);button.addEventListener('pointerdown',event=>{event.preventDefault();event.stopPropagation()});button.onclick=()=>{direction.value=position;direction.dispatchEvent(new Event('change'));updateArrows();field.focus()};layer.append(button)}box.append(field,direction,layer,status);el.append(box);el.classList.add('comment-editing');
  const e={id,tid,key,box,field,el,base,busy:false};editor=e;
  try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(saved&&saved.base===base){field.value=saved.body;direction.value=saved.position||direction.value}}catch{}
  updateArrows();const saveDraft=()=>{try{localStorage.setItem(key,JSON.stringify({base:e.base,body:field.value,position:direction.value}))}catch{}};
  field.addEventListener('input',saveDraft);direction.addEventListener('change',()=>{box.className='inline-comment-editor pos-'+direction.value;saveDraft()});
  const apply=(text,position)=>{
   const state=appState();if(!state.items?.[id])return;state.items[id].comment=text;state.items[id].commentPosition=position;
   saveJSON(STATE,state);saveCurrentTemplateState(state);const live=typeof items!=='undefined'?items.find(item=>item.id===id):null;if(live)live.local=state.items[id];redraw=true;
  };
  const commit=async()=>{
   if(e.busy||editor!==e)return;e.busy=true;field.disabled=true;direction.disabled=true;status.textContent='保存中…';layer.querySelectorAll('button').forEach(button=>button.disabled=true);saveDraft();
   try{
    if(String(window.currentTemplateId?.()||'')!==tid)throw Error('テンプレートが切り替わりました。下書きは残しています。');
    const ok=await window.matrixBoardContext.savePoint(id,{comment:field.value,commentPosition:direction.value,templateId:tid,baseComment:e.base},true);
    if(ok!==true)throw Error('保存を確認できませんでした。入力内容は残しています。');
    if(editor!==e)return;apply(field.value,direction.value);close();
   }catch(error){
    status.textContent=error.message||'保存できませんでした。もう一度Enterで再試行できます。';
    if(error.status===409&&error.point){
     const latest=document.createElement('button');latest.type='button';latest.className='note-conflict-latest';latest.textContent='最新の補足を確認';latest.onclick=()=>{e.base=String(error.point.comment||'');field.value=e.base;direction.value=error.point.commentPosition||'top';apply(e.base,direction.value);updateArrows();status.textContent='最新の補足を表示しました。';latest.remove();saveDraft()};if(!box.querySelector('.note-conflict-latest'))box.append(latest);
    }
   }finally{e.busy=false;field.disabled=false;direction.disabled=false;layer.querySelectorAll('button').forEach(button=>button.disabled=false);if(editor===e)field.focus()}
  };
  e.outside=event=>{if(editor!==e||box.contains(event.target)||e.busy)return;if(!field.value.trim())close()};
  document.addEventListener('pointerdown',e.outside,true);try{if(parent!==window)parent.document.addEventListener('pointerdown',e.outside,true)}catch{}
  field.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing&&event.keyCode!==229){event.preventDefault();event.stopPropagation();if(!event.repeat)commit()}else if(event.key==='Escape'){event.preventDefault();close({keep:true})}});
  box.addEventListener('pointerdown',event=>event.stopPropagation());box.addEventListener('contextmenu',event=>event.stopPropagation());
  activeCommentEditor={id,box,commit};requestAnimationFrame(()=>{if(editor===e){field.focus();field.setSelectionRange(field.value.length,field.value.length)}});
 };
 window.addEventListener('matrix-template-selected',()=>{if(editor&&String(window.currentTemplateId?.()||'')!==editor.tid)close({keep:true})});
 window.addEventListener('pagehide',()=>{if(editor)close({keep:true})});
})();
