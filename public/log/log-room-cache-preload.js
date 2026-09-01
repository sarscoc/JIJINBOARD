"use strict";
(()=>{
  const params=new URL(location.href).searchParams,startupRoom=params.get('room')||'';if(!startupRoom)return;
  let parentCache=null;if(params.get('embedded')==='1'&&parent!==window){try{if(!(parent.__jijinLogRoomCache instanceof Map))parent.__jijinLogRoomCache=new Map();parentCache=parent.__jijinLogRoomCache}catch{}}
  const nativeFetch=window.fetch.bind(window),jsonResponse=data=>new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json; charset=utf-8'}}),streamPath=(roomId,suffix)=>`/api/rooms/${encodeURIComponent(roomId)}/stream/${suffix}`;
  const inFlight=new Map();let installed=false,initialAnnotationsStarted=false;
  const chunkUrl=(roomId,index,tab)=>`${streamPath(roomId,`chunk/${index}`)}?tab=${encodeURIComponent(tab||'')}`;

  function preferredTab(roomId,tabs){
    let saved='';try{saved=localStorage.getItem(`mainTab:${roomId}`)||''}catch{}
    return tabs.includes(saved)?saved:(tabs.find(tab=>/^メイン$/i.test(tab))||tabs[0]||'');
  }

  async function firstStreamedRoom(roomId){
    const cached=parentCache?.get(roomId);if(cached?.stream?.streamed&&Array.isArray(cached.messages))return cached;
    try{
      const metaResponse=await nativeFetch(streamPath(roomId,'meta'));if(!metaResponse.ok)throw new Error('stream unavailable');
      const meta=await metaResponse.json(),tabs=Array.isArray(meta.tabs)?meta.tabs:[],tab=preferredTab(roomId,tabs),loadedByTab={};
      let messages=[];
      if(tab){
        const response=await nativeFetch(chunkUrl(roomId,0,tab));if(!response.ok)throw new Error('stream unavailable');
        const chunk=await response.json();messages=Array.isArray(chunk.messages)?chunk.messages:[];loadedByTab[tab]=[0];
      }
      const room={id:meta.id||roomId,title:meta.title||'TRPG LOG',createdAt:meta.createdAt||'',tabs,messages,stream:{streamed:true,chunkSize:Number(meta.chunkSize)||120,tabStreams:Array.isArray(meta.tabStreams)?meta.tabStreams:[],loadedByTab}};
      parentCache?.set(roomId,room);return room;
    }catch(error){
      console.warn('Chunked log fallback',error);
      const response=await nativeFetch(`/api/rooms/${encodeURIComponent(roomId)}`);return response.ok?response.json():null;
    }
  }

  function deferInitialAnnotations(input,init,url,roomId){
    if(initialAnnotationsStarted)return null;
    initialAnnotationsStarted=true;
    nativeFetch(input,init).then(async response=>{
      if(!response.ok)return;
      const data=await response.clone().json().catch(()=>null);if(!data)return;
      const detail={roomId,data};
      window.__jijinInitialAnnotations=detail;
      window.dispatchEvent(new CustomEvent('jijinboard-initial-annotations',{detail}));
    }).catch(error=>console.warn('Initial comments deferred',error));
    return jsonResponse({annotations:[],version:0});
  }

  window.fetch=async function(input,init={}){
    const request=input instanceof Request?input:null,method=String(init?.method||request?.method||'GET').toUpperCase();let url;
    try{url=new URL(typeof input==='string'?input:request?.url||String(input),location.href)}catch{return nativeFetch(input,init)}
    if(method!=='GET'||url.origin!==location.origin)return nativeFetch(input,init);
    const annotationMatch=url.pathname.match(/^\/api\/rooms\/([^/]+)\/annotations$/);
    if(annotationMatch&&decodeURIComponent(annotationMatch[1])===startupRoom){const fast=deferInitialAnnotations(input,init,url,startupRoom);if(fast)return fast}
    const match=url.pathname.match(/^\/api\/rooms\/([^/]+)$/);
    if(match&&!url.search){const roomId=decodeURIComponent(match[1]),room=await firstStreamedRoom(roomId);return room?jsonResponse(room):nativeFetch(input,init)}
    return nativeFetch(input,init);
  };

  function streamState(){try{return state?.room?.stream?.streamed?state.room.stream:null}catch{return null}}
  function streamInfo(tab){return streamState()?.tabStreams?.find?.(item=>item.tabName===tab)||null}
  function loadedSet(tab){return new Set((streamState()?.loadedByTab?.[tab]||[]).map(Number).filter(Number.isFinite))}
  function nextChunkIndex(tab){const info=streamInfo(tab);if(!info)return-1;const loaded=loadedSet(tab),count=Math.max(0,Number(info.chunkCount)||0);for(let i=0;i<count;i++)if(!loaded.has(i))return i;return-1}
  function allLoaded(tab){const info=streamInfo(tab);return !!info&&loadedSet(tab).size>=Math.max(0,Number(info.chunkCount)||0)}
  function activePage(){try{return document.querySelector(`.log-page[data-track-index="${state.carouselPosition}"]`)||document.querySelector('.log-page')}catch{return null}}
  function activeScroll(){return activePage()?.querySelector('.page-scroll')||null}
  function activeTab(){try{const page=activePage(),real=Number(page?.dataset.realIndex);if(Number.isInteger(real)&&real>=0)return state.room?.tabs?.[real]||'';return state.room?.tabs?.[state.activeTabIndex]||''}catch{return''}}
  function remember(){try{if(state?.room?.id)parentCache?.set(state.room.id,state.room)}catch{}}
  function mergeMessages(current,incoming){
    const known=new Set(current.map(message=>message.id)),fresh=incoming.filter(message=>!known.has(message.id));if(!fresh.length)return current;
    const merged=[...current,...fresh];merged.sort((a,b)=>(Number(a.sourceIndex)||0)-(Number(b.sourceIndex)||0));return merged;
  }

  async function loadChunk(index,tab,{render=true}={}){
    const stream=streamState(),roomId=state?.roomId||state?.room?.id||startupRoom;if(!stream||!roomId||!tab)return false;
    const count=Math.max(0,Number(streamInfo(tab)?.chunkCount)||0);if(index<0||index>=count)return false;
    const loaded=loadedSet(tab);if(loaded.has(index))return true;
    const key=`${tab}\n${index}`;if(inFlight.has(key))return inFlight.get(key);
    const task=(async()=>{
      try{
        const response=await nativeFetch(chunkUrl(roomId,index,tab));if(!response.ok)return false;
        const data=await response.json(),messages=Array.isArray(data.messages)?data.messages:[];
        state.room.messages=mergeMessages(state.room.messages||[],messages);stream.loadedByTab||={};stream.loadedByTab[tab]=[...loaded,index].sort((a,b)=>a-b);remember();
        if(render&&activeTab()===tab&&typeof renderLog==='function')renderLog(typeof currentReadingTime==='function'?currentReadingTime():'');
        return true;
      }finally{inFlight.delete(key)}
    })();inFlight.set(key,task);return task;
  }

  async function ensureActiveTab(){const tab=activeTab();if(!tab||!streamState())return;if((state.room?.messages||[]).some(message=>message.tab===tab))return;const next=nextChunkIndex(tab);if(next>=0)await loadChunk(next,tab)}
  async function loadNextIfNeeded(){const tab=activeTab(),scroll=activeScroll();if(!tab||!scroll||allLoaded(tab))return;const remaining=scroll.scrollHeight-scroll.scrollTop-scroll.clientHeight;if(remaining>Math.max(120,scroll.clientHeight*.75))return;const next=nextChunkIndex(tab);if(next>=0)await loadChunk(next,tab)}
  function bindScroll(){document.querySelectorAll('.log-page .page-scroll').forEach(scroll=>{if(scroll.dataset.jijinChunkStream)return;scroll.dataset.jijinChunkStream='1';scroll.addEventListener('scroll',()=>loadNextIfNeeded().catch(()=>{}),{passive:true})})}

  async function ensureMessageLoaded(messageId){
    if(!streamState()||!messageId)return false;if(state.room.messages.some(message=>message.id===messageId))return true;
    try{const response=await nativeFetch(streamPath(state.roomId||startupRoom,`find/${encodeURIComponent(messageId)}`));if(!response.ok)return false;const data=await response.json(),index=Number(data.index),tab=String(data.tab||'');return Number.isInteger(index)&&index>=0&&tab?loadChunk(index,tab):false}catch{return false}
  }
  async function fullRoom(room){if(!room?.stream?.streamed)return room;const response=await nativeFetch(streamPath(room.id||state.roomId||startupRoom,'full'));if(!response.ok)throw new Error('保存用ログ全文を取得できませんでした');return response.json()}
  async function loadAllTabs(){for(const info of streamState()?.tabStreams||[]){const tab=info.tabName,count=Math.max(0,Number(info.chunkCount)||0);for(let i=0;i<count;i++)if(!loadedSet(tab).has(i))await loadChunk(i,tab,{render:false})}}

  function install(){if(installed||typeof state==='undefined'||typeof renderLog!=='function')return false;installed=true;
    const rawRender=renderLog;renderLog=function(...args){remember();const result=rawRender.apply(this,args);queueMicrotask(bindScroll);return result};
    if(typeof goToTab==='function'){const raw=goToTab;goToTab=function(...args){const result=raw.apply(this,args);queueMicrotask(()=>ensureActiveTab().catch(()=>{}));return result}}
    if(typeof switchLogPage==='function'){const raw=switchLogPage;switchLogPage=function(...args){const result=raw.apply(this,args);queueMicrotask(()=>ensureActiveTab().catch(()=>{}));return result}}
    if(typeof jumpToMessage==='function'){const raw=jumpToMessage;jumpToMessage=function(id,...args){if(!streamState()||state.room.messages.some(message=>message.id===id))return raw.call(this,id,...args);ensureMessageLoaded(id).then(ok=>{if(ok)raw.call(this,id,...args)}).catch(()=>{})}}
    if(typeof downloadArchive==='function'){const raw=downloadArchive;downloadArchive=async function(room,...args){return raw.call(this,await fullRoom(room),...args)}}
    const search=document.getElementById('searchInput');if(search&&!search.dataset.jijinFullSearch){search.dataset.jijinFullSearch='1';let task=null;search.addEventListener('input',()=>{if(!search.value.trim()||!streamState()||task)return;task=loadAllTabs().then(()=>renderLog(typeof currentReadingTime==='function'?currentReadingTime():'')).finally(()=>{task=null})})}
    if(streamState()){remember();bindScroll()}return true;
  }
  addEventListener('load',install,{once:true});queueMicrotask(()=>{if(document.readyState==='complete')install()});
})();
