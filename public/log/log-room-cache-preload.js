"use strict";
(()=>{
  const params=new URL(location.href).searchParams;
  const startupRoom=params.get("room")||"";
  if(!startupRoom)return;

  let parentCache=null;
  if(params.get("embedded")==="1"&&parent!==window){
    try{
      if(!(parent.__jijinLogRoomCache instanceof Map))parent.__jijinLogRoomCache=new Map();
      parentCache=parent.__jijinLogRoomCache;
    }catch{}
  }

  const nativeFetch=window.fetch.bind(window);
  let deferredAnnotations=false;
  const jsonResponse=data=>new Response(JSON.stringify(data),{status:200,headers:{"content-type":"application/json; charset=utf-8"}});

  window.fetch=async function(input,init={}){
    const request=input instanceof Request?input:null;
    const method=String(init?.method||request?.method||"GET").toUpperCase();
    let url;
    try{url=new URL(typeof input==="string"?input:request?.url||String(input),location.href)}catch{return nativeFetch(input,init)}
    if(method!=="GET"||url.origin!==location.origin)return nativeFetch(input,init);

    const roomMatch=url.pathname.match(/^\/api\/rooms\/([^/]+)$/);
    if(roomMatch&&!url.search){
      const roomId=decodeURIComponent(roomMatch[1]);
      const cached=parentCache?.get(roomId);
      if(cached){
        // Yield one task so the scripts after app.js (virtual log, fast indexes)
        // finish installing before openRoom continues with an in-memory response.
        await new Promise(resolve=>setTimeout(resolve,0));
        return jsonResponse(cached);
      }
      const response=await nativeFetch(input,init);
      if(response.ok&&parentCache){
        response.clone().json().then(data=>{
          if(data?.id===roomId&&Array.isArray(data.messages))parentCache.set(roomId,data);
        }).catch(()=>{});
      }
      return response;
    }

    const annotationMatch=url.pathname.match(/^\/api\/rooms\/([^/]+)\/annotations$/);
    if(annotationMatch&&!deferredAnnotations&&decodeURIComponent(annotationMatch[1])===startupRoom){
      deferredAnnotations=true;
      const background=nativeFetch(input,init);
      background.then(response=>response.ok?response.clone().json():null).then(data=>{
        if(!data)return;
        window.__jijinInitialAnnotations={roomId:startupRoom,data};
        window.dispatchEvent(new CustomEvent("jijinboard-initial-annotations",{detail:window.__jijinInitialAnnotations}));
      }).catch(()=>{});
      // The log body must not wait for COMMENTS. Keep annotationVersion at -1 so
      // reconnect/version checks can still recover if the background request fails.
      return jsonResponse({annotations:[],version:-1,deferred:true});
    }

    return nativeFetch(input,init);
  };
})();
