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
    let cache,key,cached;
    try{
      // Do not let unavailable storage block a network request.
      const hit=await Promise.race([(async()=>{const c=await caches.open(cacheName),k=await keyFor(request);return {cache:c,key:k,cached:await c.match(k)}})(),new Promise(resolve=>setTimeout(()=>resolve(null),60))]);
      if(hit)({cache,key,cached}=hit);
    }catch{}
    const refresh=async()=>{
      const response=await network(input,options);
      try{
        cache||=await caches.open(cacheName);key||=await keyFor(request);
        if(response.ok){
          let changed=false;
          if(cached&&response.headers.get("content-type")?.includes("application/json"))changed=await cached.clone().text()!==await response.clone().text();
          await cache.put(key,response.clone());
          if(changed)window.dispatchEvent(new CustomEvent("jijinboard-cache-updated",{detail:{url:request.url}}));
        }else if([401,403,404,410].includes(response.status))await cache.delete(key);
      }catch{}
      return response;
    };
    if(cached&&!["reload","no-store","no-cache"].includes(request.cache)){refresh().catch(()=>{});return cached}
    return refresh();
  };
})();
