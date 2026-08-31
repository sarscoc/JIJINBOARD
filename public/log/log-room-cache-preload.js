"use strict";
(()=>{
  const params=new URL(location.href).searchParams,startupRoom=params.get('room')||'';if(!startupRoom)return;
  let parentCache=null;if(params.get('embedded')==='1'&&parent!==window){try{if(!(parent.__jijinLogRoomCache instanceof Map))parent.__jijinLogRoomCache=new Map();parentCache=parent.__jijinLogRoomCache}catch{}}
  const nativeFetch=window.fetch.bind(window),jsonResponse=data=>new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json; charset=utf-8'}}),streamPath=(roomId,suffix)=>`/api/rooms/${encodeURIComponent(roomId)}/stream/${suffix}`,nextFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
  const inFlight=new Map();let deferredAnnotations=false,installDone=false,fillGeneration=0,fillingTab='';
  const chunkUrl=(roomId,index,tab)=>`${streamPath(roomId,`chunk/${index}`)}?tab=${encodeURIComponent(tab||'')}`;

  async function firstStreamedRoom(roomId){
    const cached=parentCache?.get(roomId);if(cached?.stream?.streamed&&Array.isArray(cached.messages)){await Promise.resolve();return cached}
    try{
      const metaResponse=await nativeFetch(streamPath(roomId,'meta'));if(!metaResponse.ok)throw new Error('stream unavailable');
      const meta=await metaResponse.json(),tabs=Array.isArray(meta.tabs)?meta.tabs:[],first=tabs[0]||'';
      let messages=[];const loadedByTab={};
      if(first){const response=await nativeFetch(chunkUrl(roomId,0,first));if(!response.ok)throw new Error('stream unavailable');const chunk=await response.json();messages=Array.isArray(chunk.messages)?chunk.messages:[];loadedByTab[first]=[0]}
      const room={id:meta.id||roomId,title:meta.title||'TRPG LOG',createdAt:meta.createdAt||'',tabs,messages,stream:{streamed:true,chunkSize:Number(meta.chunkSize)||120,tabStreams:Array.isArray(meta.tabStreams)?meta.tabStreams:[],loadedByTab}};
      parentCache?.set(roomId,room);return room;
    }catch(error){console.warn('Chunked log first paint fallback',error);const response=await nativeFetch(`/api/rooms/${encodeURIComponent(roomId)}`);return response.ok?response.json():null}
  }

  window.fetch=async function(input,init={}){
    const request=input instanceof Request?input:null,method=String(init?.method||request?.method||'GET').toUpperCase();let url;try{url=new URL(typeof input==='string'?input:request?.url||String(input),location.href)}catch{return nativeFetch(input,init)}
    if(method!=='GET'||url.origin!==location.origin)return nativeFetch(input,init);
    const roomMatch=url.pathname.match(/^\/api\/rooms\/([^/]+)$/);if(roomMatch&&!url.search){const roomId=decodeURIComponent(roomMatch[1]),room=await firstStreamedRoom(roomId);return room?jsonResponse(room):nativeFetch(input,init)}
    const annotationMatch=url.pathname.match(/^\/api\/rooms\/([^/]+)\/annotations$/);if(annotationMatch&&!deferredAnnotations&&decodeURIComponent(annotationMatch[1])===startupRoom){deferredAnnotations=true;const background=nativeFetch(input,init);background.then(r=>r.ok?r.clone().json():null).then(data=>{if(!data)return;window.__jijinInitialAnnotations={roomId:startupRoom,data};window.dispatchEvent(new CustomEvent('jijinboard-initial-annotations',{detail:window.__jijinInitialAnnotations}))}).catch(()=>{});return jsonResponse({annotations:[],version:-1,deferred:true})}
    return nativeFetch(input,init);
  };

  function streamState(){try{return state?.room?.stream?.streamed?state.room.stream:null}catch{return null}}
  function streamInfo(tab){return streamState()?.tabStreams?.find?.(item=>item.tabName===tab)||null}
  function loadedSet(tab){return new Set((streamState()?.loadedByTab?.[tab]||[]).map(Number).filter(Number.isFinite))}
  function allChunksLoaded(tab){const info=streamInfo(tab);return !!info&&loadedSet(tab).size>=Math.max(0,Number(info.chunkCount)||0)}
  function nextChunkIndex(tab){const info=streamInfo(tab);if(!info)return-1;const loaded=loadedSet(tab),count=Math.max(0,Number(info.chunkCount)||0);for(let i=0;i<count;i++)if(!loaded.has(i))return i;return-1}
  function rememberRoom(){try{if(state?.room?.id)parentCache?.set(state.room.id,state.room)}catch{}}
  function activePage(){try{return document.querySelector(`.log-page[data-track-index="${state.carouselPosition}"]`)||document.querySelector('.log-page')}catch{return null}}
  function activeScroll(){return activePage()?.querySelector('.page-scroll')||null}
  function activeTab(){try{const page=activePage(),real=Number(page?.dataset.realIndex);if(Number.isInteger(real)&&real>=0)return state.room?.tabs?.[real]||'';return state.room?.tabs?.[state.activeTabIndex]||''}catch{return''}}
  function tabHasMessages(tab){return !!tab&&!!state?.room?.messages?.some(message=>message.tab===tab)}
  function snapshot(){const scroll=activeScroll();return scroll?{top:scroll.scrollTop}:null}
  async function restore(snap){if(!snap)return;await nextFrame();const scroll=activeScroll();if(scroll)scroll.scrollTop=Math.min(snap.top,Math.max(0,scroll.scrollHeight-scroll.clientHeight))}

  function mergeMessages(current,incoming){
    const known=new Set(current.map(message=>message.id)),fresh=incoming.filter(message=>!known.has(message.id));if(!fresh.length)return current;
    fresh.sort((a,b)=>(Number(a.sourceIndex)||0)-(Number(b.sourceIndex)||0));
    const merged=[];let i=0,j=0;
    while(i<current.length&&j<fresh.length){if((Number(current[i].sourceIndex)||0)<=(Number(fresh[j].sourceIndex)||0))merged.push(current[i++]);else merged.push(fresh[j++])}
    while(i<current.length)merged.push(current[i++]);while(j<fresh.length)merged.push(fresh[j++]);return merged;
  }

  async function loadChunk(index,{tab=activeTab(),render=true}={}){
    const stream=streamState(),roomId=state?.roomId||state?.room?.id||startupRoom;if(!stream||!roomId||!tab)return false;
    const count=Math.max(0,Number(streamInfo(tab)?.chunkCount)||0);if(index<0||index>=count)return false;
    const loaded=loadedSet(tab);if(loaded.has(index))return true;
    const key=`${tab}\n${index}`;if(inFlight.has(key))return inFlight.get(key);
    const task=(async()=>{
      try{
        const response=await nativeFetch(chunkUrl(roomId,index,tab));if(!response.ok)throw new Error(`chunk ${tab}/${index}: ${response.status}`);
        const data=await response.json(),messages=Array.isArray(data.messages)?data.messages:[];
        state.room.messages=mergeMessages(state.room.messages||[],messages);stream.loadedByTab||={};stream.loadedByTab[tab]=[...loaded,index].sort((a,b)=>a-b);rememberRoom();
        if(render&&activeTab()===tab&&typeof renderLog==='function'){const snap=snapshot(),anchor=typeof currentReadingTime==='function'?currentReadingTime():'';renderLog(anchor);await restore(snap)}
        return true;
      }catch(error){console.warn('Log chunk load failed',error);return false}finally{inFlight.delete(key)}
    })();
    inFlight.set(key,task);return task;
  }

  async function fillVisibleTab(){
    const tab=activeTab();if(!tab||!streamState())return;const generation=++fillGeneration;fillingTab=tab;
    try{
      for(let guard=0;guard<50;guard++){
        if(generation!==fillGeneration||activeTab()!==tab)return;await nextFrame();
        const scroll=activeScroll();if(!scroll)return;const height=Math.max(1,scroll.clientHeight),remaining=scroll.scrollHeight-scroll.scrollTop-height,has=tabHasMessages(tab);
        const enough=has&&(scroll.scrollTop<4?scroll.scrollHeight>=height*1.2:remaining>=height*.9);if(enough||allChunksLoaded(tab))return;
        const next=nextChunkIndex(tab);if(next<0)return;const snap=snapshot(),anchor=typeof currentReadingTime==='function'?currentReadingTime():'';
        if(!await loadChunk(next,{tab,render:false}))return;if(generation!==fillGeneration||activeTab()!==tab)return;
        if(typeof renderLog==='function')renderLog(anchor);await restore(snap);
      }
    }finally{if(fillingTab===tab)fillingTab=''}
  }
  function requestVisibleFill(){fillGeneration++;requestAnimationFrame(()=>fillVisibleTab().catch(()=>{}))}
  function bindScrolls(){
    document.querySelectorAll('.log-page .page-scroll').forEach(scroll=>{if(scroll.dataset.jijinChunkStream)return;scroll.dataset.jijinChunkStream='1';scroll.addEventListener('scroll',()=>{if(scroll!==activeScroll()||!streamState())return;const height=Math.max(1,scroll.clientHeight),remaining=scroll.scrollHeight-scroll.scrollTop-height;if(remaining<height*.9)requestVisibleFill()},{passive:true})});
    requestVisibleFill();
  }

  async function ensureMessageLoaded(messageId){if(!streamState()||!messageId)return false;if(state.room.messages.some(message=>message.id===messageId))return true;try{const response=await nativeFetch(streamPath(state.roomId||startupRoom,`find/${encodeURIComponent(messageId)}`));if(!response.ok)return false;const data=await response.json(),index=Number(data.index),tab=String(data.tab||'');if(!Number.isInteger(index)||index<0||!tab)return false;return loadChunk(index,{tab})}catch{return false}}
  async function fullRoom(room){if(!room?.stream?.streamed)return room;const response=await nativeFetch(streamPath(room.id||state.roomId||startupRoom,'full'));if(!response.ok)throw new Error('保存用ログ全文を取得できませんでした');return response.json()}
  async function loadAllTabs(){const stream=streamState();if(!stream)return;for(const info of stream.tabStreams||[]){const tab=info.tabName,count=Math.max(0,Number(info.chunkCount)||0);for(let i=0;i<count;i++)if(!loadedSet(tab).has(i))await loadChunk(i,{tab,render:false})}}

  function installStreamingRuntime(){if(installDone||typeof state==='undefined'||typeof renderLog!=='function')return false;installDone=true;
    if(typeof pagePanelHtml==='function'&&!pagePanelHtml.__jijinChunkPendingAware){const raw=pagePanelHtml;const wrapped=function(tab,...args){const html=raw.call(this,tab,...args);if(!streamState()||allChunksLoaded(tab)||tabHasMessages(tab))return html;return html.replace('<p class="empty">このタブに表示できる発言がありません。</p>','<p class="empty jijin-stream-pending">読み込み中…</p>')};wrapped.__jijinChunkPendingAware=true;pagePanelHtml=wrapped}
    if(typeof renderLog==='function'&&!renderLog.__jijinChunkBound){const raw=renderLog;const wrapped=function(...args){if(streamState())rememberRoom();const result=raw.apply(this,args);queueMicrotask(bindScrolls);return result};wrapped.__jijinChunkBound=true;renderLog=wrapped}
    if(typeof goToTab==='function'&&!goToTab.__jijinChunkBound){const raw=goToTab;const wrapped=function(...args){fillGeneration++;const result=raw.apply(this,args);requestVisibleFill();return result};wrapped.__jijinChunkBound=true;goToTab=wrapped}
    if(typeof switchLogPage==='function'&&!switchLogPage.__jijinChunkBound){const raw=switchLogPage;const wrapped=function(...args){fillGeneration++;const result=raw.apply(this,args);requestVisibleFill();return result};wrapped.__jijinChunkBound=true;switchLogPage=wrapped}
    if(typeof jumpToMessage==='function'&&!jumpToMessage.__jijinChunkAware){const raw=jumpToMessage;const wrapped=function(id,...args){if(!streamState()||state.room.messages.some(message=>message.id===id))return raw.call(this,id,...args);ensureMessageLoaded(id).then(ok=>{if(ok)raw.call(this,id,...args)}).catch(()=>{})};wrapped.__jijinChunkAware=true;jumpToMessage=wrapped}
    if(typeof downloadArchive==='function'&&!downloadArchive.__jijinFullArchive){const raw=downloadArchive;const wrapped=async function(room,...args){return raw.call(this,await fullRoom(room),...args)};wrapped.__jijinFullArchive=true;downloadArchive=wrapped}
    const search=document.getElementById('searchInput');if(search&&!search.dataset.jijinFullSearch){search.dataset.jijinFullSearch='1';let task=null;search.addEventListener('input',()=>{if(!search.value.trim()||!streamState()||task)return;task=loadAllTabs().then(()=>{if(typeof renderLog==='function')renderLog(typeof currentReadingTime==='function'?currentReadingTime():'')}).finally(()=>{task=null})})}
    if(streamState()){rememberRoom();bindScrolls()}return true;
  }
  addEventListener('load',installStreamingRuntime,{once:true});queueMicrotask(()=>{if(document.readyState==='complete')installStreamingRuntime()});
})();
