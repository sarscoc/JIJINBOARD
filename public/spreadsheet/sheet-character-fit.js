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
      const columns=Number(state.layout.sheetLayout?.contentColumns?.[group.dataset.sheetGroupId]);
      if(columns>=1&&columns<=3){
        group.style.setProperty('display','block','important');group.style.setProperty('height','auto','important');group.style.setProperty('align-self','start','important');
        const rows=group.querySelector('.character-sheet-rows');
        if(rows){
          rows.style.setProperty('display','block','important');rows.style.setProperty('column-count',String(columns),'important');rows.style.setProperty('column-width','auto','important');
          rows.style.setProperty('height','auto','important');rows.style.setProperty('min-height','0','important');
          for(const row of rows.children){row.style.setProperty('display','inline-block','important');row.style.setProperty('width','100%','important');row.style.setProperty('break-inside','avoid-column','important');row.style.setProperty('height','auto','important');row.style.setProperty('min-height','0','important');row.style.setProperty('margin','0 0 6px','important')}
        }
      }

      for(const row of group.querySelectorAll('.character-sheet-row:has(.auto-video-preview:not(:empty))')){
        row.style.setProperty('grid-column',span<=3?'1 / -1':'auto','important');
        row.style.setProperty('flex-basis',span<=3?'100%':'auto','important');
      }
    }
    for(const field of document.querySelectorAll('.character-sheet-edit,.character-answer')){
      field.style.setProperty('overflow','hidden','important');
      field.style.setProperty('max-height','none','important');
      field.style.setProperty('font-size','11px','important');
      field.style.setProperty('line-height','1.65','important');
      if(field.parentElement.querySelector('.auto-video-preview:not(:empty)'))field.style.setProperty('display','none','important');
      else field.style.removeProperty('display');
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
    :is(#characterPopup,#fullCharacterPages,#characterViewRoot) .character-sheet-edit,:is(#characterPopup,#fullCharacterPages,#characterViewRoot) .character-answer{font-size:11px!important;line-height:1.65!important}
    :is(#characterPopup,#fullCharacterPages,#characterViewRoot) .character-sheet-label,:is(#characterPopup,#fullCharacterPages,#characterViewRoot) .character-row-label{font-size:9px!important;line-height:1.5!important}
    #questionPopup .question-popup-answer textarea{font-size:11px!important;line-height:1.65!important}
    #questionPopup .question-popup-answer:has(.auto-video-preview:not(:empty)) textarea{display:none!important}
    :is(#characterPopup,#fullCharacterPages,#characterViewRoot) :is(.character-sheet-value,.character-row-value):has(.auto-video-preview:not(:empty)) textarea{display:none!important}
    :is(#characterPopup,#fullCharacterPages,#characterViewRoot,#questionPopup) .image-part-actions,
    :is(#characterPopup,#fullCharacterPages,#characterViewRoot,#questionPopup) .image-part-caption{display:none!important}
    :is(#characterPopup,#fullCharacterPages) .character-sheet-group:is([data-layout="columns"],[data-layout="free"]):not(:has(.image-part)) .character-sheet-rows{
      display:block!important;column-width:180px;column-count:3;column-gap:18px!important;column-fill:balance;align-content:start!important;align-self:start!important;flex:none!important;height:auto!important;min-height:0!important;
    }
    :is(#characterPopup,#fullCharacterPages) .character-sheet-group:is([data-layout="columns"],[data-layout="free"]):not(:has(.image-part)) .character-sheet-row{
      display:inline-block!important;vertical-align:top;width:100%!important;box-sizing:border-box;break-inside:avoid-column;page-break-inside:avoid;margin:0 0 6px!important;padding:0!important;min-height:0!important;height:auto!important;grid-column:auto!important;
    }
    :is(#characterPopup,#fullCharacterPages) .character-sheet-group:is([data-layout="columns"],[data-layout="free"]):not(:has(.image-part)){display:block!important;align-self:start!important;height:auto!important;min-height:0!important}
    :is(#characterPopup,#fullCharacterPages) .character-sheet-group.sheet-small-group .character-sheet-rows{column-width:160px!important;column-count:2!important}
    @media(max-width:420px){:is(#characterPopup,#fullCharacterPages) .character-sheet-group .character-sheet-rows{column-count:1!important}}
    :is(#characterPopup,#fullCharacterPages,#characterViewRoot) .character-sheet-row:has(.image-mode-character){display:block!important;align-items:start!important}
    :is(#characterPopup,#fullCharacterPages,#characterViewRoot) .character-sheet-row:has(.image-mode-character)>.character-sheet-label{display:block!important;width:100%!important;align-self:start!important;text-align:left!important;margin:0 0 6px!important;padding:0!important}
    :is(#characterPopup,#fullCharacterPages,#characterViewRoot) .character-sheet-row:has(.image-mode-character)>.character-sheet-part{width:100%!important;min-width:0!important}
    .character-sheet-label{color:var(--character-question-text,#8b93a2)!important}
  `;document.head.appendChild(style);
  const observer=new MutationObserver(schedule);
  for(const id of ['characterPopupBody','fullCharacterPages','characterViewRoot']){const root=document.getElementById(id);if(root)observer.observe(root,{childList:true,subtree:true})}
  document.addEventListener('input',event=>{if(event.target.matches('.character-sheet-edit,.character-answer'))schedule()},true);
  window.addEventListener('resize',schedule);
  schedule();
})();
