(()=>{
  const board=new URL(location.href).searchParams.get('board');if(!board)return;

  const keys=['charaHub.characters','charaHub.sources','charaHub.layoutV1'];
  const emptyFor=k=>k==='charaHub.layoutV1'?{}:[];
  const api=async(path,options={})=>{
    const r=await fetch(path,{headers:{'content-type':'application/json'},...options});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw Error(d.error||'同期に失敗しました');
    return d;
  };
  const parse=(key,value)=>{
    try{return JSON.parse(value??'')}
    catch{return emptyFor(key)}
  };
  const read=()=>Object.fromEntries(keys.map(k=>[
    k,
    parse(k,localStorage.getItem(k)??JSON.stringify(emptyFor(k)))
  ]));
  const meaningful=s=>(s?.['charaHub.characters']||[]).length||
    (s?.['charaHub.sources']||[]).length||
    (s?.['charaHub.layoutV1']?.localItems||[]).length||
    (s?.['charaHub.layoutV1']?.parts||[]).length||
    (s?.['charaHub.layoutV1']?.groups||[]).length;

  let timer=0,loading=true,readySent=false;
  const endpoint=`/api/boards/${encodeURIComponent(board)}/spreadsheet/state`;
  const pushNow=async()=>{
    if(loading)return;
    clearTimeout(timer);
    timer=0;
    try{await api(endpoint,{method:'POST',body:JSON.stringify({state:read()})})}
    catch(error){console.warn('Spreadsheet sync save failed',error)}
  };
  const push=()=>{
    if(loading)return;
    clearTimeout(timer);
    timer=setTimeout(pushNow,700);
  };

  const rawSetItem=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,value){
    const result=rawSetItem.call(this,key,value);
    if(this===localStorage&&keys.includes(String(key)))push();
    return result;
  };

  function applyRemoteToLiveState(remote){
    keys.forEach(k=>localStorage.setItem(k,JSON.stringify(remote?.[k]??emptyFor(k))));

    if(typeof state!=='undefined'&&state){
      state.characters=Array.isArray(remote?.['charaHub.characters'])?remote['charaHub.characters']:[];
      state.sources=Array.isArray(remote?.['charaHub.sources'])?remote['charaHub.sources']:[];
      const layout=remote?.['charaHub.layoutV1'];
      state.layout=layout&&typeof layout==='object'&&!Array.isArray(layout)?layout:{};

      try{if(typeof ensureLayoutShape==='function')ensureLayoutShape()}catch(error){console.warn(error)}
      try{if(typeof migrateCharacters==='function')migrateCharacters()}catch(error){console.warn(error)}

      try{if(typeof renderCharacters==='function')renderCharacters()}catch(error){console.warn(error)}
      try{if(typeof renderSources==='function')renderSources()}catch(error){console.warn(error)}
      try{if(typeof renderQuestionView==='function')renderQuestionView()}catch(error){console.warn(error)}
      try{if(typeof renderCharacterView==='function')renderCharacterView()}catch(error){console.warn(error)}
      try{
        if(typeof setMainView==='function')setMainView();
        else if(typeof renderDataTable==='function')renderDataTable();
      }catch(error){console.warn(error)}
    }
  }

  // BOARD keeps the spreadsheet iframe visually hidden until BOTH the shared
  // state and COMMENTS/mode UI are ready. Two animation frames are allowed for
  // sticky headers, auto-height fields and grid geometry to settle before reveal.
  function maybeReady(){
    if(readySent||!window.__jijinboardSpreadsheetSyncReady||!window.__jijinboardSheetCommentsReady)return;
    readySent=true;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      try{parent.postMessage({type:'jijinboard-spreadsheet-ready'},location.origin)}catch{}
    }));
  }
  window.__jijinboardMaybeSpreadsheetReady=maybeReady;
  window.addEventListener('jijinboard-sheet-comments-ready',maybeReady);

  (async()=>{
    let remote=null;
    try{
      remote=(await api(endpoint)).state;
      const local=read();

      if(remote&&meaningful(remote)){
        if(JSON.stringify(local)!==JSON.stringify(remote))applyRemoteToLiveState(remote);
      }else if(meaningful(local)){
        await api(endpoint,{method:'POST',body:JSON.stringify({state:local})});
      }
    }catch(error){
      console.warn('Spreadsheet initial sync failed',error);
    }finally{
      loading=false;
      window.__jijinboardSpreadsheetSyncReady=true;
      maybeReady();
    }

    if(remote&&meaningful(remote)&&JSON.stringify(read())!==JSON.stringify(remote)){
      pushNow();
    }
  })();
})();
