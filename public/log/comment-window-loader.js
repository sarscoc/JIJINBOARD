"use strict";
(()=>{
  const nativeFetch=window.fetch.bind(window);
  const annotationListUrl=value=>{try{const u=new URL(typeof value==='string'?value:value?.url||'',location.href);return /^\/api\/rooms\/[^/]+\/annotations$/.test(u.pathname)?u:null}catch{return null}};
  let shieldInitial=true;
  window.fetch=async function(input,init){
    const method=String(init?.method||(input instanceof Request?input.method:'GET')||'GET').toUpperCase(),url=annotationListUrl(input);
    if(shieldInitial&&method==='GET'&&url&&!url.searchParams.has('full')){
      shieldInitial=false;
      return new Response(JSON.stringify({annotations:[],version:-1,totalCount:0}),{status:200,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
    }
    return nativeFetch(input,init);
  };

  function install(){
    if(typeof state==='undefined'||typeof refreshAnnotations!=='function'||typeof renderComments!=='function'||typeof renderLog!=='function'||!state.room?.messages?.length){setTimeout(install,20);return}
    window.fetch=nativeFetch;

    let roomId=state.roomId,inflight=false,queued=false,timer=0;
    const loaded=new Set();
    state.annotationTotal=Number.isFinite(state.annotationTotal)?state.annotationTotal:0;

    const rawRenderComments=renderComments;
    renderComments=function(...args){
      const result=rawRenderComments.apply(this,args),count=document.getElementById('commentCount');
      if(count&&Number.isFinite(state.annotationTotal))count.textContent=String(state.annotationTotal);
      return result;
    };

    function activePanel(){return document.querySelector(`.log-page[data-track-index="${state.carouselPosition}"]`)||document.querySelector('.log-page')}
    function visibleWindowIds(){
      const panel=activePanel(),scroll=panel?.querySelector?.('.page-scroll'),nodes=[...(panel?.querySelectorAll?.('.log-message[data-message]')||[])];
      if(!nodes.length)return[];
      let focus=nodes;
      if(scroll){
        const box=scroll.getBoundingClientRect(),buffer=Math.max(120,box.height*.5);
        const near=nodes.filter(node=>{const r=node.getBoundingClientRect();return r.bottom>=box.top-buffer&&r.top<=box.bottom+buffer});
        if(near.length)focus=near;
      }
      const rendered=focus.map(node=>node.dataset.message).filter(Boolean),first=rendered[0],last=rendered[rendered.length-1];
      const firstMessage=state.room.messages.find(m=>m.id===first),tab=firstMessage?.tab||'';
      const tabMessages=state.room.messages.filter(m=>!tab||m.tab===tab),index=new Map(tabMessages.map((m,i)=>[m.id,i]));
      let lo=index.get(first),hi=index.get(last);
      if(lo===undefined||hi===undefined)return rendered.slice(0,80);
      if(lo>hi)[lo,hi]=[hi,lo];
      lo=Math.max(0,lo-14);hi=Math.min(tabMessages.length-1,hi+22);
      return tabMessages.slice(lo,hi+1).map(m=>m.id).slice(0,80);
    }

    function markerSignature(list){return (list||[]).map(a=>[a.id,a.message_id,a.end_message_id,a.start_offset,a.end_offset,a.color].join(':')).sort().join('|')}

    async function loadWindow(force=false){
      if(state.roomId!==roomId){roomId=state.roomId;loaded.clear();state.annotations=[];state.annotationTotal=0}
      const ids=visibleWindowIds();
      if(!ids.length){schedule(false,80);return}
      const wanted=force?ids:ids.filter(id=>!loaded.has(id));
      if(!wanted.length)return;
      if(inflight){queued=true;return}
      inflight=true;
      try{
        const url=`/api/rooms/${encodeURIComponent(state.roomId)}/annotations-window?authorId=${encodeURIComponent(state.profile.id)}&messageIds=${encodeURIComponent(wanted.join(','))}`;
        const response=await nativeFetch(url,{headers:{accept:'application/json'}}),data=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(data.error||`通信エラー (${response.status})`);
        const before=markerSignature(state.annotations),target=new Set(wanted),incoming=Array.isArray(data.annotations)?data.annotations:[];
        if(force)state.annotations=state.annotations.filter(a=>!target.has(a.message_id)&&!target.has(a.end_message_id));
        const byId=new Map(state.annotations.map(a=>[a.id,a]));
        for(const annotation of incoming)byId.set(annotation.id,annotation);
        state.annotations=[...byId.values()];
        wanted.forEach(id=>loaded.add(id));
        state.annotationVersion=Number(data.version)||0;
        state.annotationTotal=Number(data.totalCount)||0;
        renderComments();
        if(markerSignature(state.annotations)!==before){
          const time=typeof currentReadingTime==='function'?currentReadingTime():'';
          requestAnimationFrame(()=>renderLog(time));
        }
      }catch(error){const status=document.getElementById('roomStatus');if(status)status.textContent=error.message}
      finally{
        inflight=false;
        if(queued){queued=false;schedule(false,20)}
      }
    }

    function schedule(force=false,delay=70){clearTimeout(timer);timer=setTimeout(()=>loadWindow(force),delay)}
    refreshAnnotations=function(){return loadWindow(true)};

    const logPane=document.getElementById('logPane');
    if(logPane)new MutationObserver(()=>schedule(false,55)).observe(logPane,{childList:true,subtree:true});
    document.addEventListener('scroll',event=>{if(event.target?.classList?.contains('page-scroll'))schedule(false,55)},true);
    document.addEventListener('click',event=>{if(event.target.closest?.('[data-tab-index],[data-page]'))schedule(false,80)});

    const count=document.getElementById('commentCount');
    if(count)new MutationObserver(()=>{if(Number(count.textContent)!==Number(state.annotationTotal))schedule(true,80)}).observe(count,{childList:true,characterData:true,subtree:true});

    const exportButton=document.getElementById('exportRoomBtn');
    if(exportButton)exportButton.onclick=async()=>{
      if(!state.room)return;
      const label=exportButton.textContent;exportButton.disabled=true;exportButton.textContent='保存中…';
      try{
        const data=await api(`/api/rooms/${encodeURIComponent(state.roomId)}/annotations?authorId=${encodeURIComponent(state.profile.id)}&full=1`);
        await downloadArchive(state.room,data.annotations||[],state.profile.personas);
      }catch(error){alert(error.message)}finally{exportButton.disabled=false;exportButton.textContent=label}
    };

    schedule(false,0);
  }
  setTimeout(install,0);
})();
