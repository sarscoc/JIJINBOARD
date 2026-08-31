"use strict";

(async()=>{
  const params=new URL(location.href).searchParams,board=params.get('board')||'';if(!board)return;
  for(let i=0;i<100;i++){
    if(typeof window.saveImageBlob==='function'&&typeof window.loadImageBlob==='function'&&typeof window.deleteImageBlob==='function')break;
    await new Promise(resolve=>setTimeout(resolve,40));
  }
  if(typeof window.saveImageBlob!=='function'||window.saveImageBlob.__jijinRemoteImageSync)return;

  const rawSave=window.saveImageBlob,rawLoad=window.loadImageBlob,rawDelete=window.deleteImageBlob;
  const checked=new Set(),pending=new Map();
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
    const key=remoteKey(partId,charId);if(pending.has(key))return pending.get(key);
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
    await rawSave.call(this,partId,charId,compressed);
    try{await uploadRemote(partId,charId,compressed);checked.add(key);window.jijinSpreadsheetNotifyChange?.('spreadsheet-image')}catch(error){console.warn('Spreadsheet image upload failed',error)}
  };
  syncedSave.__jijinRemoteImageSync=true;
  syncedSave.__jijinRaw=rawSave;
  window.saveImageBlob=syncedSave;

  window.loadImageBlob=async function(partId,charId){
    const key=remoteKey(partId,charId);
    if(!checked.has(key)){
      try{
        const remote=await fetchRemote(partId,charId);checked.add(key);
        if(remote){await rawSave.call(this,partId,charId,remote);return remote}
        const local=await rawLoad.call(this,partId,charId);
        if(local){const compressed=await compressImage(local);await rawSave.call(this,partId,charId,compressed);uploadRemote(partId,charId,compressed).then(()=>window.jijinSpreadsheetNotifyChange?.('spreadsheet-image')).catch(error=>console.warn('Spreadsheet image migration failed',error));return compressed}
        return null;
      }catch(error){console.warn('Spreadsheet image download failed',error)}
    }
    return rawLoad.call(this,partId,charId);
  };

  window.deleteImageBlob=async function(partId,charId){
    const key=remoteKey(partId,charId);await rawDelete.call(this,partId,charId);checked.add(key);
    try{const response=await fetch(endpoint(partId,charId),{method:'DELETE'});if(!response.ok&&response.status!==404)throw new Error(`画像削除エラー (${response.status})`);window.jijinSpreadsheetNotifyChange?.('spreadsheet-image')}catch(error){console.warn('Spreadsheet image delete failed',error)}
  };

  window.addEventListener('jijinboard-spreadsheet-remote-change',event=>{if(event.detail?.action==='spreadsheet-image')checked.clear()});
})();
