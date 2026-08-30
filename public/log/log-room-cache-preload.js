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
  let deferredAnnotations=false,installDone=false,loadingChunk=false;
  const jsonResponse=data=>new Response(JSON.stringify(data),{status:200,headers:{"content-type":"application/json; charset=utf-8"}});
  const streamPath=(roomId,suffix)=>`/api/rooms/${encodeURIComponent(roomId)}/stream/${suffix}`;

  async function firstStreamedRoom(roomId){
    const cached=parentCache?.get(roomId);
    if(cached?.stream?.streamed&&Array.isArray(cached.messages)){
      await new Promise(resolve=>setTimeout(resolve,0));
      return cached;
    }
    try{
      const [metaResponse,chunkResponse]=await Promise.all([
        nativeFetch(streamPath(roomId,"meta")),
        nativeFetch(streamPath(roomId,"chunk/0"))
      ]);
      if(!metaResponse.ok||!chunkResponse.ok)throw new Error("stream unavailable");
      const meta=await metaResponse.json(),chunk=await chunkResponse.json();
      const room={
        id:meta.id||roomId,
        title:meta.title||"TRPG LOG",
        createdAt:meta.createdAt||"",
        tabs:Array.isArray(meta.tabs)?meta.tabs:[],
        messages:Array.isArray(chunk.messages)?chunk.messages:[],
        stream:{streamed:true,chunkSize:Number(meta.chunkSize)||250,chunkCount:Math.max(1,Number(chunk.chunkCount||meta.chunkCount)||1),messageCount:Number(chunk.messageCount||meta.messageCount)||0,loaded:[0]}
      };
      parentCache?.set(roomId,room);
      return room;
    }catch(error){
      console.warn("Chunked log first paint fallback",error);
      const response=await nativeFetch(`/api/rooms/${encodeURIComponent(roomId)}`);
      if(!response.ok)return null;
      return response.json();
    }
  }

  window.fetch=async function(input,init={}){
    const request=input instanceof Request?input:null;
    const method=String(init?.method||request?.method||"GET").toUpperCase();
    let url;
    try{url=new URL(typeof input==="string"?input:request?.url||String(input),location.href)}catch{return nativeFetch(input,init)}
    if(method!=="GET"||url.origin!==location.origin)return nativeFetch(input,init);

    const roomMatch=url.pathname.match(/^\/api\/rooms\/([^/]+)$/);
    if(roomMatch&&!url.search){
      const roomId=decodeURIComponent(roomMatch[1]);
      const room=await firstStreamedRoom(roomId);
      return room?jsonResponse(room):nativeFetch(input,init);
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
      return jsonResponse({annotations:[],version:-1,deferred:true});
    }

    return nativeFetch(input,init);
  };

  function streamState(){
    try{return state?.room?.stream?.streamed?state.room.stream:null}catch{return null}
  }
  function markChunk(messages,index){
    (messages||[]).forEach((message,offset)=>{
      try{Object.defineProperty(message,"__jijinChunk",{value:index,writable:true,configurable:true,enumerable:false});Object.defineProperty(message,"__jijinOffset",{value:offset,writable:true,configurable:true,enumerable:false})}catch{}
    });
  }
  function loadedSet(){return new Set((streamState()?.loaded||[]).map(Number).filter(Number.isFinite))}
  function nextChunkIndex(){
    const stream=streamState();if(!stream)return -1;
    const loaded=loadedSet();
    for(let index=0;index<Number(stream.chunkCount||0);index++)if(!loaded.has(index))return index;
    return -1;
  }
  function rememberRoom(){try{if(state?.room?.id)parentCache?.set(state.room.id,state.room)}catch{}}

  async function loadChunk(index,{render=true}={}){
    const stream=streamState(),roomId=state?.roomId||state?.room?.id||startupRoom;
    if(!stream||!roomId||index<0||index>=Number(stream.chunkCount||0))return false;
    const loaded=loadedSet();if(loaded.has(index))return true;
    if(loadingChunk)return false;
    loadingChunk=true;
    try{
      const response=await nativeFetch(streamPath(roomId,`chunk/${index}`));
      if(!response.ok)throw new Error(`chunk ${index}: ${response.status}`);
      const data=await response.json(),messages=Array.isArray(data.messages)?data.messages:[];
      markChunk(messages,index);
      // Existing messages from the first response do not carry private chunk marks
      // through JSON serialization, so seed chunk zero before sorting.
      const current=state.room.messages||[];
      current.forEach((message,offset)=>{if(message.__jijinChunk==null){try{Object.defineProperty(message,"__jijinChunk",{value:0,writable:true,configurable:true,enumerable:false});Object.defineProperty(message,"__jijinOffset",{value:offset,writable:true,configurable:true,enumerable:false})}catch{}}});
      const known=new Set(current.map(message=>message.id));
      current.push(...messages.filter(message=>!known.has(message.id)));
      current.sort((a,b)=>(Number(a.__jijinChunk)||0)-(Number(b.__jijinChunk)||0)||(Number(a.__jijinOffset)||0)-(Number(b.__jijinOffset)||0));
      stream.loaded=[...loaded,index].sort((a,b)=>a-b);
      stream.chunkCount=Math.max(Number(stream.chunkCount)||1,Number(data.chunkCount)||1);
      stream.messageCount=Math.max(Number(stream.messageCount)||0,Number(data.messageCount)||0);
      rememberRoom();
      if(render&&typeof renderLog==="function"){
        const anchor=typeof currentReadingTime==="function"?currentReadingTime():"";
        renderLog(anchor);
      }
      return true;
    }catch(error){console.warn("Log chunk load failed",error);return false}
    finally{loadingChunk=false}
  }

  async function ensureViewportBuffer(){
    const stream=streamState();if(!stream||loadingChunk)return;
    const panel=document.querySelector(`.log-page[data-track-index="${state.carouselPosition}"] .page-scroll`);
    if(!panel)return;
    const remaining=panel.scrollHeight-panel.scrollTop-panel.clientHeight;
    if(panel.scrollHeight<=panel.clientHeight*1.45||remaining<panel.clientHeight*1.6){
      const next=nextChunkIndex();if(next>=0)await loadChunk(next);
    }
  }

  function bindScrolls(){
    document.querySelectorAll(".log-page .page-scroll").forEach(scroll=>{
      if(scroll.dataset.jijinChunkStream)return;
      scroll.dataset.jijinChunkStream="1";
      scroll.addEventListener("scroll",()=>{
        if(loadingChunk)return;
        const remaining=scroll.scrollHeight-scroll.scrollTop-scroll.clientHeight;
        if(remaining<scroll.clientHeight*1.6)loadChunk(nextChunkIndex()).catch(()=>{});
      },{passive:true});
    });
    requestAnimationFrame(()=>ensureViewportBuffer().catch(()=>{}));
  }

  async function ensureMessageLoaded(messageId){
    if(!streamState()||!messageId)return false;
    if(state.room.messages.some(message=>message.id===messageId))return true;
    try{
      const response=await nativeFetch(streamPath(state.roomId||startupRoom,`find/${encodeURIComponent(messageId)}`));
      if(!response.ok)return false;
      const data=await response.json(),index=Number(data.index);
      if(!Number.isInteger(index)||index<0)return false;
      return loadChunk(index);
    }catch{return false}
  }

  async function fullRoom(room){
    if(!room?.stream?.streamed)return room;
    const response=await nativeFetch(streamPath(room.id||state.roomId||startupRoom,"full"));
    if(!response.ok)throw new Error("保存用ログ全文を取得できませんでした");
    return response.json();
  }

  function installStreamingRuntime(){
    if(installDone||typeof state==="undefined"||!state.room)return;
    installDone=true;
    if(streamState()){
      markChunk(state.room.messages||[],0);
      rememberRoom();
    }

    if(typeof renderLog==="function"&&!renderLog.__jijinChunkBound){
      const raw=renderLog;
      const wrapped=function(...args){const result=raw.apply(this,args);queueMicrotask(bindScrolls);return result};
      wrapped.__jijinChunkBound=true;renderLog=wrapped;
    }

    if(typeof jumpToMessage==="function"&&!jumpToMessage.__jijinChunkAware){
      const raw=jumpToMessage;
      const wrapped=function(id,...args){
        if(!streamState()||state.room.messages.some(message=>message.id===id))return raw.call(this,id,...args);
        ensureMessageLoaded(id).then(ok=>{if(ok)raw.call(this,id,...args)}).catch(()=>{});
      };
      wrapped.__jijinChunkAware=true;jumpToMessage=wrapped;
    }

    if(typeof downloadArchive==="function"&&!downloadArchive.__jijinFullArchive){
      const raw=downloadArchive;
      const wrapped=async function(room,...args){return raw.call(this,await fullRoom(room),...args)};
      wrapped.__jijinFullArchive=true;downloadArchive=wrapped;
    }

    const search=document.getElementById("searchInput");
    if(search&&!search.dataset.jijinFullSearch){
      search.dataset.jijinFullSearch="1";
      let searchLoad=null;
      search.addEventListener("input",()=>{
        if(!search.value.trim()||!streamState()||loadedSet().size>=Number(streamState().chunkCount||0)||searchLoad)return;
        // Searching is an explicit request across the whole log, so only then load
        // the remaining chunks. Normal reading never performs this full fetch.
        searchLoad=(async()=>{for(let index=0;index<Number(streamState().chunkCount||0);index++)if(!loadedSet().has(index))await loadChunk(index,{render:false});if(typeof renderLog==="function")renderLog(typeof currentReadingTime==="function"?currentReadingTime():"")})().finally(()=>{searchLoad=null});
      });
    }

    bindScrolls();
  }

  addEventListener("load",installStreamingRuntime,{once:true});
  queueMicrotask(()=>{if(document.readyState==="complete")installStreamingRuntime()});
})();
