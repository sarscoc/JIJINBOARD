"use strict";

(async()=>{
  const params=new URL(location.href).searchParams,boardId=params.get("board")||"";
  if(!boardId)return;

  let lastLogId=params.get("room")||"";
  let applying=false,hydrated=false,hydratedLogId="",hydratePromise=null,hydratingLogId="",hydrateSeq=0,rehydrateQueued=false;
  const saveTimers=new Map();

  const waitForGlobals=async()=>{
    for(let i=0;i<80;i++){
      if(
        typeof window.tplSetRecord==="function" &&
        typeof window.tplAllRecords==="function" &&
        typeof window.templateStates==="function" &&
        typeof window.setTemplateStates==="function" &&
        window.matrixBoardContext
      )return true;
      await new Promise(r=>setTimeout(r,50));
    }
    return false;
  };
  if(!await waitForGlobals())return;

  const currentLogId=()=>{
    const live=String(window.matrixBoardContext?.roomId||"");
    if(live)lastLogId=live;
    return live||lastLogId||"";
  };
  const endpoint=(logId,id)=>`/api/boards/${encodeURIComponent(boardId)}/matrix/${encodeURIComponent(logId)}/templates${id?`/${encodeURIComponent(id)}`:""}`;
  const profile=()=>window.matrixBoardContext?.profile?.()||null;
  const api=(path,options={})=>window.matrixBoardContext.api(path,options);
  const clone=value=>{try{return structuredClone(value)}catch{try{return JSON.parse(JSON.stringify(value))}catch{return{}}}};

  function templateStateSnapshot(id){
    const states=window.templateStates()||{};
    return states[id]&&typeof states[id]==="object"?clone(states[id]):{};
  }

  // MATRIXの本体・PC一覧・テンプレ同期は別々に非同期描画される。
  // 各描画直前に item.local をその時点の appState へ結び直し、
  // 起動時に掴んだ古いオブジェクト参照で最新表示を上書きしないようにする。
  function rebindItemsForRender(){
    try{
      if(typeof items==="undefined"||!Array.isArray(items)||typeof appState!=="function"||typeof makeLocalItemState!=="function")return;
      const state=appState(),stateItems=state?.items&&typeof state.items==="object"?state.items:{};
      for(const item of items){
        if(!item?.id)continue;
        item.local=stateItems[item.id]||makeLocalItemState(item.id);
      }
    }catch{}
  }
  if(typeof renderLibrary==="function"&&!renderLibrary.__jijinStateBound){
    const rawRenderLibrary=renderLibrary;
    const wrappedRenderLibrary=function(...args){rebindItemsForRender();return rawRenderLibrary.apply(this,args)};
    wrappedRenderLibrary.__jijinStateBound=true;
    renderLibrary=wrappedRenderLibrary;
  }
  if(typeof renderPlaced==="function"&&!renderPlaced.__jijinStateBound){
    const rawRenderPlaced=renderPlaced;
    const wrappedRenderPlaced=function(...args){rebindItemsForRender();return rawRenderPlaced.apply(this,args)};
    wrappedRenderPlaced.__jijinStateBound=true;
    renderPlaced=wrappedRenderPlaced;
  }

  // board-integration の point API は fetch を呼ぶ時点の URL を使う。
  // 現在表示中のテンプレIDを point PATCH に添える。
  if(!window.fetch.__jijinMatrixTemplateScoped){
    const rawFetch=window.fetch.bind(window);
    const scopedFetch=async(input,init={})=>{
      const url=typeof input==="string"?input:String(input?.url||"");
      if((init?.method||"GET").toUpperCase()==="PATCH"&&/\/matrix\/[^/]+\/points\//.test(url)&&typeof init.body==="string"){
        try{
          const data=JSON.parse(init.body),templateId=String(window.currentTemplateId?.()||"");
          if(templateId&&!data.templateId)init={...init,body:JSON.stringify({...data,templateId})};
        }catch{}
      }
      return rawFetch(input,init);
    };
    scopedFetch.__jijinMatrixTemplateScoped=true;
    window.fetch=scopedFetch;
  }

  const rawSet=window.tplSetRecord;

  async function putRemote(logId,id,record,templateState){
    if(applying||!logId||!id||!record)return;
    const me=profile();if(!me?.id||!me?.plName)return;

    // MATRIXをLOGより先に開いた場合は room が後から届く。
    // その時点で一度サーバーを正として同期してから保存する。
    if(!hydrated||hydratedLogId!==logId){
      await hydrate(logId);
      if(!hydrated||hydratedLogId!==logId)return;
    }

    try{
      const result=await api(endpoint(logId,id),{
        method:"PUT",
        body:JSON.stringify({
          authorId:me.id,
          authorName:me.plName,
          record,
          templateState:templateState&&typeof templateState==="object"?templateState:{}
        })
      });
      if(result?.record){
        applying=true;
        try{await rawSet(id,{...record,...result.record})}
        finally{applying=false}
      }
      window.matrixBoardContext?.notifyChange?.("matrix-template-state",{templateId:id});
    }catch(error){
      console.warn("MATRIX template sync failed",error);
    }
  }

  function scheduleRemote(id,record,delay=350){
    const key=String(id||""),logId=currentLogId();
    if(!key||!record||!logId)return;
    const timerKey=`${logId}:${key}`;
    const state=templateStateSnapshot(key);
    clearTimeout(saveTimers.get(timerKey));
    saveTimers.set(timerKey,setTimeout(()=>{
      saveTimers.delete(timerKey);
      putRemote(logId,key,record,state);
    },delay));
  }

  const wrappedSet=async function(id,record,...rest){
    const result=await rawSet.call(this,id,record,...rest);
    if(!applying)scheduleRemote(String(id||""),record,0);
    return result;
  };
  wrappedSet.__jijinTemplateRemoteSync=true;
  window.tplSetRecord=wrappedSet;

  async function pruneLocalTemplates(remote){
    const remoteIds=new Set(remote.map(item=>String(item?.record?.id||"")).filter(Boolean));
    const local=await window.tplAllRecords();
    const previousStates=window.templateStates()||{};
    const unsynced=[];

    applying=true;
    try{
      if(typeof window.tplDeleteRecord==="function"){
        for(const rec of local){
          const id=String(rec?.id||"");
          if(!id||remoteIds.has(id))continue;

          const dataUrl=String(rec?.dataUrl||"");
          const serverMatch=dataUrl.match(/^\/api\/boards\/([^/]+)\/matrix\/templates\//);
          const localState=previousStates[id]&&typeof previousStates[id]==="object"?previousStates[id]:null;
          const looksUnsynced=dataUrl.startsWith("data:image/")||(!serverMatch&&localState&&Object.keys(localState).length>0);

          // 同期不全でサーバーに届かなかったローカル作業は消さない。
          // 一方、サーバーURLを持つのに一覧に存在しないレコードは古いキャッシュなので除去する。
          if(looksUnsynced)unsynced.push({record:rec,templateState:clone(localState||{})});
          else await window.tplDeleteRecord(id);
        }
      }

      const states={};
      for(const item of remote){
        const rec=item?.record;
        if(!rec?.id)continue;
        await rawSet(rec.id,rec);
        states[rec.id]=item?.templateState&&typeof item.templateState==="object"?item.templateState:{};
      }
      for(const item of unsynced){
        const id=String(item.record?.id||"");
        if(id&&!remoteIds.has(id))states[id]=item.templateState||{};
      }
      window.setTemplateStates(states);

      const current=String(window.currentTemplateId?.()||"");
      const keptIds=new Set([...remoteIds,...unsynced.map(item=>String(item.record?.id||"")).filter(Boolean)]);
      if(current&&!keptIds.has(current)){
        try{localStorage.removeItem("magiaMatrix.currentTemplate.v1")}catch{}
      }
    }finally{
      applying=false;
    }
    return unsynced;
  }

  async function hydrate(logId=currentLogId()){
    const target=String(logId||"");
    if(!target)return false;
    if(hydrated&&hydratedLogId===target&&!hydratePromise)return true;
    if(hydratePromise){
      rehydrateQueued=true;
      if(target!==hydratingLogId)hydrateSeq++;
      return hydratePromise;
    }

    const seq=++hydrateSeq;
    hydratingLogId=target;
    const task=(async()=>{
      try{
        const result=await api(endpoint(target,""));
        if(seq!==hydrateSeq||target!==currentLogId())return false;
        const remote=Array.isArray(result?.templates)?result.templates:[];

        // IndexedDB のテンプレキャッシュは board/room で自動分離されないため、
        // サーバーに存在しない古いレコードを残すと別自陣のテンプレが混ざる。
        // JIJINBOARD ではサーバーを正としてローカルキャッシュを揃える。
        const unsynced=await pruneLocalTemplates(remote);
        if(seq!==hydrateSeq||target!==currentLogId())return false;

        try{
          await window.renderTemplateTabs?.();
          await window.restoreTemplate?.();
          rebindItemsForRender();
          window.renderLibrary?.();
          window.renderPlaced?.();
        }catch(error){
          console.warn("MATRIX template redraw failed",error);
        }
        hydrated=true;
        hydratedLogId=target;
        // 以前の不具合でサーバーへ届かなかった作業だけ、同期準備後に救済保存する。
        for(const item of unsynced){
          const id=String(item.record?.id||"");
          if(id)putRemote(target,id,item.record,item.templateState||{});
        }
        return true;
      }catch(error){
        console.warn("MATRIX template hydrate failed",error);
        return false;
      }
    })();

    hydratePromise=task;
    try{
      return await task;
    }finally{
      if(hydratePromise===task){hydratePromise=null;hydratingLogId=""}
      if(rehydrateQueued){
        rehydrateQueued=false;
        const next=currentLogId();
        if(next)queueMicrotask(()=>hydrate(next).catch(()=>{}));
      }
    }
  }

  const rawDelete=window.deleteSavedTemplate;
  if(typeof rawDelete==="function"){
    window.deleteSavedTemplate=async function(id,...rest){
      const key=String(id||""),logId=currentLogId();
      const result=await rawDelete.call(this,id,...rest);
      if(!key||!logId)return result;
      clearTimeout(saveTimers.get(`${logId}:${key}`));
      saveTimers.delete(`${logId}:${key}`);

      let remains=false;
      try{remains=!!(await window.tplGetRecord?.(key))}catch{}
      if(!remains){
        const me=profile();
        if(me?.id){
          api(endpoint(logId,key),{method:"DELETE",body:JSON.stringify({authorId:me.id})})
            .then(()=>window.matrixBoardContext?.notifyChange?.("matrix-template-state",{templateId:key}))
            .catch(error=>console.warn("MATRIX template delete sync failed",error));
        }
      }
      return result;
    };
  }

  const rawSaveTemplateState=window.saveCurrentTemplateState;
  if(typeof rawSaveTemplateState==="function"){
    window.saveCurrentTemplateState=function(...args){
      const result=rawSaveTemplateState.apply(this,args),id=String(window.currentTemplateId?.()||"");
      if(id){
        window.tplGetRecord?.(id)
          .then(rec=>rec&&scheduleRemote(id,rec,350))
          .catch(()=>{});
      }
      return result;
    };
  }

  window.addEventListener("matrix-board-room",event=>{
    const next=String(event.detail?.roomId||"");
    if(!next)return;
    lastLogId=next;
    if(hydratedLogId!==next){
      hydrated=false;
      hydratedLogId="";
    }
    hydrate(next).catch(()=>{});
  });

  window.addEventListener("matrix-board-active",()=>{
    const logId=currentLogId();
    if(logId&&(!hydrated||hydratedLogId!==logId))hydrate(logId).catch(()=>{});
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      rebindItemsForRender();
      try{renderLibrary()}catch{}
      try{renderPlaced()}catch{}
    }));
  });

  window.addEventListener("matrix-board-comments-changed",event=>{
    if(event.detail?.action==="matrix-template-state"){
      hydrated=false;
      hydratedLogId="";
      hydrate(currentLogId()).catch(()=>{});
    }
  });

  const initialLogId=currentLogId();
  if(initialLogId)hydrate(initialLogId).catch(()=>{});
})();

(async()=>{
  if(!await (async()=>{
    for(let i=0;i<80;i++){
      if(typeof window.saveTemplateFile==="function")return true;
      await new Promise(r=>setTimeout(r,50));
    }
    return false;
  })())return;
  if(window.saveTemplateFile.__jijinTemplateCompressed||window.saveTemplateFile.__jijinTemplateOptimized)return;

  const raw=window.saveTemplateFile,MAX_SIDE=2560,QUALITY=.86;
  async function compress(file){
    if(!(file instanceof Blob)||!String(file.type||"").startsWith("image/")||typeof createImageBitmap!=="function")return file;
    let bitmap;
    try{
      bitmap=await createImageBitmap(file);
      const scale=Math.min(1,MAX_SIDE/Math.max(bitmap.width,bitmap.height)),
        w=Math.max(1,Math.round(bitmap.width*scale)),
        h=Math.max(1,Math.round(bitmap.height*scale)),
        canvas=document.createElement("canvas");
      canvas.width=w;canvas.height=h;
      const ctx=canvas.getContext("2d",{alpha:true});
      ctx.imageSmoothingEnabled=true;
      ctx.imageSmoothingQuality="high";
      ctx.drawImage(bitmap,0,0,w,h);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/webp",QUALITY));
      if(!blob)return file;
      const name=(String(file.name||"template").replace(/\.[^.]+$/,"")||"template")+".webp";
      return new File([blob],name,{type:"image/webp",lastModified:file.lastModified||Date.now()});
    }catch{
      return file;
    }finally{
      try{bitmap?.close?.()}catch{}
    }
  }
  const wrapped=async function(file,...args){return raw.call(this,await compress(file),...args)};
  wrapped.__jijinTemplateCompressed=true;
  window.saveTemplateFile=wrapped;
})();
