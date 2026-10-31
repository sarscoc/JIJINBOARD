(()=>{
  "use strict";
  function reveal(){
    const panel=document.querySelector('#sheetComments');
    if(!panel)return false;
    panel.hidden=false;
    panel.removeAttribute('hidden');
    return true;
  }
  if(!reveal()){
    const observer=new MutationObserver(()=>{if(reveal())observer.disconnect()});
    observer.observe(document.body,{childList:true,subtree:false});
    setTimeout(()=>{reveal();observer.disconnect()},3000);
  }
  window.addEventListener('pageshow',reveal,{passive:true});
})();
