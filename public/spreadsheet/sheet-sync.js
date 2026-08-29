(()=>{
  const board=new URL(location.href).searchParams.get('board');if(!board)return;

  const keys=['charaHub.characters','charaHub.sources','charaHub.layoutV1'];
  const emptyFor=k=>k==='charaHub.layoutV1'?{}:[];
  const api=async(path,options={})=>{const r=await fetch(path,{headers:{'content-type':'application/json'},...options}),d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'同期に失敗しました');return d};
  const parse=(key,value)=>{try{return JSON.parse(value??'')}catch{return emptyFor(key)}};
  const read=()=>Object.fromEntries(keys.map(k=>[k,parse(k,localStorage.getItem(k)??JSON.stringify(emptyFor(k)))]));
  const meaningful=s=>(s?.['charaHub.characters']||[]).length||(s?.['charaHub.sources']||[]).length||(s?.['charaHub.layoutV1']?.localItems||[]).length||(s?.['charaHub.layoutV1']?.parts||[]).length||(s?.['charaHub.layoutV1']?.groups||[]).length;
  const endpoint=`/api/boards/${encodeURIComponent(board)}/spreadsheet/state`;

  // The old spreadsheet bootstrap imported every project PC/NPC into Character.
  // Those generated rows have this exact empty/local shape. They are not sheet
  // data, so do not let them become authoritative or resurrect after deletion.
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

  let timer=0,loading=true;
  let lastCharacterIds=new Set((sanitizeSnapshot(read())['charaHub.characters']||[]).map(ch=>ch.id));
  const pushNow=async()=>{if(loading)return;clearTimeout(timer);timer=0;try{await api(endpoint,{method:'POST',body:JSON.stringify({state:sanitizeSnapshot(read())})})}catch(error){console.warn('Spreadsheet sync save failed',error)}};
  const push=()=>{if(loading)return;clearTimeout(timer);timer=setTimeout(pushNow,700)};
  const rawSetItem=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,value){
    const name=String(key),result=rawSetItem.call(this,key,value);
    if(this!==localStorage||!keys.includes(name))return result;
    if(name==='charaHub.characters'){
      const next=Array.isArray(parse(name,value))?parse(name,value):[];
      const nextIds=new Set(next.map(ch=>ch?.id).filter(Boolean));
      const deleted=[...lastCharacterIds].some(id=>!nextIds.has(id));
      lastCharacterIds=nextIds;
      if(deleted){queueMicrotask(pushNow);return result}
    }
    push();
    return result;
  };

  function applyRemote(remote){
    const clean=sanitizeSnapshot(remote||{});
    keys.forEach(k=>localStorage.setItem(k,JSON.stringify(clean?.[k]??emptyFor(k))));
    if(typeof state==='undefined'||!state)return clean;
    state.characters=Array.isArray(clean['charaHub.characters'])?clean['charaHub.characters']:[];
    state.sources=Array.isArray(clean['charaHub.sources'])?clean['charaHub.sources']:[];
    const layout=clean['charaHub.layoutV1'];
    state.layout=layout&&typeof layout==='object'&&!Array.isArray(layout)?layout:{};
    lastCharacterIds=new Set(state.characters.map(ch=>ch.id));
    try{if(typeof ensureLayoutShape==='function')ensureLayoutShape()}catch(error){console.warn(error)}
    try{if(typeof migrateCharacters==='function')migrateCharacters()}catch(error){console.warn(error)}
    try{if(typeof renderCharacters==='function')renderCharacters()}catch(error){console.warn(error)}
    try{if(typeof renderSources==='function')renderSources()}catch(error){console.warn(error)}
    try{if(typeof setMainView==='function')setMainView();else if(typeof renderDataTable==='function')renderDataTable()}catch(error){console.warn(error)}
    return clean;
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

  // Always open the Character manager first. Previously openCharacterManage()
  // rendered the list before showing the modal, so one bad Character render made
  // the toolbar button look permanently dead after a Character had been created.
  const characterManageButton=document.getElementById('characterManageBtn');
  if(characterManageButton){
    characterManageButton.onclick=()=>{
      try{
        if(typeof openModalById==='function')openModalById('characterManageModal');
        else document.getElementById('characterManageModal')?.classList.add('show');
      }catch(error){console.warn('Character manager open failed',error)}
      try{if(typeof renderCharacters==='function')renderCharacters()}catch(error){console.warn('Character manager render failed',error)}
    };
  }

  (async()=>{
    let remote=null,cleanRemote=null;
    try{
      remote=(await api(endpoint)).state;
      cleanRemote=sanitizeSnapshot(remote||{});
      const cleanLocal=sanitizeSnapshot(read());
      if(remote&&meaningful(cleanRemote)){
        applyRemote(cleanRemote);
      }else{
        applyRemote(cleanLocal);
        if(meaningful(cleanLocal))await api(endpoint,{method:'POST',body:JSON.stringify({state:cleanLocal})});
      }
    }catch(error){
      console.warn('Spreadsheet initial sync failed',error);
    }finally{
      loading=false;
      requestAnimationFrame(()=>{if(window.frameElement)window.frameElement.style.visibility=''});
    }
    if(remote&&JSON.stringify(remote)!==JSON.stringify(cleanRemote))pushNow();
  })();
})();
