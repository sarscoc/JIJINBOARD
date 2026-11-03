'use strict';
(()=>{
 const boardId=new URL(location.href).searchParams.get('id');if(!boardId)return;
 const endpoint=`/api/boards/${encodeURIComponent(boardId)}/home-image`;
 let sequence=0,currentUrl='',currentBlob=null;
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
 async function remember(blob,target){
  const token=++sequence;
  const shown=await paint(blob,target,token);
  cache().then(store=>store?.put(endpoint,new Response(blob))).catch(()=>{});
  return shown;
 }
 async function show(target){
  if(!window.caches||!URL.createObjectURL)return new Promise(resolve=>{target.addEventListener('load',()=>resolve(true),{once:true});target.addEventListener('error',()=>resolve(false),{once:true});target.src=endpoint});
  const token=++sequence;
  let shown=false;
  if(currentBlob)shown=await paint(currentBlob,target,token);
  const saved=await bounded(cache().then(store=>store?.match(endpoint)).then(response=>response?.blob()).catch(()=>null),100);
  if(saved&&token===sequence)shown=await paint(saved,target,token)||shown;
  const fresh=(async()=>{
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
   try{
    const response=await fetch(endpoint,{cache:'no-cache',signal:controller.signal});
    if(token!==sequence)return shown;
    if(response.status===404){
     cache().then(store=>store?.delete(endpoint)).catch(()=>{});
     target.classList.add('hidden');document.getElementById('boardHomeEmpty')?.classList.remove('hidden');
     currentBlob=null;if(currentUrl)URL.revokeObjectURL(currentUrl);currentUrl='';return false;
    }
    if(!response.ok)return shown;
    const blob=await response.blob();if(token!==sequence)return shown;
    const ok=await paint(blob,target,token);
    if(ok)cache().then(store=>{if(token===sequence)return store?.put(endpoint,new Response(blob))}).catch(()=>{});
    return ok||shown;
   }catch{return shown}finally{clearTimeout(timer)}
  })();
  return shown?true:fresh;
 }
 window.JijinHomeImage={show,remember};
})();
