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
  let deferredAnnotations=false,installDone=false,loadingChunk=false,fillingViewport=false,lastLoadedChunkMessages=[];
  const jsonResponse=data=>new Response(JSON.stringify(data),{status:200,headers:{"content-type":"application/json; charset=utf-8"}});
  const streamPath=(roomId,suffix)=>`/api/rooms/${encodeURIComponent(roomId)}/stream/${suffix}`;
  const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(()=>resolve()));
  const estimateMessageHeight=message=>{
    const length=String(message?.speaker||"").length+String(message?.text||"").length;
    return Math.max(30,30+Math.min(6,Math.floor(length/72))*18);
  };

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
  function insertChunkInSourceOrder(current,messages,index){
    if(!messages.length)return;
    if(!current.length){current.push(...messages);return}
    const lastChunk=Number(current[current.length-1]?.__jijinChunk);
    if(Number.isFinite(lastChunk)&&lastChunk<index){current.push(...messages);return}
    let insertAt=current.length;
    for(let position=0;position<current.length;position++){
      const chunk=Number(current[position]?.__jijinChunk);
      if(Number.isFinite(chunk)&&chunk>index){insertAt=position;break}
    }
    current.splice(insertAt,0,...messages);
  }
  function loadedSet(){return new Set((streamState()?.loaded||[]).map(Number).filter(Number.isFinite))}
  function allChunksLoaded(){const stream=streamState();return !!stream&&loadedSet().size>=Number(stream.chunkCount||0)}
  function nextChunkIndex(){
    const stream=streamState();if(!stream)return -1;
    const loaded=loadedSet();
    for(let index=0;index<Number(stream.chunkCount||0);index++)if(!loaded.has(index))return index;
    return -1;
  }
  function rememberRoom(){try{if(state?.room?.id)parentCache?.set(state.room.id,state.room)}catch{}}
  function activePage(){
    try{return document.querySelector(`.log-page[data-track-index="${state.carouselPosition}"]`)||document.querySelector(".log-page")}catch{return null}
  }
  function activeScroll(){return activePage()?.querySelector(".page-scroll")||null}
  function activeTab(){
    try{
      const page=activePage(),realIndex=Number(page?.dataset.realIndex);
      if(Number.isInteger(realIndex)&&realIndex>=0)return state.room?.tabs?.[realIndex]||"";
      return state.room?.tabs?.[state.activeTabIndex]||"";
    }catch{return ""}
  }
  function tabHasLoadedMessages(tab){
    if(!tab)return false;
    const indexed=state?.__jijinMessagesByTab;
    if(indexed instanceof Map)return (indexed.get(tab)||[]).length>0;
    return !!state?.room?.messages?.some(message=>message.tab===tab);
  }
  function scrollSnapshot(){
    const scroll=activeScroll();
    if(!scroll)return null;
    return {top:scroll.scrollTop,max:Math.max(0,scroll.scrollHeight-scroll.clientHeight)};
  }
  async function restoreScroll(snapshot){
    if(!snapshot)return;
    await nextFrame();
    const scroll=activeScroll();if(!scroll)return;
    const max=Math.max(0,scroll.scrollHeight-scroll.clientHeight);
    scroll.scrollTop=Math.min(snapshot.top,max);
  }

  async function loadChunk(index,{render=true}={}){
    lastLoadedChunkMessages=[];
    const stream=streamState(),roomId=state?.roomId||state?.room?.id||startupRoom;
    if(!stream||!roomId||index<0||index>=Number(stream.chunkCount||0))return false;
    const loaded=loadedSet();if(loaded.has(index))return true;
    if(loadingChunk)return false;
    loadingChunk=true;
    try{
      const response=await nativeFetch(streamPath(roomId,`chunk/${index}`));
      if(!response.ok)throw new Error(`chunk ${index}: ${response.status}`);
      const data=await response.json(),messages=Array.isArray(data.messages)?data.messages:[];
      lastLoadedChunkMessages=messages;
      markChunk(messages,index);
      seedInitialChunkMarks();
      const current=state.room.messages||[];
      insertChunkInSourceOrder(current,messages,index);
      stream.loaded=[...loaded,index].sort((a,b)=>a-b);
      stream.chunkCount=Math.max(Number(stream.chunkCount)||1,Number(data.chunkCount)||1);
      stream.messageCount=Math.max(Number(stream.messageCount)||0,Number(data.messageCount)||0);
      rememberRoom();
      if(render&&typeof renderLog==="function"){
        const snapshot=scrollSnapshot(),anchor=typeof currentReadingTime==="function"?currentReadingTime():"";
        renderLog(anchor);
        await restoreScroll(snapshot);
      }
      return true;
    }catch(error){console.warn("Log chunk load failed",error);return false}
    finally{loadingChunk=false}
  }

  async function fillViewportBuffer(){
    if(fillingViewport||!streamState())return;
    fillingViewport=true;
    try{
      await nextFrame();
      const panel=activeScroll(),tab=activeTab();
      if(!panel)return;
      const height=Math.max(1,panel.clientHeight);
      const remaining=panel.scrollHeight-panel.scrollTop-height;
      const atInitialTop=panel.scrollTop<4;
      let hasTabRows=tabHasLoadedMessages(tab);
      const targetCoverage=atInitialTop?height*1.18:height*.35;
      let estimatedCoverage=atInitialTop?panel.scrollHeight:remaining;
      if((hasTabRows&&estimatedCoverage>=targetCoverage)||allChunksLoaded())return;

      const snapshot=scrollSnapshot(),anchor=typeof currentReadingTime==="function"?currentReadingTime():"";
      let changed=false;
      // Fetch as many sequential chunks as the current tab needs, but keep the
      // existing DOM untouched. Repaint once after the batch so chunk streaming
      // cannot visibly flash the whole log pane between requests.
      for(let guard=0;guard<Math.max(1,Number(streamState()?.chunkCount)||1);guard++){
        const next=nextChunkIndex();
        if(next<0)break;
        const loaded=await loadChunk(next,{render:false});
        if(!loaded)break;
        changed=true;
        const additions=lastLoadedChunkMessages.filter(message=>message.tab===tab);
        if(additions.length){
          hasTabRows=true;
          estimatedCoverage+=additions.reduce((sum,message)=>sum+estimateMessageHeight(message),0);
        }
        if((hasTabRows&&estimatedCoverage>=targetCoverage)||allChunksLoaded())break;
      }
      if(!changed)return;
      if(typeof renderLog==="function")renderLog(anchor);
      await restoreScroll(snapshot);
    }finally{fillingViewport=false}
  }

  function bindScrolls(){
    document.querySelectorAll(".log-page .page-scroll").forEach(scroll=>{
      if(scroll.dataset.jijinChunkStream)return;
      scroll.dataset.jijinChunkStream="1";
      scroll.addEventListener("scroll",()=>{
        if(!streamState()||loadingChunk||fillingViewport)return;
        const height=Math.max(1,scroll.clientHeight),remaining=scroll.scrollHeight-scroll.scrollTop-height;
        if(remaining<height*.35)fillViewportBuffer().catch(()=>{});
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

    if(typeof pagePanelHtml==="function"&&!pagePanelHtml.__jijinChunkPendingAware){
      const raw=pagePanelHtml;
      const wrapped=function(tab,...args){
        const html=raw.call(this,tab,...args);
        if(!streamState()||allChunksLoaded()||tabHasLoadedMessages(tab))return html;
        return html.replace('<p class="empty">このタブに表示できる発言がありません。</p>','<p class="empty jijin-stream-pending">読み込み中…</p>');
      };
      wrapped.__jijinChunkPendingAware=true;pagePanelHtml=wrapped;
    }

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