(()=>{
  'use strict';
  if(window.JijinDataset)return;
  const nativeFetch=window.fetch.bind(window),key='jijin.dataset.generation.v1';
  const get=Storage.prototype.getItem,set=Storage.prototype.setItem,remove=Storage.prototype.removeItem;
  const stored=get.call(localStorage,key)||'';
  let generation=stored,blocked=false;
  const appKey=k=>/^(board:|trpg|jijinboard|personas:|magiaMatrix|charaHub|admin:|boardAdmin:|theme:|mainTab:)/.test(k);
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
    if(window.caches)try{for(const name of await caches.keys())if(name.startsWith('jijinboard-'))await caches.delete(name)}catch{}
    if(window.indexedDB?.databases)try{for(const db of await indexedDB.databases())if(/^(magiaMatrix|charaHub)/.test(db.name||'')&&!db.name.endsWith(`.dataset.${next}`))indexedDB.deleteDatabase(db.name)}catch{}
    if(next)set.call(localStorage,key,next);
    location.reload();
  }
  const ready=(async()=>{
    let response;
    for(let attempt=0;attempt<90;attempt++){
      let failure;
      for(let retry=0;retry<2;retry++){
        const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
        try{response=await nativeFetch('/api/dataset',{cache:'no-store',signal:controller.signal});failure=null;break}
        catch(error){failure=error}
        finally{clearTimeout(timer)}
      }
      if(failure)throw Error('部屋情報の通信がタイムアウトしました。ページを再読み込みしてください');
      if(response.status!==503)break;
      const data=await response.clone().json().catch(()=>null);if(data?.code!=='DATASET_RESETTING')break;
      await new Promise(resolve=>setTimeout(resolve,2000));
    }
    if(!response.ok)throw Error('保存データの世代を確認できません');
    const data=await response.json();
    if(typeof data.generation!=='string'||!data.generation)throw Error('保存データの世代が不正です');
    if(stored!==data.generation){await invalidate(data.generation);throw Error('保存データを読み直しています');}
    generation=data.generation;
    return generation;
  })();
  // Failed bootstrap must never permit writes, even if application code catches its error.
  ready.catch(error=>{blocked=true;console.warn('Dataset guard',error)});
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
    const response=await nativeFetch(input,options);
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

