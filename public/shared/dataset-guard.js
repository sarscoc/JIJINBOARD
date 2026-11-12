(()=>{
  'use strict';
  if(window.JijinDataset)return;
  const nativeFetch=window.fetch.bind(window),key='jijin.dataset.generation.v1';
  const get=Storage.prototype.getItem,set=Storage.prototype.setItem,remove=Storage.prototype.removeItem;
  const stored=get.call(localStorage,key)||'';
  // A terminal API/server failure must not trigger endless reconnect loops.
  // Navigate once to a static page that does not require D1 or WebSockets.
  let failureRedirected=false;
  function enterReadOnly(reason){
    if(failureRedirected||location.pathname.startsWith('/read-only'))return;
    failureRedirected=true;
    blocked=true;
    const destination='/read-only.html?reason='+encodeURIComponent(reason)+'&return='+encodeURIComponent(location.pathname+location.search+location.hash);
    try{window.top.location.assign(destination)}catch{location.assign(destination)}
  }
  // Keep a bounded snapshot of the last successful GET, independently of
  // HTTP cache-control:no-store. This is a local, offline-only recovery copy.
  async function rememberSnapshot(url,response){
    if(!window.caches||!response.ok||!response.headers.get('content-type')?.includes('application/json'))return;
    if(!/^\/api\/(boards|rooms)\//.test(url.pathname))return;
    if(/\/(?:realtime|player-icons|images|image|auth)(?:\/|$)/.test(url.pathname))return;
    try{
      const body=await response.clone().text();
      if(body.length>1500000)return;
      const cache=await caches.open('jijinboard-readonly-snapshots-v1');
      const snapshotUrl=new URL('/__readonly_snapshot__',location.origin);
      snapshotUrl.searchParams.set('path',url.pathname+url.search);
      snapshotUrl.searchParams.set('generation',generation||stored||'');
      await cache.put(snapshotUrl.href,new Response(body,{headers:{'content-type':'application/json','x-snapshot-at':new Date().toISOString()}}));
    }catch(error){console.warn('Read-only snapshot skipped',error)}
  }
  const isTerminal=response=>response.status>=500&&response.status!==503 /* reset handled below */;

  let generation=stored,blocked=false;
  const appKey=k=>/^(board:|trpg|jijinboard|jijin\.comment-cache\.|personas:|magiaMatrix|charaHub|admin:|boardAdmin:|theme:|mainTab:)/.test(k);
  Storage.prototype.setItem=function(k,v){if(blocked&&appKey(String(k)))return;return set.call(this,k,v)};
  const connections=new Set();
  // A reset must isolate IndexedDB even when another open tab blocks deletion.
  if(window.indexedDB){
    const open=indexedDB.open.bind(indexedDB);
    indexedDB.open=function(name,...args){
      const scoped=/^(magiaMatrix|charaHub)/.test(String(name));
      const request=open(scoped?`${name}.dataset.${stored||'unverified'}`:name,...args);
      if(scoped)request.addEventListener('success',()=>{connections.add(request.result);request.result.addEventListener('versionchange',()=>request.result.close())});
      return request;
    };
  }
  async function invalidate(next){
    blocked=true;
    for(const db of connections)db.close();
    for(const storage of [localStorage,sessionStorage]){
      const keys=Array.from({length:storage.length},(_,i)=>storage.key(i));
      for(const k of keys)if(k&&appKey(k)){
        remove.call(storage,k);
      }
    }
    // Storage engines can stall; a reset already isolates data by generation.
    let cleanupTimer;
    const cleanup=(async()=>{
    if(window.caches)try{for(const name of await caches.keys())if(name.startsWith('jijinboard-'))await caches.delete(name)}catch{}
    if(window.indexedDB?.databases)try{for(const db of await indexedDB.databases())if(/^(magiaMatrix|charaHub)/.test(db.name||'')&&!db.name.endsWith(`.dataset.${next}`))indexedDB.deleteDatabase(db.name)}catch{}

    })();
    try{await Promise.race([cleanup,new Promise(resolve=>cleanupTimer=setTimeout(resolve,1000))])}finally{clearTimeout(cleanupTimer)}
    if(next)set.call(localStorage,key,next);
    location.reload();
  }
  const ready=(async()=>{
    let response,data;
    for(let attempt=0;attempt<90;attempt++){
      let failure;
      for(let retry=0;retry<2;retry++){
        const controller=new AbortController();let timer;
        try{
          const result=await Promise.race([
            (async()=>{const response=await nativeFetch('/api/dataset',{cache:'no-store',signal:controller.signal});return {response,data:await response.json()}})(),
            new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('起動確認がタイムアウトしました'))},10000)})
          ]);
          response=result.response;data=result.data;failure=null;break;
        }catch(error){failure=error}
        finally{clearTimeout(timer)}
      }
      if(failure)throw Error('部屋情報の通信がタイムアウトしました。ページを再読み込みしてください');
      if(response.status!==503||data?.code!=='DATASET_RESETTING')break;
      await new Promise(resolve=>setTimeout(resolve,2000));
    }
    if(!response.ok)throw Error('保存データの世代を確認できません');
    if(typeof data.generation!=='string'||!data.generation)throw Error('保存データの世代が不正です');
    if(stored!==data.generation){await invalidate(data.generation);throw Error('保存データを読み直しています');}
    generation=data.generation;
    return generation;
  })();
  // Failed bootstrap must never permit writes, even if application code catches its error.
  ready.catch(error=>{blocked=true;console.warn('Dataset guard',error);enterReadOnly('server')});
  window.fetch=async function(input,init){
    const url=new URL(input instanceof Request?input.url:String(input),location.href);
    if(url.origin!==location.origin||!url.pathname.startsWith('/api/'))return nativeFetch(input,init);
    await ready;
    if(blocked)throw Error('画面を再読み込みしてください');
    const method=String(init?.method||(input instanceof Request?input.method:'GET')).toUpperCase();
    let options=init;
    if(!['GET','HEAD','OPTIONS'].includes(method)){
      const headers=new Headers(init?.headers||(input instanceof Request?input.headers:undefined));
      headers.set('x-jijin-dataset',generation);options={...init,headers};
    }
    let response;
    try{response=await nativeFetch(input,options)}
    catch(error){
      // Aborts can be intentional (tab changes, superseded requests).
      if(error?.name!=='AbortError')enterReadOnly('network');
      throw error;
    }
    if(isTerminal(response)||response.status===503){
      // Dataset-reset responses are expected during an intentional reset.
      const data=response.status===503?await response.clone().json().catch(()=>null):null;
      if(data?.code!=='DATASET_RESETTING')enterReadOnly(response.status===429?'quota':'server');
    }
    if(response.status===429)enterReadOnly('quota');
    if(method==='GET'&&response.ok)rememberSnapshot(url,response).catch(()=>{});
    if(response.status===409){
      const data=await response.clone().json().catch(()=>null);
      if(data?.code==='DATASET_CHANGED'){
        blocked=true;
        // Do not fetch a new token and replay a body assembled from stale memory.
        remove.call(localStorage,key);location.reload();
      }
    }
    return response;
  };
  addEventListener('storage',event=>{if(event.key===key&&event.newValue!==generation){blocked=true;location.reload()}});
  window.JijinDataset={ready,get blocked(){return blocked}};
})();

