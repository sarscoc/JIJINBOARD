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

  let timer=0,loading=true;
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

  // Keep the existing board-scoped localStorage wrapper, then observe only the
  // three spreadsheet state keys. During initial remote application, writes are
  // deliberately not echoed back to the server.
  const rawSetItem=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,value){
    const result=rawSetItem.call(this,key,value);
    if(this===localStorage&&keys.includes(String(key)))push();
    return result;
  };

  function applyRemoteToLiveState(remote){
    keys.forEach(k=>localStorage.setItem(k,JSON.stringify(remote?.[k]??emptyFor(k))));

    // index.html already created its in-memory state before this sync helper
    // runs. Replace that one live state instead of reloading the whole iframe.
    if(typeof state!=='undefined'&&state){
      state.characters=Array.isArray(remote?.['charaHub.characters'])?remote['charaHub.characters']:[];
      state.sources=Array.isArray(remote?.['charaHub.sources'])?remote['charaHub.sources']:[];
      const layout=remote?.['charaHub.layoutV1'];
      state.layout=layout&&typeof layout==='object'&&!Array.isArray(layout)?layout:{};

      // Re-run the same normalizers the monolithic spreadsheet uses at startup,
      // while `loading` is still true so migration saves cannot create a loop.
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

  // Avoid showing the already-rendered local snapshot while the authoritative
  // shared board state is being fetched. This prevents the apparent double-page
  // flash even on a slow first load.
  const embedded=new URL(location.href).searchParams.get('embedded')==='1';
  if(embedded)document.documentElement.style.visibility='hidden';

  (async()=>{
    let remote=null;
    try{
      remote=(await api(endpoint)).state;
      const local=read();

      if(remote&&meaningful(remote)){
        if(JSON.stringify(local)!==JSON.stringify(remote))applyRemoteToLiveState(remote);
      }else if(meaningful(local)){
        // First board save: keep the user's existing spreadsheet as the source.
        await api(endpoint,{method:'POST',body:JSON.stringify({state:local})});
      }
    }catch(error){
      console.warn('Spreadsheet initial sync failed',error);
    }finally{
      loading=false;
      if(embedded)document.documentElement.style.visibility='';
    }

    // Startup normalizers can legitimately add defaults to the remote state.
    // Persist that canonicalized state once, without ever reloading the page.
    if(remote&&meaningful(remote)&&JSON.stringify(read())!==JSON.stringify(remote)){
      pushNow();
    }
  })();
})();
