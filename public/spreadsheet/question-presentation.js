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
  const select=document.createElement('select');select.id='questionPresentation';select.setAttribute('aria-label','回答の表示方法');
  select.innerHTML='<option value="list">リスト</option><option value="bubble">吹き出し</option><option value="compare">コンパクト比較</option>';
  popup.querySelector('.modal-head').insertBefore(select,popup.querySelector('.modal-head').lastElementChild);
  async function decorate(){
    if(!current)return;const seq=++sequence;popup.querySelectorAll('.question-portrait').forEach(img=>img.remove());
    const mode=state.layout.questionPresentations?.[current.key]||'list';select.value=mode;popup.dataset.answerPresentation=mode;
    for(const row of popup.querySelectorAll('.question-popup-row')){
      const id=row.querySelector('[data-popup-char]')?.dataset.popupChar||state.characters[[...row.parentNode.children].indexOf(row)]?.id;
      if(!id||row.querySelector('.question-portrait'))continue;
      const image=await portrait(id).catch(()=> '');if(seq!==sequence)return;
      if(image){const img=document.createElement('img');img.className='question-portrait';img.src=image;img.alt='';row.querySelector('.question-popup-name')?.prepend(img)}
    }
    requestAnimationFrame(()=>autoGrowQuestionTextareas());
  }
  const raw=window.openQuestionPopup;
  window.openQuestionPopup=function(item,...args){current=item;const result=raw.call(this,item,...args);decorate();return result};
  select.onchange=()=>{if(!current)return;state.layout.questionPresentations||={};state.layout.questionPresentations[current.key]=select.value;saveLayoutState();decorate()};

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
    #questionPresentation{margin-left:auto;margin-right:12px;max-width:170px;font-size:12px;border:1px solid #e2e5eb;border-radius:8px;padding:6px;background:#fff}
    .question-portrait{width:48px;height:48px;object-fit:cover;border-radius:50%;flex-shrink:0;margin-right:10px}
    .question-popup-name:has(.question-portrait){display:flex!important;align-items:center}
    #questionPopup[data-answer-presentation="bubble"] .question-popup-row{display:grid!important;grid-template-columns:minmax(100px,170px) minmax(0,1fr)!important;gap:12px;padding:12px!important;border:0!important}
    #questionPopup[data-answer-presentation="bubble"] .question-popup-answer{background:color-mix(in srgb,var(--question-accent) 8%,white);border-radius:16px;padding:9px 12px;min-width:0}
    #questionPopup[data-answer-presentation="compare"] #questionPopupAnswers{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(min(230px,100%),1fr));gap:8px;padding:10px}
    #questionPopup[data-answer-presentation="compare"] .question-popup-row{display:flex!important;flex-direction:column!important;border:1px solid #e6e8ed!important;border-radius:8px;min-width:0;padding:8px!important}
    #questionPopup[data-answer-presentation="compare"] .question-popup-name{border:0!important;padding:4px!important;font-size:11px!important}
    #questionPopup[data-answer-presentation="compare"] .question-portrait{width:32px;height:32px}
    .question-portrait-settings{display:grid;gap:10px;margin-top:16px;padding:12px;border-top:1px solid #e6e8ed}.question-portrait-settings img{width:80px;height:80px;object-fit:cover;border-radius:50%}
    @media(max-width:600px){#questionPopup[data-answer-presentation="bubble"] .question-popup-row{grid-template-columns:1fr!important}}
  `;document.head.appendChild(style);
})();
