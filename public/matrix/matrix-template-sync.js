"use strict";

(()=>{
  const params=new URL(location.href).searchParams,boardId=params.get("board")||"",logId=params.get("room")||"";
  if(!boardId||!logId)return;
  let applying=false,hydrated=false,hydrating=false;
  const waitForGlobals=async()=>{for(let i=0;i<80;i++){if(typeof window.tplSetRecord==="function"&&typeof window.tplAllRecords==="function"&&typeof window.templateStates==="function"&&typeof window.setTemplateStates==="function"&&window.matrixBoardContext)return true;await new Promise(r=>setTimeout(r,50))}return false};
  const endpoint=id=>`/api/boards/${encodeURIComponent(boardId)}/matrix/${encodeURIComponent(logId)}/templates${id?`/${encodeURIComponent(id)}`:""}`;
  const profile=()=>window.matrixBoardContext?.profile?.()||null;
  const api=(path,options={})=>window.matrixBoardContext.api(path,options);

  // board-integration's point API is created earlier, but it resolves global fetch
  // at call time. Add the current template id to every point PATCH without changing
  // the existing MATRIX UI code.
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

  async function putRemote(id,record){
    if(applying||!hydrated||!id||!record)return;
    const me=profile();if(!me?.id||!me?.plName)return;
    const states=window.templateStates()||{},templateState=states[id]&&typeof states[id]==="object"?states[id]:{};
    try{
      const result=await api(endpoint(id),{method:"PUT",body:JSON.stringify({authorId:me.id,authorName:me.plName,record,templateState})});
      if(result?.record){applying=true;try{await rawSet(id,{...record,...result.record})}finally{applying=false}}
      window.matrixBoardContext?.notifyChange?.("matrix-template-state",{templateId:id});
    }catch(error){console.warn("MATRIX template sync failed",error)}
  }

  const rawSet=window.tplSetRecord;
  const wrappedSet=async function(id,record,...rest){
    const result=await rawSet.call(this,id,record,...rest);
    if(!applying)queueMicrotask(()=>putRemote(String(id||""),record));
    return result;
  };
  wrappedSet.__jijinTemplateRemoteSync=true;
  window.tplSetRecord=wrappedSet;

  async function hydrate(){
    if(hydrating)return;
    hydrating=true;
    try{
      const result=await api(endpoint("")),remote=Array.isArray(result?.templates)?result.templates:[],local=await window.tplAllRecords(),localMap=new Map(local.map(rec=>[String(rec?.id||""),rec]));
      if(remote.length){
        const states=window.templateStates()||{};
        applying=true;
        try{
          for(const item of remote){const rec=item?.record;if(!rec?.id)continue;await rawSet(rec.id,rec);states[rec.id]=item?.templateState&&typeof item.templateState==="object"?item.templateState:{};localMap.delete(String(rec.id))}
          window.setTemplateStates(states);
        }finally{applying=false}
        try{await window.renderTemplateTabs?.();await window.restoreTemplate?.()}catch{}
      }else if(local.length){
        hydrated=true;
        for(const rec of local)await putRemote(String(rec?.id||""),rec);
      }
    }catch(error){console.warn("MATRIX template hydrate failed",error)}finally{hydrated=true;hydrating=false}
  }

  const rawDelete=window.deleteSavedTemplate;
  if(typeof rawDelete==="function"){
    window.deleteSavedTemplate=async function(id,...rest){
      const key=String(id||""),result=await rawDelete.call(this,id,...rest);if(!key)return result;
      let remains=false;try{remains=!!(await window.tplGetRecord?.(key))}catch{}
      if(!remains){const me=profile();if(me?.id)api(endpoint(key),{method:"DELETE",body:JSON.stringify({authorId:me.id})}).then(()=>window.matrixBoardContext?.notifyChange?.("matrix-template-state",{templateId:key})).catch(error=>console.warn("MATRIX template delete sync failed",error))}
      return result;
    };
  }

  const rawSaveTemplateState=window.saveCurrentTemplateState;
  if(typeof rawSaveTemplateState==="function"){
    window.saveCurrentTemplateState=function(...args){const result=rawSaveTemplateState.apply(this,args);const id=window.currentTemplateId?.();if(id&&hydrated)window.tplGetRecord?.(id).then(rec=>rec&&putRemote(id,rec)).catch(()=>{});return result};
  }

  window.addEventListener("matrix-board-comments-changed",event=>{if(event.detail?.action==="matrix-template-state")hydrate().catch(()=>{})});
  hydrate();
})();

(async()=>{
  if(!await (async()=>{for(let i=0;i<80;i++){if(typeof window.saveTemplateFile==="function")return true;await new Promise(r=>setTimeout(r,50))}return false})())return;
  if(window.saveTemplateFile.__jijinTemplateCompressed)return;
  const raw=window.saveTemplateFile,MAX_SIDE=2560,QUALITY=.86;
  async function compress(file){
    if(!(file instanceof Blob)||!String(file.type||"").startsWith("image/")||typeof createImageBitmap!=="function")return file;
    let bitmap;try{
      bitmap=await createImageBitmap(file);const scale=Math.min(1,MAX_SIDE/Math.max(bitmap.width,bitmap.height)),w=Math.max(1,Math.round(bitmap.width*scale)),h=Math.max(1,Math.round(bitmap.height*scale)),canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;const ctx=canvas.getContext("2d",{alpha:true});ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";ctx.drawImage(bitmap,0,0,w,h);const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/webp",QUALITY));if(!blob)return file;const name=(String(file.name||"template").replace(/\.[^.]+$/,"")||"template")+".webp";return new File([blob],name,{type:"image/webp",lastModified:file.lastModified||Date.now()})
    }catch{return file}finally{try{bitmap?.close?.()}catch{}}
  }
  const wrapped=async function(file,...args){return raw.call(this,await compress(file),...args)};wrapped.__jijinTemplateCompressed=true;window.saveTemplateFile=wrapped;
})();
