"use strict";

(async()=>{
  const params=new URL(location.href).searchParams,board=params.get('board')||'';if(!board)return;
  for(let i=0;i<100;i++){
    if(typeof window.saveImageBlob==='function'&&typeof window.loadImageBlob==='function'&&typeof window.deleteImageBlob==='function')break;
    await new Promise(resolve=>setTimeout(resolve,40));
  }
  if(typeof window.saveImageBlob!=='function'||window.saveImageBlob.__jijinRemoteImageSync)return;

  const rawSave=window.saveImageBlob,rawLoad=window.loadImageBlob,rawDelete=window.deleteImageBlob;
  const checked=new Set(),pending=new Map(),memory=new Map(),revisions=new Map(),uploading=new Map();let epoch=0;
  const stamp=key=>`${epoch}:${revisions.get(key)||0}`;
  const mutate=key=>revisions.set(key,(revisions.get(key)||0)+1);
  const invalidate=()=>{epoch++;checked.clear()};
  const persist=(fn,...args)=>{Promise.resolve().then(()=>fn(...args)).catch(error=>console.warn('Spreadsheet image cache write skipped',error))};
  const remoteKey=(partId,charId)=>`${partId}::${charId}`;
  function mapTarget(partId,charId){
    if(partId==='background'&&charId==='global')return{type:'global_background',target:'global'};
    if(partId==='character-background')return{type:'character_background',target:String(charId||'')};
    return{type:'cell_image',target:`${partId}::${charId}`};
  }
  const endpoint=(partId,charId)=>{const mapped=mapTarget(partId,charId);return `/api/boards/${encodeURIComponent(board)}/spreadsheet/image?type=${encodeURIComponent(mapped.type)}&target=${encodeURIComponent(mapped.target)}`};

  async function compressImage(file){
    if(!(file instanceof Blob)||!String(file.type||'').startsWith('image/'))return file;
    const type=String(file.type||'').toLowerCase();
    if(type==='image/gif'||type==='image/svg+xml'||typeof createImageBitmap!=='function')return file;
    let bitmap=null;
    try{
      bitmap=await createImageBitmap(file);
      const maxSide=2560,sourceW=Math.max(1,bitmap.width||1),sourceH=Math.max(1,bitmap.height||1),scale=Math.min(1,maxSide/Math.max(sourceW,sourceH));
      const width=Math.max(1,Math.round(sourceW*scale)),height=Math.max(1,Math.round(sourceH*scale)),canvas=document.createElement('canvas');
      canvas.width=width;canvas.height=height;
      const ctx=canvas.getContext('2d',{alpha:true});if(!ctx)return file;
      ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(bitmap,0,0,width,height);
      let quality=.86,best=null;
      for(let i=0;i<5;i++){
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));if(!blob)break;
        best=blob;if(blob.size<=1_200_000)break;quality=Math.max(.58,quality-.07);
      }
      if(!best)return file;
      if(scale===1&&file.size&&best.size>=file.size)return file;
      try{return new File([best],String(file.name||'image').replace(/\.[^.]+$/,'')+'.webp',{type:'image/webp',lastModified:file.lastModified||Date.now()})}catch{return best}
    }catch(error){console.warn('Spreadsheet image compression skipped',error);return file}
    finally{try{bitmap?.close?.()}catch{}}
  }

  async function uploadRemote(partId,charId,file){
    const response=await fetch(endpoint(partId,charId),{method:'PUT',headers:{'content-type':file.type||'application/octet-stream'},body:file});
    if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.error||`画像同期エラー (${response.status})`)}
  }
  async function fetchRemote(partId,charId){
    const key=stamp(remoteKey(partId,charId))+':'+remoteKey(partId,charId);if(pending.has(key))return pending.get(key);
    const task=(async()=>{
      const response=await fetch(endpoint(partId,charId),{cache:'no-store'});
      if(response.status===404)return null;
      if(!response.ok)throw new Error(`画像同期エラー (${response.status})`);
      return await response.blob();
    })();
    pending.set(key,task);try{return await task}finally{pending.delete(key)}
  }

  const syncedSave=async function(partId,charId,file){
    const compressed=await compressImage(file),key=remoteKey(partId,charId);
    mutate(key);memory.set(key,compressed);const upload={file:compressed,revision:revisions.get(key)};uploading.set(key,upload);
    persist(rawSave.bind(this),partId,charId,compressed);
    try{await uploadRemote(partId,charId,compressed);checked.add(key)}catch(error){console.warn('Spreadsheet image upload failed',error);throw error}finally{if(uploading.get(key)===upload)uploading.delete(key)}
  };
  syncedSave.__jijinRemoteImageSync=true;
  syncedSave.__jijinRaw=rawSave;
  window.saveImageBlob=syncedSave;

  async function sameImage(a,b){
    if(a===b)return true;
    if(!a||!b||a.size!==b.size||a.type!==b.type)return false;
    if(!a.arrayBuffer||!b.arrayBuffer)return false;
    const [left,right]=await Promise.all([a.arrayBuffer(),b.arrayBuffer()]);
    const x=new Uint8Array(left),y=new Uint8Array(right);
    return x.length===y.length&&x.every((value,index)=>value===y[index]);
  }
  const validating=new Map(),previews=new Map();
  function previewUrl(partId,charId,blob=memory.get(remoteKey(partId,charId))){
    const key=remoteKey(partId,charId);if(!blob)return '';
    const old=previews.get(key);if(old?.blob===blob)return old.url;
    const url=URL.createObjectURL(blob);previews.set(key,{blob,url});
    if(old)requestAnimationFrame(()=>URL.revokeObjectURL(old.url));
    return url;
  }
  window.JijinSheetImageCache={peek:(partId,charId)=>memory.get(remoteKey(partId,charId)),url:previewUrl};
  function verifyImage(partId,charId,started){
    const key=remoteKey(partId,charId),flight=started+':'+key;
    if(uploading.get(key)?.revision===revisions.get(key)&&uploading.has(key))return Promise.resolve(uploading.get(key).file);
    if(validating.has(flight))return validating.get(flight);
    const task=(async()=>{
      const remote=await fetchRemote(partId,charId);
      if(started!==stamp(key))return window.loadImageBlob(partId,charId);
      const existed=memory.has(key),previous=memory.get(key),unchanged=existed&&await sameImage(previous,remote);
      if(started!==stamp(key))return window.loadImageBlob(partId,charId);
      checked.add(key);memory.set(key,unchanged?previous:remote);
      if(!unchanged){if(remote)persist(rawSave,partId,charId,remote);else persist(rawDelete,partId,charId)}
      if(existed&&!unchanged){
        const detail={partId,charId};
        window.dispatchEvent(new CustomEvent('jijinboard-local-image-updated',{detail}));
        refreshVisibleImages(detail);
      }
      return memory.get(key);
    })().finally(()=>validating.delete(flight));
    validating.set(flight,task);return task;
  }
  window.loadImageBlob=async function(partId,charId){
    const key=remoteKey(partId,charId),started=stamp(key);
    if(memory.has(key)){
      if(!checked.has(key))verifyImage(partId,charId,started).catch(error=>console.warn('Spreadsheet image verification deferred',error));
      return memory.get(key);
    }
    let timer,local=null;
    try{
      local=await Promise.race([rawLoad.call(this,partId,charId),new Promise(resolve=>timer=setTimeout(()=>resolve(null),40))]);
    }catch{}finally{clearTimeout(timer)}
    if(started!==stamp(key))return window.loadImageBlob(partId,charId);
    if(local){
      memory.set(key,local);
      verifyImage(partId,charId,started).catch(error=>console.warn('Spreadsheet image verification deferred',error));
      return local;
    }
    try{return await verifyImage(partId,charId,started)}
    catch(error){console.warn('Spreadsheet image download failed',error);return null}
  };

  window.deleteImageBlob=async function(partId,charId){
    const key=remoteKey(partId,charId);mutate(key);memory.set(key,null);persist(rawDelete.bind(this),partId,charId);checked.add(key);
    try{const response=await fetch(endpoint(partId,charId),{method:'DELETE'});if(!response.ok&&response.status!==404)throw new Error(`画像削除エラー (${response.status})`)}catch(error){console.warn('Spreadsheet image delete failed',error)}
  };

  function refreshVisibleImages(changed=null){
    // Never rebuild the table for an image refresh. Keep visible bytes until replaced.
    if(!changed||changed.partId==='background')Promise.resolve(window.applyGlobalBackgroundImage?.()).catch(console.warn);
    if(!changed||changed.partId==='character-background')try{window.syncAllVisibleCharacterDesigns?.()}catch(error){console.warn(error)}
    const roots=changed?[...document.querySelectorAll('[data-image-host]')].filter(host=>host.dataset.imageHost===changed.partId&&host.dataset.imageChar===String(changed.charId)):[document];
    for(const root of roots)Promise.resolve(window.hydrateImageParts?.(root)).catch(console.warn);
  }
  window.addEventListener('jijinboard-spreadsheet-reconnected',()=>{invalidate();refreshVisibleImages()});
  window.addEventListener('jijinboard-spreadsheet-remote-change',event=>{
    if(event.detail?.action!=='spreadsheet-image')return;
    invalidate();
    setTimeout(()=>refreshVisibleImages(),0);
  });
})();

