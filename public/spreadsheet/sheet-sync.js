(()=>{
  const pageParams=new URL(location.href).searchParams;
  const board=pageParams.get('board');if(!board)return;
  const embedded=pageParams.get('embedded')==='1';
  let boardActive=!embedded;

  const keys=['charaHub.characters','charaHub.sources','charaHub.layoutV1'];
  const emptyFor=k=>k==='charaHub.layoutV1'?{}:[];
  const api=async(path,options={})=>{const r=await fetch(path,{headers:{'content-type':'application/json',...(options.headers||{})},...options}),d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'同期に失敗しました');return d};
  const parse=(key,value)=>{try{return JSON.parse(value??'')}catch{return emptyFor(key)}};
  const read=()=>Object.fromEntries(keys.map(k=>[k,parse(k,localStorage.getItem(k)??JSON.stringify(emptyFor(k)))]));
  const meaningful=s=>(s?.['charaHub.characters']||[]).length||(s?.['charaHub.sources']||[]).length||(s?.['charaHub.layoutV1']?.localItems||[]).length||(s?.['charaHub.layoutV1']?.parts||[]).length||(s?.['charaHub.layoutV1']?.groups||[]).length;
  const endpoint=`/api/boards/${encodeURIComponent(board)}/spreadsheet/state`;

  const autoKeys=new Set(['id','projectPersonId','name','alias','key','base','sources','local']);
  const isAutoProjectCharacter=ch=>!!ch&&ch.local===true&&ch.base==null&&Array.isArray(ch.sources)&&ch.sources.length===0&&!String(ch.alias||'').trim()&&!!ch.projectPersonId&&ch.id===ch.projectPersonId&&Object.keys(ch).every(k=>autoKeys.has(k));
  function sanitizeSnapshot(input){
    const out={...input};
    const chars=Array.isArray(input?.['charaHub.characters'])?input['charaHub.characters']:[];
    const removed=new Set(chars.filter(isAutoProjectCharacter).map(ch=>ch.id));
    out['charaHub.characters']=chars.filter(ch=>!removed.has(ch.id));
    const sources=Array.isArray(input?.['charaHub.sources'])?input['charaHub.sources']:[];
    out['charaHub.sources']=sources.map(src=>{
      if(!removed.size||!src||typeof src!=='object')return src;
      const next={...src};
      if(src.mapping&&typeof src.mapping==='object'){
        next.mapping={...src.mapping};
        Object.keys(next.mapping).forEach(k=>{if(removed.has(next.mapping[k]))delete next.mapping[k]});
      }
      return next;
    });
    out['charaHub.layoutV1']=input?.['charaHub.layoutV1']??{};
    return out;
  }

  let timer=0,loading=true,readySent=false,itemCache=null,applyingRemote=false,refreshPromise=null,lastRemoteSerial='',remoteDirty=false;
  let lastCharacterIds=new Set((sanitizeSnapshot(read())['charaHub.characters']||[]).map(ch=>ch.id));
  const invalidateItemCache=()=>{itemCache=null};

  function installItemCache(){
    try{
      if(typeof collectUnifiedItems!=='function'||collectUnifiedItems.__jijinCached)return;
      const base=collectUnifiedItems;
      const wrapped=function(){if(itemCache)return itemCache;itemCache=base();return itemCache};
      wrapped.__jijinCached=true;wrapped.__jijinBase=base;collectUnifiedItems=wrapped;
    }catch(error){console.warn('Spreadsheet item cache install failed',error)}
  }

  function installRenderGuards(){
    if(!embedded)return;
    try{
      if(typeof renderQuestionView==='function'&&!renderQuestionView.__jijinGuarded){const base=renderQuestionView;const guarded=function(...args){if(state?.currentView==='question')return base(...args)};guarded.__jijinGuarded=true;renderQuestionView=guarded}
      if(typeof renderCharacterView==='function'&&!renderCharacterView.__jijinGuarded){const base=renderCharacterView;const guarded=function(...args){if(state?.currentView==='character')return base(...args)};guarded.__jijinGuarded=true;renderCharacterView=guarded}
      if(typeof renderDataTable==='function'&&!renderDataTable.__jijinGuarded){const base=renderDataTable;const guarded=function(...args){if(state?.layout?.mainMode==='characters'&&document.getElementById('databaseLayout')?.classList.contains('hidden'))return;return base(...args)};guarded.__jijinGuarded=true;renderDataTable=guarded}
    }catch(error){console.warn('Spreadsheet render guard install failed',error)}
  }

  installItemCache();installRenderGuards();

  const currentSnapshot=()=>sanitizeSnapshot(read());
  const currentSerial=()=>JSON.stringify(currentSnapshot());

  const pushNow=async()=>{
    if(loading||applyingRemote)return;
    clearTimeout(timer);timer=0;
    const snapshot=currentSnapshot(),serial=JSON.stringify(snapshot);
    if(serial===lastRemoteSerial)return;
    try{
      await api(endpoint,{method:'POST',body:JSON.stringify({state:snapshot})});
      lastRemoteSerial=serial;
      window.jijinSpreadsheetNotifyChange?.('spreadsheet-state');
    }catch(error){console.warn('Spreadsheet sync save failed',error)}
  };
  const push=()=>{if(loading||applyingRemote)return;clearTimeout(timer);timer=setTimeout(pushNow,1100)};
  const rawSetItem=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,value){
    const name=String(key),tracked=this===localStorage&&keys.includes(name);
    const before=tracked?localStorage.getItem(name):null;
    const result=rawSetItem.call(this,key,value);
    if(!tracked||applyingRemote||before===String(value))return result;
    invalidateItemCache();
    if(name==='charaHub.characters'){
      const parsed=parse(name,value),next=Array.isArray(parsed)?parsed:[],nextIds=new Set(next.map(ch=>ch?.id).filter(Boolean));
      const deleted=[...lastCharacterIds].some(id=>!nextIds.has(id));
      lastCharacterIds=nextIds;
      if(deleted){queueMicrotask(pushNow);return result}
    }
    push();
    return result;
  };

  function applyRemote(remote){
    const clean=sanitizeSnapshot(remote||{}),serial=JSON.stringify(clean);
    applyingRemote=true;
    try{
      invalidateItemCache();
      keys.forEach(k=>localStorage.setItem(k,JSON.stringify(clean?.[k]??emptyFor(k))));
      if(typeof state!=='undefined'&&state){
        state.characters=Array.isArray(clean['charaHub.characters'])?clean['charaHub.characters']:[];
        state.sources=Array.isArray(clean['charaHub.sources'])?clean['charaHub.sources']:[];
        const layout=clean['charaHub.layoutV1'];
        state.layout=layout&&typeof layout==='object'&&!Array.isArray(layout)?layout:{};
        lastCharacterIds=new Set(state.characters.map(ch=>ch.id));
        try{if(typeof ensureLayoutShape==='function')ensureLayoutShape()}catch(error){console.warn(error)}
        try{if(typeof migrateCharacters==='function')migrateCharacters()}catch(error){console.warn(error)}
        try{if(typeof setMainView==='function')setMainView();else if(typeof renderDataTable==='function')renderDataTable()}catch(error){console.warn(error)}
      }
      lastRemoteSerial=serial;
    }finally{applyingRemote=false}
    return clean;
  }

  async function refreshRemote(){
    if(loading||!boardActive)return;
    if(refreshPromise)return refreshPromise;
    const task=(async()=>{
      try{
        const remote=(await api(endpoint)).state;
        if(!remote){remoteDirty=false;return}
        const clean=sanitizeSnapshot(remote),serial=JSON.stringify(clean);
        if(serial!==currentSerial())applyRemote(clean);else lastRemoteSerial=serial;
        remoteDirty=false;
      }catch(error){console.warn('Spreadsheet remote refresh failed',error)}
    })();
    refreshPromise=task;
    try{return await task}finally{if(refreshPromise===task)refreshPromise=null}
  }

  const characterManageButton=document.getElementById('characterManageBtn');
  if(characterManageButton){characterManageButton.onclick=()=>{try{if(typeof openModalById==='function')openModalById('characterManageModal');else document.getElementById('characterManageModal')?.classList.add('show')}catch(error){console.warn('Character manager open failed',error)}try{if(typeof renderCharacters==='function')renderCharacters()}catch(error){console.warn('Character manager render failed',error)}}}

  const fitCharacterField=el=>{
    if(!el||!boardActive||loading)return;
    el.setAttribute('wrap','soft');
    el.style.setProperty('white-space','pre-wrap','important');el.style.setProperty('overflow-wrap','anywhere','important');el.style.setProperty('word-break','break-word','important');el.style.setProperty('overflow-x','hidden','important');el.style.setProperty('overflow-y','hidden','important');el.style.setProperty('min-height','0','important');
    const row=el.closest('.character-sheet-row');if(row){row.style.setProperty('min-height','0','important');row.style.setProperty('height','auto','important');if(row.classList.contains('long'))row.style.setProperty('margin-top','0','important')}
    const cs=getComputedStyle(el),fontSize=parseFloat(cs.fontSize)||10,lineHeight=parseFloat(cs.lineHeight)||fontSize*1.4,paddingY=(parseFloat(cs.paddingTop)||0)+(parseFloat(cs.paddingBottom)||0),borderY=(parseFloat(cs.borderTopWidth)||0)+(parseFloat(cs.borderBottomWidth)||0);
    el.style.setProperty('height','0px','important');const oneLine=lineHeight+paddingY+borderY,contentHeight=el.scrollHeight+borderY;el.style.setProperty('height',`${Math.ceil(Math.max(oneLine,contentHeight))}px`,'important');
  };

  const characterFitNeeded=()=>{if(!boardActive||loading)return false;if(state?.layout?.mainMode==='characters')return true;return !!document.querySelector('.character-popup.show,.character-popup[open],#characterPopup.show')};
  let characterFitRaf=0,characterFitObserver=null;
  const fullCharacterRoot=document.getElementById('fullCharacterMode');
  const fitCharacterFields=()=>{if(!characterFitNeeded()||characterFitRaf)return;characterFitRaf=requestAnimationFrame(()=>{characterFitRaf=0;if(!characterFitNeeded())return;document.querySelectorAll('#fullCharacterMode .character-sheet-edit,.connected-character-page .character-sheet-edit,.character-popup .character-sheet-edit').forEach(fitCharacterField)})};
  function syncFitObserver(){if(characterFitObserver){characterFitObserver.disconnect();characterFitObserver=null}if(!characterFitNeeded()||!fullCharacterRoot||!window.MutationObserver)return;characterFitObserver=new MutationObserver(fitCharacterFields);characterFitObserver.observe(fullCharacterRoot,{childList:true,subtree:true})}
  function setBoardActive(next){boardActive=!!next;if(!boardActive){if(characterFitRaf){cancelAnimationFrame(characterFitRaf);characterFitRaf=0}syncFitObserver();return}syncFitObserver();fitCharacterFields();if(remoteDirty)refreshRemote()}
  document.addEventListener('input',event=>{if(boardActive&&event.target?.matches?.('.character-sheet-edit'))fitCharacterField(event.target)},true);
  document.addEventListener('click',event=>{if(event.target?.closest?.('#mainCharacterModeBtn,#mainDatabaseModeBtn'))setTimeout(()=>{syncFitObserver();fitCharacterFields()},0)},true);
  window.addEventListener('resize',()=>{if(characterFitNeeded())fitCharacterFields()},{passive:true});
  window.addEventListener('message',event=>{if(event.origin!==location.origin)return;if(event.data?.type==='jijinboard-spreadsheet-active')setBoardActive(event.data.active)});
  window.addEventListener('jijinboard-spreadsheet-remote-change',event=>{if(event.detail?.action!=='spreadsheet-state')return;remoteDirty=true;if(boardActive)refreshRemote()});

  function notifyReady(){if(readySent)return;readySent=true;requestAnimationFrame(()=>requestAnimationFrame(()=>{try{parent.postMessage({type:'jijinboard-spreadsheet-ready'},location.origin)}catch{}}))}
  function finishLocalReady(){loading=false;remoteDirty=false;syncFitObserver();if(characterFitNeeded())fitCharacterFields();notifyReady()}

  async function initialRemoteSync(){
    let remote=null,cleanRemote=null,remoteString='';
    try{
      remote=(await api(endpoint)).state;
      cleanRemote=sanitizeSnapshot(remote||{});remoteString=JSON.stringify(cleanRemote);
      const local=currentSnapshot(),localString=JSON.stringify(local),hasLocal=!!meaningful(local);
      if(remote&&meaningful(cleanRemote)){
        if(remoteString!==localString)applyRemote(cleanRemote);else lastRemoteSerial=remoteString;
      }else if(hasLocal){
        await api(endpoint,{method:'POST',body:JSON.stringify({state:local})});
        lastRemoteSerial=localString;
        window.jijinSpreadsheetNotifyChange?.('spreadsheet-state');
      }
    }catch(error){console.warn('Spreadsheet initial sync failed',error)}finally{
      if(loading)finishLocalReady();
    }
    if(remote&&remoteString&&JSON.stringify(remote)!==remoteString)pushNow();
  }

  const localAtStart=currentSnapshot(),hasLocalAtStart=!!meaningful(localAtStart);
  if(embedded&&hasLocalAtStart){
    finishLocalReady();
    const run=()=>initialRemoteSync();
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      if(typeof requestIdleCallback==='function')requestIdleCallback(run,{timeout:900});
      else setTimeout(run,250);
    }));
  }else{
    initialRemoteSync();
  }
})();
