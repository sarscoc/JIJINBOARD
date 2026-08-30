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
  let deferredAnnotations=false,installDone=false,loadingChunk=false,fillingViewport=false;
  const jsonResponse=data=>new Response(JSON.stringify(data),{status:200,headers:{"content-type":"application/json; charset=utf-8"}});
  const streamPath=(roomId,suffix)=>`/api/rooms/${encodeURIComponent(roomId)}/stream/${suffix}`;
  const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(()=>resolve()));

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
        stream:{streamed:true,chunkSize:Number(meta.chunkSize)||120,chunkCount:Math.max(1,Number(chunk.chunkCount||meta.chunkCount)||1),messageCount:Number(chunk.messageCount||meta.messageCount)||0,loaded:[0]}
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
  function seedInitialChunkMarks(){
    const stream=streamState();
    if(!stream||!state?.room?.messages)return;
    state.room.messages.forEach((message,offset)=>{
      if(message.__jijinChunk!=null)return;
      try{Object.defineProperty(message,"__jijinChunk",{value:0,writable:true,configurable:true,enumerable:false});Object.defineProperty(message,"__jijinOffset",{value:offset,writable:true,configurable:true,enumerable:false})}catch{}
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
  function activeScroll(){
    try{return document.querySelector(`.log-page[data-track-index="${state.carouselPosition}"] .page-scroll`)||document.querySelector(".log-page .page-scroll")}catch{return null}
  }

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
      seedInitialChunkMarks();
      const current=state.room.messages||[];
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

  async function fillViewportBuffer(){
    if(fillingViewport||!streamState())return;
    fillingViewport=true;
    try{
      // Do not stop at a fixed message count. Keep reading only until the CURRENT
      // tab has roughly one visible screen plus a small buffer below it.
      for(let guard=0;guard<Math.max(1,Number(streamState()?.chunkCount)||1);guard++){
        await nextFrame();
        const panel=activeScroll();
        if(!panel)return;
        const height=Math.max(1,panel.clientHeight);
        const remaining=panel.scrollHeight-panel.scrollTop-height;
        const atInitialTop=panel.scrollTop<4;
        const enough=atInitialTop
          ? panel.scrollHeight>=height*1.32
          : remaining>=height*.62;
        if(enough)return;
        const next=nextChunkIndex();
        if(next<0)return;
        const anchor=typeof currentReadingTime==="function"?currentReadingTime():"";
        const loaded=await loadChunk(next,{render:false});
        if(!loaded)return;
        if(typeof renderLog==="function")renderLog(anchor);
      }
    }finally{fillingViewport=false}
  }

  function bindScrolls(){
    document.querySelectorAll(".log-page .page-scroll").forEach(scroll=>{
      if(scroll.dataset.jijinChunkStream)return;
      scroll.dataset.jijinChunkStream="1";
      scroll.addEventListener("scroll",()=>{
        if(!streamState()||loadingChunk||fillingViewport)return;
        const height=Math.max(1,scroll.clientHeight),remaining=scroll.scrollHeight-scroll.scrollTop-height;
        if(remaining<height*.62)fillViewportBuffer().catch(()=>{});
      },{passive:true});
    });
    requestAnimationFrame(()=>fillViewportBuffer().catch(()=>{}));
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
    if(installDone||typeof state==="undefined"||typeof renderLog!=="function")return false;
    installDone=true;

    if(typeof renderLog==="function"&&!renderLog.__jijinChunkBound){
      const raw=renderLog;
      const wrapped=function(...args){
        seedInitialChunkMarks();
        if(streamState())rememberRoom();
        const result=raw.apply(this,args);
        queueMicrotask(bindScrolls);
        return result;
      };
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
        searchLoad=(async()=>{
          for(let index=0;index<Number(streamState().chunkCount||0);index++)if(!loadedSet().has(index))await loadChunk(index,{render:false});
          if(typeof renderLog==="function")renderLog(typeof currentReadingTime==="function"?currentReadingTime():"");
        })().finally(()=>{searchLoad=null});
      });
    }

    // openRoom() is asynchronous and may finish after window.load. The renderLog
    // wrapper above is therefore installed before state.room exists; its first real
    // render starts viewport filling at exactly the right time.
    if(streamState()){
      seedInitialChunkMarks();
      rememberRoom();
      bindScrolls();
    }
    return true;
  }

  addEventListener("load",installStreamingRuntime,{once:true});
  queueMicrotask(()=>{if(document.readyState==="complete")installStreamingRuntime()});
})();
