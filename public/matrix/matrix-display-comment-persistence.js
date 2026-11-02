'use strict';
// Display notes are shared point fields on the current template. Only an actual
// user edit is a write; cached notes never overlay or repopulate server state.
(()=>{
 if(typeof appState!=='function'||typeof mutate!=='function')return;
 const rawMutate=mutate;
 const annotation=item=>({comment:String(item?.comment??''),commentPosition:String(item?.commentPosition||'top')});
 const clone=value=>structuredClone(value||{});
 mutate=function(fn){
  const templateId=String(window.currentTemplateId?.()||'');
  const before=clone(appState()?.items),result=rawMutate(fn),after=clone(appState()?.items);
  if(!templateId)return result;
  for(const id of new Set([...Object.keys(before),...Object.keys(after)])){
   const old=annotation(before[id]),next=annotation(after[id]);
   if(old.comment===next.comment&&old.commentPosition===next.commentPosition)continue;
   Promise.resolve(window.matrixBoardContext?.savePoint?.(id,{...after[id],...next,templateId,baseComment:old.comment},true)).then(ok=>{
    if(ok===false)throw Error('コマのコメントを共有保存できませんでした');
   }).catch(error=>{console.warn(error);alert('コマのコメントを共有保存できませんでした。通信を確認して、もう一度編集してください。')});
  }
  return result;
 };
})();
