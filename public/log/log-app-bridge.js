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
    setDisplayMode(displayMode){localMessage({type:"jijinboard-set-room-theme",displayMode:displayMode==="dark"?"dark":"light"})},
    getRoomId(){try{return typeof state!=="undefined"?String(state.roomId||""):""}catch{return""}},
    destroy(){try{window.disconnectRealtime?.()}catch{}},
  };
  Object.defineProperty(window,"JIJINBOARD_LOG_APP",{value:Object.freeze(bridge),configurable:true});
})();