"use strict";
(()=>{
  if(!window.caches||!window.crypto?.subtle)return;
  const network=window.fetch.bind(window),cacheName="jijinboard-api-data-v1";
  async function keyFor(request){
    let profile="";try{profile=JSON.parse(localStorage.getItem("trpgMarkerProfile")||"null")?.id||""}catch{}
    const identity=[profile,request.headers.get("authorization")||"",request.headers.get("x-board-admin-token")||"",request.headers.get("x-admin-token")||""].join("|");
    const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(identity));
    const url=new URL(request.url);url.searchParams.set("__browserCacheIdentity",Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,"0")).join(""));
    return new Request(url.href);
  }
  window.fetch=async function(input,options){
    const request=new Request(input,options),url=new URL(request.url);
    if(request.method!=="GET"||url.origin!==location.origin||!url.pathname.startsWith("/api/")||url.pathname.includes("realtime"))return network(input,options);
    // Network always owns shared state; cached data is only an offline fallback.
    let response;
    try{response=await network(input,options)}catch(error){
      if(request.signal.aborted||error?.name==="AbortError")throw error;
      try{const cache=await caches.open(cacheName),cached=await cache.match(await keyFor(request));if(cached)return cached}catch{}
      throw error;
    }
    if(response.ok){
      const copy=response.clone();
      (async()=>{try{const cache=await caches.open(cacheName);await cache.put(await keyFor(request),copy)}catch{}})();
    }else if([401,403,404,410].includes(response.status)){
      (async()=>{try{const cache=await caches.open(cacheName);await cache.delete(await keyFor(request))}catch{}})();
    }
    return response;
  };
})();
