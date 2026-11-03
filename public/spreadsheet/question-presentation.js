(()=>{
  'use strict';
  document.querySelector('[data-settings-tab="question"]')?.remove();
  document.querySelector('[data-settings-panel="question"]')?.remove();
  let current=null,sequence=0;
  const urls=new Map();
  async function portrait(id){
    const blob=await loadImageBlob('question-portrait',id);
    if(!blob)return '';
    if(urls.has(id))URL.revokeObjectURL(urls.get(id));
    const url=URL.createObjectURL(blob);urls.set(id,url);return url;
  }
  const popup=document.getElementById('questionPopup');
  const select=document.createElement('div');select.id='questionPresentation';select.setAttribute('role','group');select.setAttribute('aria-label','回答の表示方法');
  for(const [mode,label] of [['bubble','吹き出し'],['list','リスト'],['compare','カード']]){
    const button=document.createElement('button');button.type='button';button.dataset.presentation=mode;button.textContent=label;
    button.onclick=()=>{if(!current)return;state.layout.questionPresentations||={};state.layout.questionPresentations[current.key]=mode;saveLayoutState();decorate()};select.appendChild(button);
  }
  popup.querySelector('.modal-head').insertBefore(select,popup.querySelector('.modal-head').lastElementChild);
  async function decorate(){
    if(!current)return;const seq=++sequence;popup.querySelectorAll('.question-portrait').forEach(img=>img.remove());
    const mode=state.layout.questionPresentations?.[current.key]||'bubble';popup.dataset.answerPresentation=mode;select.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.presentation===mode)));
    document.getElementById('questionPopupMeta').hidden=true;
    const images=[];
    for(const row of popup.querySelectorAll('.question-popup-row')){
      const text=row.querySelector('textarea')?.value||row.querySelector('.question-popup-answer')?.textContent||'';
      const units=Math.max(0,...text.split('\n').map(line=>Array.from(line).reduce((n,ch)=>n+(/[ -~]/.test(ch)?.55:1),0)));
      row.style.setProperty('--answer-width',units>75?'100%':Math.max(100,Math.min(900,units*11+70))+'px');

      const id=row.querySelector('[data-popup-char]')?.dataset.popupChar||state.characters[[...row.parentNode.children].indexOf(row)]?.id;
      if(!id||row.querySelector('.question-portrait'))continue;
      if(mode!=='bubble')continue;
      const name=state.characters.find(ch=>ch.id===id)?.name||'';
      const fallback=document.createElement('span');fallback.className='question-portrait question-portrait-fallback';fallback.title=name;fallback.textContent=name.replace(/^HO[0-9０-９]+[-ー:： ]*/i,'').slice(0,2);row.querySelector('.question-popup-answer')?.prepend(fallback);
      images.push(portrait(id).catch(()=> '').then(image=>{
        if(seq!==sequence||!fallback.isConnected||!image)return;
        const img=document.createElement('img');img.className='question-portrait';img.src=image;img.alt=name;img.title=name;fallback.replaceWith(img);
      }));
    }
    // Size every answer once with all portrait slots already present.
    {
      autoGrowQuestionTextareas();
      if(mode==='bubble')for(const field of popup.querySelectorAll('textarea')){
        field.style.setProperty('min-height','0','important');field.style.setProperty('height','0px','important');
        field.style.setProperty('height',Math.max(18,field.scrollHeight)+'px','important');
      }
    }
    await Promise.all(images);
  }
  const raw=window.openQuestionPopup;
  window.openQuestionPopup=function(item,...args){current=item;popup.dataset.answerPresentation=state.layout.questionPresentations?.[item.key]||'bubble';const result=raw.call(this,item,...args);decorate();return result};


  const settings=document.getElementById('characterDesignModal');
  const section=document.createElement('section');section.className='question-portrait-settings';
  section.innerHTML='<b>質問回答用のキャラ画像</b><img alt="登録画像" hidden><input type="file" accept="image/*"><button type="button">画像を削除</button><span role="status"></span>';
  settings.querySelector('.modal-body').appendChild(section);
  async function preview(){const id=characterDesignEditingId;if(!id)return;const url=await portrait(id).catch(()=> '');if(id!==characterDesignEditingId)return;const img=section.querySelector('img');img.hidden=!url;img.src=url}
  const rawDesign=window.openCharacterDesign;
  window.openCharacterDesign=function(...args){const result=rawDesign.apply(this,args);preview();return result};
  document.getElementById('characterDesignBtn').onclick=window.openCharacterDesign;
  section.querySelector('input').onchange=async event=>{
    const file=event.target.files?.[0],id=characterDesignEditingId;if(!file||!id)return;
    const status=section.querySelector('[role="status"]');status.textContent='保存中…';
    try{await saveImageBlob('question-portrait',id,file);await preview();status.textContent='保存しました';if(current)decorate()}
    catch{status.textContent='保存できませんでした。もう一度お試しください'}finally{event.target.value=''}
  };
  section.querySelector('button').onclick=async()=>{try{await deleteImageBlob('question-portrait',characterDesignEditingId);await preview();if(current)decorate();section.querySelector('[role="status"]').textContent='削除しました'}catch{section.querySelector('[role="status"]').textContent='削除できませんでした'}};
  const style=document.createElement('style');style.textContent="\n    #questionPopup .modal{width:min(560px,calc(100vw - 28px))!important;max-width:560px!important;height:min(560px,calc(100dvh - 32px))!important;max-height:calc(100dvh - 32px)!important;display:flex!important;flex-direction:column!important;border:1px solid #eadfec!important;border-radius:18px!important;background:#fff;box-shadow:0 15px 42px #5d3c6626;overflow:hidden!important}\n    #questionPopup .modal-head{flex:0 0 auto!important;min-height:48px;gap:8px;padding:9px 12px!important;border-bottom:1px solid #f0e7f2;background:#fdf9fe;align-items:center!important}\n    #questionPopupTitle{font-size:12px!important;color:#817085;overflow-wrap:anywhere}\n    #questionPopup .modal-body{flex:1 1 auto;min-height:0;overflow:auto;padding:0!important;scrollbar-gutter:stable}\n    #questionPopup #questionPopupAnswers{min-height:0;overflow:visible!important}\n    #questionPopupMeta{display:none!important}\n    #questionPresentation{display:flex;flex-wrap:wrap;gap:3px;margin-left:auto;margin-right:5px;flex-shrink:0}\n    #questionPresentation button{font-size:10px;padding:6px 8px;border:0;border-radius:9px;background:transparent;color:#a091a3;cursor:pointer}\n    #questionPresentation button[aria-pressed=\"true\"]{background:color-mix(in srgb,var(--question-accent) 10%,white);color:var(--question-accent);font-weight:650}\n    #questionPopup .modal-head>.icon-btn{border-color:#eee4f0;border-radius:9px;color:#a091a3}\n    #questionPopup .question-portrait{display:block;flex:0 0 28px;width:28px;height:28px;object-fit:cover;border-radius:50%;margin:0}\n    #questionPopup:not([data-answer-presentation=\"bubble\"]) .question-portrait{display:none!important}\n    #questionPopup .question-portrait-fallback{display:grid;place-items:center;background:#f4eff6;color:#96849f;font:9px/1.2 system-ui}\n    #questionPopup[data-answer-presentation=\"bubble\"] #questionPopupAnswers{display:flex!important;flex-wrap:wrap!important;align-content:flex-start;align-items:flex-start;gap:9px;padding:12px!important}\n    #questionPopup[data-answer-presentation=\"bubble\"] .question-popup-row{display:flex!important;flex:0 1 var(--answer-width,180px)!important;min-width:0!important;max-width:100%!important;min-height:0!important;height:auto!important;gap:0;padding:0!important;margin:0!important;border:0!important;background:transparent!important;align-self:flex-start!important;box-sizing:border-box}\n    #questionPopup[data-answer-presentation=\"bubble\"] .question-popup-name{display:none!important}\n    #questionPopup[data-answer-presentation=\"bubble\"] .question-popup-answer{display:flex!important;align-items:center!important;gap:8px;flex:1;min-width:0!important;max-width:100%;min-height:42px!important;height:auto!important;padding:7px 10px!important;border:1px solid color-mix(in srgb,var(--question-accent) 30%,#eee4f0)!important;border-radius:15px!important;background:#fff!important;box-sizing:border-box;align-self:flex-start!important;box-shadow:none!important}\n    #questionPopup[data-answer-presentation] .question-popup-answer textarea{font-size:11px!important;line-height:1.65!important}\n    #questionPopup[data-answer-presentation=\"bubble\"] .question-popup-answer textarea{flex:1!important;width:0!important;min-width:0!important;min-height:0!important;max-height:none!important;margin:0!important;padding:0!important;background:transparent!important;border:0!important;border-radius:0!important;box-shadow:none!important;resize:none!important;overflow:hidden!important}\n    #questionPopup[data-answer-presentation=\"compare\"] #questionPopupAnswers{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;padding:12px}\n    #questionPopup[data-answer-presentation=\"compare\"] .question-popup-row{display:flex!important;flex-direction:column!important;min-width:0;padding:10px!important;border:1px solid #eee4f0!important;border-radius:13px!important;background:#fdfafe!important}\n    #questionPopup:not([data-answer-presentation=\"bubble\"]) .question-popup-name{font-size:9px!important;line-height:1.5!important}\n    #questionPopup[data-answer-presentation=\"compare\"] .question-popup-name{border:0!important;padding:4px!important;background:transparent!important}\n    #questionPopup .question-popup-answer:has(.auto-video-preview:not(:empty)) textarea{display:none!important}\n    .question-portrait-settings{display:grid;gap:10px;margin-top:16px;padding:12px;border-top:1px solid #e6e8ed}.question-portrait-settings img{width:80px;height:80px;object-fit:cover;border-radius:50%}\n    @media(max-width:400px){#questionPresentation{gap:0;margin-right:0}#questionPresentation button{font-size:9px;padding:6px}#questionPopup[data-answer-presentation=\"compare\"] #questionPopupAnswers{grid-template-columns:1fr}}\n";document.head.appendChild(style);
})();
