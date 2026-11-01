"use strict";

(async()=>{
  const params=new URL(location.href).searchParams,boardId=params.get("board")||"";
  if(!boardId)return;

  let lastLogId=params.get("room")||"";
  let applying=false,hydrated=false,hydratedLogId="",hydratePromise=null,hydratingLogId="",hydrateSeq=0,rehydrateQueued=false;
  const saveTimers=new Map(),pendingSaves=new Map(),savingIds=new Set(),revisions=new Map();
  let editSeq=0;
  const deletedKey=`jijinboardDeletedTemplates:${boardId}`;
  const deleted=()=>{try{return new Set(JSON.parse(localStorage.getItem(deletedKey)||"[]"))}catch{return new Set()}};
  const isDeleted=id=>deleted().has(String(id));

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
  window.matrixTemplateSync={isHydrated:()=>hydrated&&hydratedLogId===currentLogId(),isApplyingRemote:()=>applying};

  function refreshWhenIdle(){
    if(!rehydrateQueued||saveTimers.size||pendingSaves.size||savingIds.size)return;
    rehydrateQueued=false;hydrated=false;hydratedLogId="";
    hydrate(currentLogId()).catch(()=>{});
  }

  async function putRemote(timerKey){
    if(savingIds.has(timerKey))return;
    const draft=pendingSaves.get(timerKey);
    if(!draft)return;
    const {logId,id,record,templateState,baseRevision,seq}=draft;
    if(isDeleted(id)){pendingSaves.delete(timerKey);refreshWhenIdle();return}
    const me=profile();if(!me?.id||!me?.plName)return;
    pendingSaves.delete(timerKey);savingIds.add(timerKey);
    try{
      const body=JSON.stringify({authorId:me.id,authorName:me.plName,baseRevision,record,templateState});
      const result=await api(endpoint(logId,id),{
        method:"PUT",keepalive:new TextEncoder().encode(body).byteLength<60_000,body
      });
      if(isDeleted(id)){await api(endpoint(logId,id),{method:"DELETE",body:JSON.stringify({authorId:me.id})});return}
      if(result?.record){
        revisions.set(id,result.record.revision);
        const newer=pendingSaves.get(timerKey);
        if(newer){
          // Advance only our own queued edit; never advance a stale external editor.
          newer.baseRevision=result.record.revision;
          if(newer.record.dataUrl===record.dataUrl)newer.record.dataUrl=result.record.dataUrl;
        }
        // A response for an older save must not replace a newer local image/name.
        if(!newer&&seq===editSeq){
          applying=true;
          try{await rawSet(id,{...record,...result.record})}
          finally{applying=false}
        }
      }
      window.matrixBoardContext?.notifyChange?.("matrix-template-state",{templateId:id});
    }catch(error){
      console.warn("MATRIX template sync failed",error);
      // Keep the failed draft available for recovery without ever replaying it automatically.
      let backedUp=false;
      try{localStorage.setItem(`jijinboardTemplateSaveRecovery:${boardId}:${id}`,JSON.stringify(pendingSaves.get(timerKey)||draft));backedUp=true}catch{}
      if(error.status===409){
        clearTimeout(saveTimers.get(timerKey));saveTimers.delete(timerKey);pendingSaves.delete(timerKey);
        rehydrateQueued=true;
      }
      alert((error.status===409?"テンプレートの更新が重なったため、古い情報での上書きを止めました。最新の保存内容を読み直します。":"テンプレートを保存できませんでした。通信状態を確認して、もう一度編集してください。")+(backedUp?"未保存の編集内容はこのブラウザに退避しました。":"ブラウザへの退避にも失敗しました。"));
    }finally{
      savingIds.delete(timerKey);
      if(pendingSaves.has(timerKey)&&!saveTimers.has(timerKey))putRemote(timerKey);
      else refreshWhenIdle();
    }
  }

  function scheduleRemote(id,record,delay=350,state=templateStateSnapshot(id)){
    const key=String(id||""),logId=currentLogId();
    if(applying||window.matrixBoardContext?.isApplyingRemote?.()||!hydrated||hydratedLogId!==logId||!key||!record||!logId)return;
    const timerKey=`${logId}:${key}`;
    pendingSaves.set(timerKey,{logId,id:key,record:clone(record),templateState:clone(state),baseRevision:revisions.get(key)??null,seq:++editSeq});
    clearTimeout(saveTimers.get(timerKey));
    saveTimers.set(timerKey,setTimeout(()=>{saveTimers.delete(timerKey);putRemote(timerKey)},delay));
  }

  const wrappedSet=async function(id,record,...rest){
    const result=await rawSet.call(this,id,record,...rest);
    if(!applying&&hydrated)scheduleRemote(String(id||""),record,0);
    return result;
  };
  wrappedSet.__jijinTemplateRemoteSync=true;
  window.tplSetRecord=wrappedSet;

  async function pruneLocalTemplates(remote){
    const remoteIds=new Set(remote.map(item=>String(item?.record?.id||"")).filter(Boolean));
    const local=await window.tplAllRecords();
    applying=true;
    try{
      if(typeof window.tplDeleteRecord==="function"){
        for(const rec of local){
          const id=String(rec?.id||"");
          if(!id||remoteIds.has(id))continue;
          await window.tplDeleteRecord(id);
        }
      }
      const states={};
      for(const item of remote){
        const rec=item?.record;if(!rec?.id)continue;
        revisions.set(String(rec.id),rec.revision??null);
        await rawSet(rec.id,rec);
        states[rec.id]=item?.templateState&&typeof item.templateState==="object"?item.templateState:{};
      }
      window.setTemplateStates(states);
      const current=String(window.currentTemplateId?.()||""),keptIds=remoteIds;
      if(current&&!keptIds.has(current)){try{localStorage.removeItem("magiaMatrix.currentTemplate.v1")}catch{}}
    }finally{applying=false}
  }

  async function hydrate(logId=currentLogId()){
    const target=String(logId||"");
    if(!target)return false;
    if(saveTimers.size||pendingSaves.size||savingIds.size){rehydrateQueued=true;return false}
    if(hydrated&&hydratedLogId===target&&!hydratePromise)return true;
    if(hydratePromise){rehydrateQueued=true;if(target!==hydratingLogId)hydrateSeq++;return hydratePromise}
    const seq=++hydrateSeq;hydratingLogId=target;
    const task=(async()=>{
      try{
        const result=await api(endpoint(target,""),{cache:"reload"});
        if(seq!==hydrateSeq||target!==currentLogId())return false;
        const remote=Array.isArray(result?.templates)?result.templates.filter(t=>!isDeleted(t.id||t.record?.id)):[];
        await pruneLocalTemplates(remote);
        if(seq!==hydrateSeq||target!==currentLogId())return false;
        applying=true;
        try{
          await window.renderTemplateTabs?.();
          const selected=String(window.currentTemplateId?.()||"");
          if(selected)await window.restoreTemplate?.();
          rebindItemsForRender();
          window.renderLibrary?.();
          window.renderPlaced?.();
        }catch(error){console.warn("MATRIX template redraw failed",error)}finally{applying=false}
        hydrated=true;hydratedLogId=target;
        // Never upload historical local records merely because hydration found them.
        return true;
      }catch(error){console.warn("MATRIX template hydrate failed",error);return false}
    })();
    hydratePromise=task;
    try{return await task}finally{
      if(hydratePromise===task){hydratePromise=null;hydratingLogId=""}
      if(rehydrateQueued){rehydrateQueued=false;const next=currentLogId();if(next)queueMicrotask(()=>hydrate(next).catch(()=>{}))}
    }
  }

  const rawDelete=window.deleteSavedTemplate;
  if(typeof rawDelete==="function"){
    window.deleteSavedTemplate=async function(id,...rest){
      const key=String(id||""),logId=currentLogId(),result=await rawDelete.call(this,id,...rest);
      if(!key||!logId)return result;
      clearTimeout(saveTimers.get(`${logId}:${key}`));saveTimers.delete(`${logId}:${key}`);pendingSaves.delete(`${logId}:${key}`);
      let remains=false;try{remains=!!(await window.tplGetRecord?.(key))}catch{}
      if(!remains){
        const removed=deleted();removed.add(key);localStorage.setItem(deletedKey,JSON.stringify([...removed]));
        const me=profile();
        if(me?.id){await api(endpoint(logId,key),{method:"DELETE",body:JSON.stringify({authorId:me.id})}).then(()=>window.matrixBoardContext?.notifyChange?.("matrix-template-state",{templateId:key})).catch(error=>{alert("サーバーでの削除に失敗しました："+error.message);throw error})}
      }
      return result;
    };
  }

  const rawSaveTemplateState=window.saveCurrentTemplateState;
  if(typeof rawSaveTemplateState==="function"){
    window.saveCurrentTemplateState=function(...args){
      // Hydration and remote point/display refreshes are reads, never edits.
      if(applying||!hydrated)return;
      const result=rawSaveTemplateState.apply(this,args);
      if(window.matrixBoardContext?.isApplyingRemote?.())return result;
      const id=String(window.currentTemplateId?.()||"");
      const state=templateStateSnapshot(id),seq=hydrateSeq;
      if(id){window.tplGetRecord?.(id).then(rec=>{if(rec&&seq===hydrateSeq)scheduleRemote(id,rec,350,state)}).catch(()=>{})}
      return result;
    };
  }

  window.addEventListener("matrix-board-room",event=>{
    const next=String(event.detail?.roomId||"");if(!next)return;
    lastLogId=next;
    if(hydratedLogId!==next){hydrated=false;hydratedLogId=""}
    hydrate(next).catch(()=>{});
  });

  window.addEventListener("matrix-board-active",()=>{
    const logId=currentLogId();
    if(logId&&(!hydrated||hydratedLogId!==logId))hydrate(logId).catch(()=>{});

  });

  window.addEventListener("matrix-board-comments-changed",event=>{
    if(["matrix-template-state","matrix-change"].includes(event.detail?.action)){rehydrateQueued=true;refreshWhenIdle()}
  });

  window.addEventListener("pagehide",()=>{
    for(const [key,timer] of saveTimers){clearTimeout(timer);saveTimers.delete(key);putRemote(key)}
  });

  const initialLogId=currentLogId();
  if(initialLogId)hydrate(initialLogId).catch(()=>{});
})();

(async()=>{
  if(!await (async()=>{for(let i=0;i<80;i++){if(typeof window.saveTemplateFile==="function")return true;await new Promise(r=>setTimeout(r,50))}return false})())return;
  if(window.saveTemplateFile.__jijinTemplateCompressed||window.saveTemplateFile.__jijinTemplateOptimized)return;
  const raw=window.saveTemplateFile,MAX_SIDE=2560,QUALITY=.86;
  async function compress(file){
    if(!(file instanceof Blob)||!String(file.type||"").startsWith("image/")||typeof createImageBitmap!=="function")return file;
    let bitmap;
    try{
      bitmap=await createImageBitmap(file);
      const scale=Math.min(1,MAX_SIDE/Math.max(bitmap.width,bitmap.height)),w=Math.max(1,Math.round(bitmap.width*scale)),h=Math.max(1,Math.round(bitmap.height*scale)),canvas=document.createElement("canvas");
      canvas.width=w;canvas.height=h;
      const ctx=canvas.getContext("2d",{alpha:true});ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";ctx.drawImage(bitmap,0,0,w,h);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/webp",QUALITY));if(!blob)return file;
      const name=(String(file.name||"template").replace(/\.[^.]+$/,"")||"template")+".webp";
      return new File([blob],name,{type:"image/webp",lastModified:file.lastModified||Date.now()});
    }catch{return file}finally{try{bitmap?.close?.()}catch{}}
  }
  const wrapped=async function(file,...args){return raw.call(this,await compress(file),...args)};
  wrapped.__jijinTemplateCompressed=true;window.saveTemplateFile=wrapped;
})();
