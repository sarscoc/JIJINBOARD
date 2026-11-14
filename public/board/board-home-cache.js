'use strict';
(()=>{
 const boardId=new URL(location.href).searchParams.get('id');if(!boardId)return;
 const endpoint=`/api/boards/${encodeURIComponent(boardId)}/home-image`;
 let sequence=0,currentUrl='',currentBlob=null,currentVersion='';
 const bounded=(promise,ms)=>Promise.race([promise,new Promise(resolve=>setTimeout(()=>resolve(null),ms))]);
 async function cache(){
  await window.JijinDataset?.ready;
  const generation=localStorage.getItem('jijin.dataset.generation.v1')||'initial';
  return window.caches?.open(`jijin-home-images:${generation}`);
 }
 async function paint(blob,target,token){
  if(token!==sequence)return false;
  if(blob===currentBlob&&currentUrl){target.src=currentUrl;return true}
  const url=URL.createObjectURL(blob),probe=new Image();probe.src=url;
  try{await probe.decode()}catch{URL.revokeObjectURL(url);return false}
  if(token!==sequence){URL.revokeObjectURL(url);return false}
  const previous=currentUrl;currentUrl=url;currentBlob=blob;target.src=url;
  target.classList.remove('hidden');document.getElementById('boardHomeEmpty')?.classList.add('hidden');
  if(previous)URL.revokeObjectURL(previous);return true;
 }
 async function remember(blob,target,version=''){
  const token=++sequence;
  const shown=await paint(blob,target,token);
  if(shown){currentVersion=version;cache().then(store=>{if(token===sequence)return store?.put(endpoint,new Response(blob,{headers:{etag:version}}))}).catch(()=>{})}
  return shown;
 }
 async function show(target,{verify=false,version=''}={}){
  if(!window.caches||!URL.createObjectURL)return new Promise(resolve=>{target.addEventListener('load',()=>resolve(true),{once:true});target.addEventListener('error',()=>resolve(false),{once:true});target.src=endpoint});
  const token=++sequence;
  let shown=false;
  if(currentBlob)shown=await paint(currentBlob,target,token);
  const saved=await bounded(cache().then(store=>store?.match(endpoint)).catch(()=>null),100);
  if(saved&&token===sequence&&!shown){
   shown=await paint(await saved.blob(),target,token);
   if(shown)currentVersion=saved.headers.get('etag')||'';
  }
  if(shown&&(!verify||(version&&currentVersion===version)))return true;
  const fresh=(async()=>{
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
   try{
    const response=await fetch(endpoint,{cache:'no-store',headers:currentVersion?{'If-None-Match':currentVersion}:{},signal:controller.signal});
    if(token!==sequence)return shown;
    if(response.status===304)return shown;
    if(response.status===404){
     cache().then(store=>store?.delete(endpoint)).catch(()=>{});
     target.classList.add('hidden');document.getElementById('boardHomeEmpty')?.classList.remove('hidden');
     currentBlob=null;currentVersion='';if(currentUrl)URL.revokeObjectURL(currentUrl);currentUrl='';return false;
    }
    if(!response.ok)return shown;
    const blob=await response.blob();if(token!==sequence)return shown;
    const ok=await paint(blob,target,token);
    if(ok){currentVersion=response.headers.get('etag')||'';cache().then(store=>{if(token===sequence)return store?.put(endpoint,new Response(blob,{headers:{etag:currentVersion}}))}).catch(()=>{})}
    return ok||shown;
   }catch{return shown}finally{clearTimeout(timer)}
  })();
  return shown?true:fresh;
 }
 window.JijinHomeImage={show,remember};
})();
