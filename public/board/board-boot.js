'use strict';
// The initial room view is deliberately staged: name -> screenshot -> PL -> logs.
(()=>{
 const boardId=new URL(location.href).searchParams.get('id');if(!boardId)return;
 let finishImage,finishProfile;
 const image=new Promise(resolve=>finishImage=resolve),profile=new Promise(resolve=>finishProfile=resolve);
 const title=(async()=>{
  await window.JijinDataset?.ready;
  const response=await fetch(`/api/boards/${encodeURIComponent(boardId)}?summary=1`,{cache:'no-store',priority:'high'});
  const data=await response.json();if(!response.ok)throw Error(data.error||'部屋名を取得できませんでした');
  if(!data.name)throw Error('部屋名がありません');
  return data;
 })();
 title.catch(()=>{});
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
 window.JijinBoardReady={title,image,profile,startImage,finishProfile};
})();
