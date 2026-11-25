"use strict";
(()=>{
  const localMessage=data=>{
    try{window.dispatchEvent(new MessageEvent("message",{data,origin:location.origin,source:window}))}catch{}
  };
  const bridge={
    setActive(active){
      try{if(active)window.connectRealtime?.();else window.disconnectRealtime?.()}catch{}
      localMessage({type:"jijinboard-log-active",active:!!active});
    },
    openProfile(){try{if(typeof openProfile==="function")openProfile();else localMessage({type:"jijinboard-open-profile"})}catch{}},
    requestProfile(){try{if(typeof emitIntegratedProfile==="function")emitIntegratedProfile();else localMessage({type:"jijinboard-request-profile"})}catch{}},
    setDisplayMode(displayMode){
      const mode=displayMode==="dark"?"dark":"light";
      try{
        document.documentElement.classList.toggle("dark",mode==="dark");
        document.documentElement.style.backgroundColor=mode==="dark"?"#424242":"";
        if(document.body)document.body.style.backgroundColor=mode==="dark"?"#424242":"";
        const roomId=bridge.getRoomId();
        if(roomId)localStorage.setItem(`theme:${roomId}`,mode);
      }catch{}
      localMessage({type:"jijinboard-set-room-theme",displayMode:mode});
    },
    async recover(){
      await window.JijinDataset?.retry?.();
      const id=bridge.getRoomId();if(!id)return;
      if(typeof state!=='undefined'&&!state.room&&typeof openRoom==='function')await openRoom(id);
      else if(typeof refreshAnnotations==='function')await refreshAnnotations(true);
      if(typeof state!=='undefined'&&!state.room)throw Error('ログの取得に失敗しました');
      if(typeof state!=='undefined'&&state.room)window.connectRealtime?.();
    },
    getRoomId(){try{return typeof state!=="undefined"?String(state.roomId||""):""}catch{return""}},
    destroy(){try{window.disconnectRealtime?.()}catch{}},
  };
  Object.defineProperty(window,"JIJINBOARD_LOG_APP",{value:Object.freeze(bridge),configurable:true});
})();