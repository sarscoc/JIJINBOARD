"use strict";
(()=>{
  let raf=0;
  const absolute=value=>{try{return new URL(String(value||""),location.href).href}catch{return String(value||"")}};
  function fallbackForPlaced(placed){
    const id=String(placed?.dataset?.id||"");
    if(!id||!Array.isArray(window.items))return"";
    const item=window.items.find(entry=>String(entry?.id||"")===id);
    return String(item?.imageFallback||"");
  }
  function repairImage(image){
    if(!(image instanceof HTMLImageElement))return;
    const placed=image.closest?.(".placed[data-id]");
    if(!placed)return;
    const fallback=fallbackForPlaced(placed);
    if(!fallback)return;
    image.dataset.fallbackSrc=fallback;
    const apply=()=>{
      if(image.dataset.remoteFallbackApplied==="1")return;
      const target=absolute(fallback);
      if(!target||image.src===target)return;
      image.dataset.remoteFallbackApplied="1";
      image.src=fallback;
    };
    image.addEventListener("error",apply,{once:true});
    // The global MATRIX error listener can be installed after the browser has
    // already failed an image. Repair those already-completed broken images too.
    if(image.complete&&image.naturalWidth===0)apply();
  }
  function repairPlacedImages(){
    raf=0;
    document.querySelectorAll(".placed[data-id] img").forEach(repairImage);
  }
  function schedule(){
    if(raf)return;
    raf=requestAnimationFrame(()=>requestAnimationFrame(repairPlacedImages));
  }
  const observer=new MutationObserver(schedule);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener("matrix-board-room",schedule);
  window.addEventListener("matrix-board-participants-changed",schedule);
  window.addEventListener("matrix-board-active",schedule);
  window.addEventListener("jijinboard-player-master-updated",schedule);
  addEventListener("load",schedule,{once:true});
  schedule();
})();
