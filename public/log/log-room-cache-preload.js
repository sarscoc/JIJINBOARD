"use strict";
(()=>{
  const params=new URL(location.href).searchParams,startupRoom=params.get('room')||'';if(!startupRoom)return;
  let parentCache=null;if(params.get('embedded')==='1'&&parent!==window){try{if(!(parent.__jijinLogRoomCache instanceof Map))parent.__jijinLogRoomCache=new Map();parentCache=parent.__jijinLogRoomCache}catch{}}
  const nativeFetch=window.fetch.bind(window),jsonResponse=data=>new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json; charset=utf-8'}}),streamPath=(roomId,suffix)=>`/api/rooms/${encodeURIComponent(roomId)}/stream/${suffix}`;
  const inFlight=new Map();let installed=false,initialAnnotationsStarted=false;
  const chunkUrl=(roomId,index,tab)=>`${streamPath(roomId,`chunk/${index}`)}?tab=${encodeURIComponent(tab||'')}`;

  async function streamFetch(path){
    let failure;
    for(let attempt=0;attempt<2;attempt++){
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
      try{const response=await nativeFetch(path,{signal:controller.signal});if(!response.ok)throw Error(`ログの取得に失敗しました (${response.status})`);return response}
      catch(error){failure=error}finally{clearTimeout(timer)}
    }
    throw failure;
  }

  function preferredTab(roomId,tabs){
    let saved='';try{saved=localStorage.getItem(`mainTab:${roomId}`)||''}catch{}
    return tabs.includes(saved)?saved:(tabs.find(tab=>/^メイン$/i.test(tab))||tabs[0]||'');
  }

  async function firstStreamedRoom(roomId){
    const cached=parentCache?.get(roomId);if(cached?.stream?.streamed&&Array.isArray(cached.stream.tabStreams)&&Array.isArray(cached.messages))return cached;
    try{
      const metaResponse=await streamFetch(streamPath(roomId,'meta'));if(!metaResponse.ok)throw new Error('stream unavailable');
      const meta=await metaResponse.json(),tabs=Array.isArray(meta.tabs)?meta.tabs:[],tab=preferredTab(roomId,tabs),loadedByTab={};
      let messages=[];
      if(tab){
        const response=await streamFetch(chunkUrl(roomId,0,tab));if(!response.ok)throw new Error('stream unavailable');
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
        const response=await streamFetch(chunkUrl(roomId,index,tab));if(!response.ok)return false;
        const data=await response.json();if(!Array.isArray(data.messages))throw Error("ログの応答形式が正しくありません");const messages=data.messages;
        if(streamState()!==stream||String(state.roomId||startupRoom)!==String(roomId))return false;
        state.room.messages=mergeMessages(state.room.messages||[],messages);stream.loadedByTab||={};stream.loadedByTab[tab]=[...new Set([...loadedSet(tab),index])].sort((a,b)=>a-b);remember();
        if(render&&activeTab()===tab&&typeof renderLog==='function')renderLog(typeof currentReadingTime==='function'?currentReadingTime():'');
        return true;
      }finally{inFlight.delete(key)}
    })();inFlight.set(key,task);return task;
  }

  let pumping=null,queuedAll=false;
  function showRetry(){
    const scroll=activeScroll();if(!scroll||scroll.querySelector('.log-stream-retry'))return;
    const button=document.createElement('button');button.type='button';button.className='log-stream-retry';
    button.textContent='続きの読み込みに失敗しました。再試行';
    button.style.cssText='display:block;margin:12px auto;padding:8px 14px;border:1px solid #e4cee1;border-radius:10px;background:#fff7fd;color:#8c628c;font:inherit;cursor:pointer';
    button.addEventListener('click',()=>{button.remove();pump()});scroll.append(button);
  }
  function paintMore(){
    const scroll=activeScroll(),top=scroll?.scrollTop||0,tab=activeTab();
    let anchor=typeof currentReadingTime==='function'?currentReadingTime():'';
    if(state.viewMode==='timeline'&&anchor.startsWith('@slot:'))anchor=decodeURIComponent(anchor.slice(anchor.indexOf('|')+1));
    if(typeof renderLog==='function')renderLog(anchor);
    if(state.viewMode!=='timeline')requestAnimationFrame(()=>requestAnimationFrame(()=>{if(activeTab()===tab&&activeScroll())activeScroll().scrollTop=top}));
  }
  async function pump(all=false){
    if(!streamState())return;
    const needsAll=all||state.viewMode==='timeline'||!!document.getElementById('searchInput')?.value.trim();
    if(pumping){queuedAll||=needsAll;return pumping}
    const startRoom=state.room,tab=activeTab(),tabs=needsAll?(streamState().tabStreams||[]).map(info=>info.tabName):[tab];
    let changed=false,failed=false;
    const task=(async()=>{
      try{
        for(const nextTab of tabs){
          for(let next=nextChunkIndex(nextTab);next>=0;next=nextChunkIndex(nextTab)){
            if(state.room!==startRoom||(!needsAll&&activeTab()!==tab))return;
            if(!await loadChunk(next,nextTab,{render:false}))throw Error('ログの続きが取得できませんでした');changed=true;
          }
        }
      }catch(error){failed=true;console.warn('Log continuation failed',error)}
      finally{
        if(state.room===startRoom){if(changed)paintMore();if(failed)showRetry()}
      }
    })();pumping=task;
    try{await task}finally{
      if(pumping===task)pumping=null;
      const restart=queuedAll||state.room!==startRoom||activeTab()!==tab;
      const allNext=queuedAll;queuedAll=false;
      if(restart)queueMicrotask(()=>pump(allNext));
    }
  }
  async function ensureActiveTab(){return pump()}
  async function loadNextIfNeeded(){return pump()}
  function bindScroll(){document.querySelectorAll('.log-page .page-scroll').forEach(scroll=>{if(scroll.dataset.jijinChunkStream)return;scroll.dataset.jijinChunkStream='1';scroll.addEventListener('scroll',()=>loadNextIfNeeded().catch(()=>{}),{passive:true})})}

  async function ensureMessageLoaded(messageId){
    if(!streamState()||!messageId)return false;if(state.room.messages.some(message=>message.id===messageId))return true;
    try{const response=await streamFetch(streamPath(state.roomId||startupRoom,`find/${encodeURIComponent(messageId)}`));if(!response.ok)return false;const data=await response.json(),index=Number(data.index),tab=String(data.tab||'');return Number.isInteger(index)&&index>=0&&tab?loadChunk(index,tab):false}catch{return false}
  }
  async function fullRoom(room){if(!room?.stream?.streamed)return room;const response=await streamFetch(streamPath(room.id||state.roomId||startupRoom,'full'));if(!response.ok)throw new Error('保存用ログ全文を取得できませんでした');return response.json()}


  function install(){if(installed||typeof state==='undefined'||typeof renderLog!=='function')return false;installed=true;
    const rawRender=renderLog;renderLog=function(...args){remember();const result=rawRender.apply(this,args);queueMicrotask(()=>{bindScroll();if(!pumping)pump()});return result};
    if(typeof goToTab==='function'){const raw=goToTab;goToTab=function(...args){const result=raw.apply(this,args);queueMicrotask(()=>ensureActiveTab().catch(()=>{}));return result}}
    if(typeof switchLogPage==='function'){const raw=switchLogPage;switchLogPage=function(...args){const result=raw.apply(this,args);queueMicrotask(()=>ensureActiveTab().catch(()=>{}));return result}}
    if(typeof jumpToMessage==='function'){const raw=jumpToMessage;jumpToMessage=function(id,...args){if(!streamState()||state.room.messages.some(message=>message.id===id))return raw.call(this,id,...args);ensureMessageLoaded(id).then(ok=>{if(ok)raw.call(this,id,...args)}).catch(()=>{})}}
    if(typeof downloadArchive==='function'){const raw=downloadArchive;downloadArchive=async function(room,...args){return raw.call(this,await fullRoom(room),...args)}}
    const search=document.getElementById('searchInput');if(search&&!search.dataset.jijinFullSearch){search.dataset.jijinFullSearch='1';search.addEventListener('input',()=>{if(search.value.trim())pump(true)})}
    document.getElementById('viewMode')?.addEventListener('change',()=>pump());
    if(streamState()){remember();bindScroll();pump()}return true;
  }
  addEventListener('DOMContentLoaded',install,{once:true});addEventListener('load',install,{once:true});queueMicrotask(()=>{if(document.readyState!=='loading')install()});
})();

