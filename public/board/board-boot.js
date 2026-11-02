'use strict';
// The initial room view is deliberately staged: name -> screenshot -> PL -> logs.
(()=>{
 const boardId=new URL(location.href).searchParams.get('id');if(!boardId)return;
 let finishImage,finishProfile;
 const image=new Promise(resolve=>finishImage=resolve),profile=new Promise(resolve=>finishProfile=resolve);
 const cacheKey=`board:${encodeURIComponent(boardId)}:title`;
 async function request(path,priority){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  try{
   const response=await fetch(path,{cache:'no-store',priority,signal:controller.signal});
   const data=await response.json();if(!response.ok)throw Error(data.error||'部屋情報を取得できませんでした');
   return data;
  }finally{clearTimeout(timer)}
 }
 const freshTitle=(async()=>{
  await window.JijinDataset?.ready;
  const data=await request(`/api/boards/${encodeURIComponent(boardId)}?summary=1`,'high');
  if(!data.name)throw Error('部屋名がありません');
  try{localStorage.setItem(cacheKey,JSON.stringify({generation:localStorage.getItem('jijin.dataset.generation.v1'),data}))}catch{}
  const label=document.getElementById('boardName');if(label)label.textContent=data.name;
  document.title=`${data.name} | JIJINBOARD`;
  return data;
 })();
 const title=(async()=>{
  await window.JijinDataset?.ready;
  try{
   const saved=JSON.parse(localStorage.getItem(cacheKey)||'null');
   if(saved?.generation===localStorage.getItem('jijin.dataset.generation.v1')&&saved?.data?.id===boardId&&saved.data.name)return saved.data;
  }catch{}
  return freshTitle;
 })();
 // Fetch in parallel; the board still reveals name -> image -> PL -> logs.
 const boardData=(async()=>{
  await window.JijinDataset?.ready;
  return request(`/api/boards/${encodeURIComponent(boardId)}`,'low');
 })();
 title.catch(()=>{});freshTitle.catch(()=>{});boardData.catch(()=>{});
 let started=false;
 function startImage(){
  if(started)return;started=true;
  title.then(data=>{
   const label=document.getElementById('boardName');if(label)label.textContent=data.name;
   document.title=`${data.name} | JIJINBOARD`;
   const target=document.getElementById('boardHomeImage'),empty=document.getElementById('boardHomeEmpty');
   if(!target){finishImage(false);return}
   let settled=false;
   const complete=ok=>{
    if(settled)return;settled=true;clearTimeout(timer);
    target.classList.toggle('hidden',!ok);empty?.classList.toggle('hidden',ok);
    // Allow the browser to paint the name/image before initializing the next stage.
    requestAnimationFrame(()=>requestAnimationFrame(()=>finishImage(ok)));
   };
   const timer=setTimeout(()=>complete(false),8000);
   target.loading='eager';target.fetchPriority='high';target.decoding='async';
   target.onload=()=>complete(true);target.onerror=()=>complete(false);
   target.src=`/api/boards/${encodeURIComponent(boardId)}/home-image`;
   if(target.complete&&target.naturalWidth)complete(true);
  }).catch(()=>finishImage(false));
 }
 window.JijinBoardReady={title,boardData,image,profile,startImage,finishProfile};
})();
