"use strict";
(()=>{
  let indexedRoom=null,indexedLength=-1,indexedLastId="";
  let messageIndex=new Map();
  let messagesByTab=new Map();

  function ensureIndexes(){
    const messages=state.room?.messages||[],lastId=messages.length?String(messages[messages.length-1]?.id||""):"";
    if(indexedRoom===state.room&&indexedLength===messages.length&&indexedLastId===lastId)return;
    indexedRoom=state.room;indexedLength=messages.length;indexedLastId=lastId;
    messageIndex=new Map();
    messagesByTab=new Map();
    messages.forEach((message,index)=>{
      messageIndex.set(message.id,index);
      const list=messagesByTab.get(message.tab)||[];
      list.push(message);
      messagesByTab.set(message.tab,list);
    });
    state.__jijinMessageIndex=messageIndex;
    state.__jijinMessagesByTab=messagesByTab;
  }

  if(typeof groupAnnotations==="function"){
    groupAnnotations=function(){
      ensureIndexes();
      const map={};
      state.annotations.forEach(annotation=>{
        if(annotation.parent_id)return;
        const start=messageIndex.get(annotation.message_id),end=messageIndex.get(annotation.end_message_id||annotation.message_id);
        if(start==null)return;
        for(let index=start;index<=(end??start);index++){
          const message=state.room.messages[index];
          if(message)(map[message.id]||=[]).push(annotation);
        }
      });
      return map;
    };
  }

  if(typeof markedText==="function"){
    markedText=function(message,annotations){
      if(!annotations?.length)return JijinLogFormat.render(message.text);
      ensureIndexes();
      const current=messageIndex.get(message.id);
      const ranges=[...annotations].sort((a,b)=>String(a.created_at||"").localeCompare(String(b.created_at||""))).map(annotation=>{
        const startIndex=messageIndex.get(annotation.message_id),endIndex=messageIndex.get(annotation.end_message_id||annotation.message_id)??startIndex;
        if(current<startIndex||current>endIndex)return null;
        return {
          start:current===startIndex?Math.max(0,annotation.start_offset):0,
          end:current===endIndex?Math.min(message.text.length,annotation.end_offset):message.text.length,
          id:annotation.id,
          color:annotationMarkerColor(annotation)
        };
      }).filter(range=>range&&range.end>range.start);
      const edges=[...new Set([0,message.text.length,...ranges.flatMap(r=>[r.start,r.end])])].sort((a,b)=>a-b);
      const segments=[];
      for(let i=0;i<edges.length-1;i++){
        const start=edges[i],end=edges[i+1],covering=ranges.filter(r=>r.start<=start&&r.end>=end);
        const winner=covering.find(r=>r.id===state.activeMarkerId)||covering[0];
        const previous=segments[segments.length-1];
        if(previous&&previous.winner?.id===winner?.id&&previous.end===start)previous.end=end;
        else segments.push({start,end,winner});
      }
      return JijinLogFormat.render(message.text,segments);
    };
  }

  if(typeof pagePanelHtml==="function"){
    pagePanelHtml=function(tab,realIndex,trackIndex,grouped,search,clone=""){
      ensureIndexes();
      const source=messagesByTab.get(tab)||[];
      const messages=search?source.filter(message=>`${message.speaker} ${message.text}`.toLowerCase().includes(search)):source;
      const rows=messages.map(message=>`<div class="page-row" data-time="${esc(message.time)}"><time>${esc(message.time)}</time>${messageHtml(message,grouped)}</div>`).join("");
      return `<section class="log-page" data-real-index="${realIndex}" data-track-index="${trackIndex}" data-clone="${clone}"><div class="page-scroll">${rows||'<div class="log-empty-spinner" role="status" aria-label="読み込み中"><span></span></div>'}</div></section>`;
    };
  }

  function applyInitialAnnotations(payload){
    if(!payload?.data||payload.roomId!==state.roomId)return;
    const data=payload.data;
    if(Number(data.version)<Number(state.annotationVersion))return;
    const previous=state.annotations||[];
    const markerFields=list=>list.map(annotation=>[annotation.id,annotation.message_id,annotation.end_message_id,annotation.start_offset,annotation.end_offset,annotation.color]);
    const markersChanged=JSON.stringify(markerFields(data.annotations||[]))!==JSON.stringify(markerFields(previous));
    state.annotations=data.annotations||[];
    state.annotationVersion=Number(data.version)||0;
    if(state.room)renderComments();
    if(markersChanged&&state.room&&document.querySelector("#logPane .log-page"))renderLog(currentReadingTime());
  }

  window.addEventListener("jijinboard-initial-annotations",event=>applyInitialAnnotations(event.detail));
  if(window.__jijinInitialAnnotations)queueMicrotask(()=>applyInitialAnnotations(window.__jijinInitialAnnotations));
})();
