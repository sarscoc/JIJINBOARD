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
    for(const row of popup.querySelectorAll('.question-popup-row')){
      const text=row.querySelector('textarea')?.value||row.querySelector('.question-popup-answer')?.textContent||'';
      const units=Math.max(0,...text.split('\n').map(line=>Array.from(line).reduce((n,ch)=>n+(/[ -~]/.test(ch)?.55:1),0)));
      row.style.setProperty('--answer-width',units>75?'100%':Math.max(100,Math.min(900,units*11+70))+'px');

      const id=row.querySelector('[data-popup-char]')?.dataset.popupChar||state.characters[[...row.parentNode.children].indexOf(row)]?.id;
      if(!id||row.querySelector('.question-portrait'))continue;
      if(mode!=='bubble')continue;
      const name=state.characters.find(ch=>ch.id===id)?.name||'';
      const fallback=document.createElement('span');fallback.className='question-portrait question-portrait-fallback';fallback.title=name;fallback.textContent=name.replace(/^HO[0-9０-９]+[-ー:： ]*/i,'').slice(0,2);row.querySelector('.question-popup-answer')?.prepend(fallback);
      const image=await portrait(id).catch(()=> '');if(seq!==sequence)return;
      if(image){const img=document.createElement('img');img.className='question-portrait';img.src=image;img.alt=name;img.title=name;fallback.replaceWith(img)}
    }
    requestAnimationFrame(()=>{
      autoGrowQuestionTextareas();
      if(mode==='bubble')for(const field of popup.querySelectorAll('textarea')){
        field.style.setProperty('min-height','0','important');field.style.setProperty('height','0px','important');
        field.style.setProperty('height',Math.max(18,field.scrollHeight)+'px','important');
      }
    });
  }
  const raw=window.openQuestionPopup;
  window.openQuestionPopup=function(item,...args){current=item;const result=raw.call(this,item,...args);decorate();return result};


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
  const style=document.createElement('style');style.textContent=`
    #questionPopup:not([data-answer-presentation="bubble"]) .question-portrait{display:none!important}
    #questionPopupMeta{display:none!important}
    #questionPresentation{display:flex;flex-wrap:wrap;gap:4px;margin-left:auto;margin-right:12px}
    #questionPresentation button{font-size:11px;padding:6px 9px;border:0;border-radius:7px;background:transparent;color:#89909c;cursor:pointer}
    #questionPresentation button[aria-pressed="true"]{background:color-mix(in srgb,var(--question-accent) 12%,white);color:var(--question-accent);font-weight:700}
    .question-portrait{width:48px;height:48px;object-fit:cover;border-radius:50%;flex-shrink:0;margin-right:10px}
    .question-popup-name:has(.question-portrait){display:flex!important;align-items:center}
    #questionPopup[data-answer-presentation="bubble"] #questionPopupAnswers{display:flex!important;flex-wrap:wrap!important;align-items:flex-start;gap:10px 12px;padding:12px!important}
    #questionPopup[data-answer-presentation="bubble"] .question-popup-row{display:flex!important;align-items:flex-start!important;flex:1 1 var(--answer-width,220px)!important;max-width:100%!important;min-width:0!important;gap:7px;padding:0!important;border:0!important;box-sizing:border-box}
    #questionPopup[data-answer-presentation="bubble"] .question-popup-name{display:flex!important;flex-direction:column!important;align-items:center!important;flex:0 0 48px!important;width:48px!important;min-width:0!important;max-width:48px!important;font-size:8px!important;line-height:1.3!important;overflow-wrap:anywhere;border:0!important;padding:0!important}
    #questionPopup[data-answer-presentation="bubble"] .question-portrait{width:36px;height:36px;margin:0 0 3px}
    #questionPopup[data-answer-presentation="bubble"] .question-popup-answer{flex:1;min-width:0!important;max-width:100%;background:color-mix(in srgb,var(--question-accent) 8%,white);border-radius:13px;padding:5px 9px!important;box-sizing:border-box}
    #questionPopup[data-answer-presentation="bubble"] textarea{font-size:11px!important;line-height:1.65!important;min-height:20px!important;overflow:hidden!important;padding:0!important;max-height:none!important;box-sizing:border-box}
    #questionPopup[data-answer-presentation="compare"] #questionPopupAnswers{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(min(180px,100%),1fr));gap:8px;padding:10px}
    #questionPopup[data-answer-presentation="compare"] .question-popup-row{display:flex!important;flex-direction:column!important;border:1px solid #e6e8ed!important;border-radius:8px;min-width:0;padding:8px!important}
    #questionPopup[data-answer-presentation="compare"] .question-popup-name{border:0!important;padding:4px!important;font-size:11px!important}
    #questionPopup[data-answer-presentation="compare"] .question-portrait{width:32px;height:32px}
    #questionPopup[data-answer-presentation="bubble"] .question-popup-row{flex:0 1 var(--answer-width,180px)!important;background:transparent!important;box-shadow:none!important;min-height:0!important;height:auto!important;margin:0!important;align-self:flex-start!important}
    #questionPopup[data-answer-presentation="bubble"] .question-popup-name{font-size:0!important;line-height:0!important;height:auto!important;min-height:0!important;background:transparent!important;box-shadow:none!important}
    #questionPopup[data-answer-presentation="bubble"] .question-popup-name:not(:has(img)){display:none!important}
    #questionPopup[data-answer-presentation="bubble"] .question-portrait{margin:0!important;width:36px;height:36px}
    #questionPopup[data-answer-presentation="bubble"] .question-popup-answer{background:transparent!important;border:1px solid color-mix(in srgb,var(--question-accent) 45%,#e5e7eb)!important;border-radius:999px!important;padding:7px 14px!important;min-height:0!important;height:auto!important;box-shadow:none!important;align-self:flex-start!important}
    #questionPopup[data-answer-presentation="bubble"] .question-popup-answer textarea{background:transparent!important;border:0!important;box-shadow:none!important;border-radius:0!important;padding:0!important;margin:0!important;min-height:0!important;resize:none!important;overflow:hidden!important}
    #questionPopup[data-answer-presentation="compare"] .question-popup-row{background:#fff!important;box-shadow:0 1px 3px #00000008;padding:12px!important;border-radius:12px!important}
    #questionPopup[data-answer-presentation] .question-popup-answer textarea{font-size:11px!important;line-height:1.65!important}
    #questionPopup:not([data-answer-presentation="bubble"]) .question-popup-name{font-size:9px!important;line-height:1.5!important}
    #questionPopup .question-popup-answer:has(.auto-video-preview:not(:empty)) textarea{display:none!important}
    #questionPopup[data-answer-presentation="bubble"] .question-popup-name{display:none!important}
    #questionPopup[data-answer-presentation="bubble"] .question-popup-answer{display:flex!important;align-items:center!important;gap:8px;padding:6px 10px!important}
    #questionPopup[data-answer-presentation="bubble"] .question-popup-answer textarea{flex:1!important;width:0!important;min-width:0!important}
    #questionPopup[data-answer-presentation="bubble"] .question-portrait{flex:0 0 28px;width:28px;height:28px;margin:0!important}
    .question-portrait-fallback{display:grid;place-items:center;background:#eef0f3;color:#69717c;font:9px/1.2 system-ui;border-radius:50%}
    .question-portrait-settings{display:grid;gap:10px;margin-top:16px;padding:12px;border-top:1px solid #e6e8ed}.question-portrait-settings img{width:80px;height:80px;object-fit:cover;border-radius:50%}
    @media(max-width:600px){#questionPopup[data-answer-presentation="bubble"] .question-popup-row{grid-template-columns:1fr!important}}
  `;document.head.appendChild(style);
})();
