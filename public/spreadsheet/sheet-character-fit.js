(()=>{
  'use strict';
  function defaults(){
    const design=state.layout.design||=( {} );
    if(!design.grayQuestionDefaultV1){design.questionTextColor='#8b93a2';design.grayQuestionDefaultV1=true}
  }
  const rawDesign=window.getCharacterDesign;
  window.getCharacterDesign=function(...args){defaults();return rawDesign.apply(this,args)};
  function fit(){
    defaults();
    for(const group of document.querySelectorAll('[data-sheet-group-id]')){
      const span=window.sheetGroupSpan?.(group.dataset.sheetGroupId)||6;
      group.classList.toggle('sheet-small-group',span<=3);
      for(const row of group.querySelectorAll('.character-sheet-row:has(.auto-video-preview:not(:empty))')){
        row.style.setProperty('grid-column',span<=3?'1 / -1':'auto','important');
        row.style.setProperty('flex-basis',span<=3?'100%':'auto','important');
      }
    }
    for(const field of document.querySelectorAll('.character-sheet-edit,.character-answer')){
      field.style.setProperty('overflow','hidden','important');
      field.style.setProperty('max-height','none','important');
      field.style.setProperty('height','0px','important');
      field.style.setProperty('height',Math.max(24,field.scrollHeight+2)+'px','important');
    }
  }
  let queued=false;
  function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;fit()})}
  for(const name of ['renderFullCharacterMode','openCharacterPopup','renderCharacterView','syncAutoVideoPreview']){
    const raw=window[name];if(typeof raw!=='function')continue;
    window[name]=function(...args){const result=raw.apply(this,args);schedule();return result};
  }
  const style=document.createElement('style');style.textContent=`
    .character-sheet-edit,.character-answer{overflow:hidden!important;resize:none!important;max-height:none!important;white-space:pre-wrap!important;overflow-wrap:anywhere!important;box-sizing:border-box!important}
    .character-sheet-value,.character-row-value{min-width:0!important;max-width:100%!important;overflow:visible!important}
    .character-sheet-row:has(.auto-video-preview:not(:empty)){grid-column:auto!important;min-width:0!important;max-width:100%!important;width:auto!important}
    .character-sheet-group.sheet-small-group .character-sheet-row:has(.auto-video-preview:not(:empty)){grid-column:1 / -1!important;width:100%!important;flex-basis:100%!important;box-sizing:border-box!important}
    .character-sheet-group .auto-video-preview,.character-sheet-group .auto-video-frame{width:100%!important;max-width:100%!important;min-width:0!important;box-sizing:border-box!important}
    .character-sheet-group .auto-video-frame iframe,.character-sheet-group .auto-video-frame video{width:100%!important;max-width:100%!important;height:100%!important}
    .character-sheet-value:has(.auto-video-preview:not(:empty)),.character-row-value:has(.auto-video-preview:not(:empty)){display:flex!important;flex-direction:column!important}
    .character-sheet-value:has(.auto-video-preview:not(:empty)) .auto-video-preview,.character-row-value:has(.auto-video-preview:not(:empty)) .auto-video-preview{order:1;margin:0!important;padding:0!important}
    .character-sheet-value:has(.auto-video-preview:not(:empty)) textarea,.character-row-value:has(.auto-video-preview:not(:empty)) textarea{order:2;font-size:10px!important;text-align:right!important;color:var(--sheet-accent,var(--user-accent,#8b93a2))!important;line-height:1.4!important;padding:3px 0!important;width:100%!important}
    .character-sheet-label{color:var(--character-question-text,#8b93a2)!important}
  `;document.head.appendChild(style);
  const observer=new MutationObserver(schedule);
  for(const id of ['characterPopupBody','fullCharacterPages','characterViewRoot']){const root=document.getElementById(id);if(root)observer.observe(root,{childList:true,subtree:true})}
  document.addEventListener('input',event=>{if(event.target.matches('.character-sheet-edit,.character-answer'))schedule()},true);
  window.addEventListener('resize',schedule);
  schedule();
})();
