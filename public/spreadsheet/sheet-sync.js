(()=>{
  const board=new URL(location.href).searchParams.get('board');if(!board)return;

  const keys=['charaHub.characters','charaHub.sources','charaHub.layoutV1'];
  const emptyFor=k=>k==='charaHub.layoutV1'?{}:[];
  const api=async(path,options={})=>{const r=await fetch(path,{headers:{'content-type':'application/json'},...options}),d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'同期に失敗しました');return d};
  const parse=(key,value)=>{try{return JSON.parse(value??'')}catch{return emptyFor(key)}};
  const read=()=>Object.fromEntries(keys.map(k=>[k,parse(k,localStorage.getItem(k)??JSON.stringify(emptyFor(k)))]));
  const meaningful=s=>(s?.['charaHub.characters']||[]).length||(s?.['charaHub.sources']||[]).length||(s?.['charaHub.layoutV1']?.localItems||[]).length||(s?.['charaHub.layoutV1']?.parts||[]).length||(s?.['charaHub.layoutV1']?.groups||[]).length;
  const endpoint=`/api/boards/${encodeURIComponent(board)}/spreadsheet/state`;

  let timer=0,loading=true;
  const pushNow=async()=>{if(loading)return;clearTimeout(timer);timer=0;try{await api(endpoint,{method:'POST',body:JSON.stringify({state:read()})})}catch(error){console.warn('Spreadsheet sync save failed',error)}};
  const push=()=>{if(loading)return;clearTimeout(timer);timer=setTimeout(pushNow,700)};
  const rawSetItem=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,value){const result=rawSetItem.call(this,key,value);if(this===localStorage&&keys.includes(String(key)))push();return result};

  function applyRemote(remote){
    keys.forEach(k=>localStorage.setItem(k,JSON.stringify(remote?.[k]??emptyFor(k))));
    if(typeof state==='undefined'||!state)return;
    state.characters=Array.isArray(remote?.['charaHub.characters'])?remote['charaHub.characters']:[];
    state.sources=Array.isArray(remote?.['charaHub.sources'])?remote['charaHub.sources']:[];
    const layout=remote?.['charaHub.layoutV1'];
    state.layout=layout&&typeof layout==='object'&&!Array.isArray(layout)?layout:{};
    try{if(typeof ensureLayoutShape==='function')ensureLayoutShape()}catch(error){console.warn(error)}
    try{if(typeof migrateCharacters==='function')migrateCharacters()}catch(error){console.warn(error)}
    try{if(typeof renderCharacters==='function')renderCharacters()}catch(error){console.warn(error)}
    try{if(typeof renderSources==='function')renderSources()}catch(error){console.warn(error)}
    try{if(typeof setMainView==='function')setMainView();else if(typeof renderDataTable==='function')renderDataTable()}catch(error){console.warn(error)}
  }

  // Detected source column names are not Character names. Keep them only as
  // import metadata and let the user type each new Character name themselves.
  function applyManualCharacterNames(){
    if(typeof state==='undefined'||state?.mode!=='new')return;
    document.querySelectorAll('.newName[data-i]').forEach(input=>{
      const row=state.pending?.parsed?.names?.[Number(input.dataset.i)];
      if(!row)return;
      input.value=Object.prototype.hasOwnProperty.call(row,'manualName')?String(row.manualName||''):'';
    });
  }
  if(typeof renderDetected==='function'){
    const rawRenderDetected=renderDetected;
    renderDetected=function(...args){const result=rawRenderDetected.apply(this,args);applyManualCharacterNames();return result};
  }
  document.addEventListener('input',event=>{
    const input=event.target.closest?.('.newName[data-i]');
    if(!input||typeof state==='undefined')return;
    const row=state.pending?.parsed?.names?.[Number(input.dataset.i)];
    if(row)row.manualName=input.value;
  });
  applyManualCharacterNames();

  (async()=>{
    let remote=null;
    try{
      remote=(await api(endpoint)).state;
      const local=read();
      if(remote&&meaningful(remote)){
        if(JSON.stringify(local)!==JSON.stringify(remote))applyRemote(remote);
      }else if(meaningful(local)){
        await api(endpoint,{method:'POST',body:JSON.stringify({state:local})});
      }
    }catch(error){
      console.warn('Spreadsheet initial sync failed',error);
    }finally{
      loading=false;
      requestAnimationFrame(()=>{if(window.frameElement)window.frameElement.style.visibility=''});
    }
    if(remote&&meaningful(remote)&&JSON.stringify(read())!==JSON.stringify(remote))pushNow();
  })();
})();
