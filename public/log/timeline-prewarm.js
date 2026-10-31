"use strict";
(()=>{
  const originalSlots=sharedTimelineSlots,originalRender=renderLog;
  let prepared=null,job=null,generation=0;
  const idle=callback=>window.requestIdleCallback?requestIdleCallback(callback,{timeout:1000}):setTimeout(()=>callback({timeRemaining:()=>4}),32);
  const signature=()=>[...state.hiddenTabs].sort().join("\u0000");
  const matches=(entry,messages)=>entry&&entry.messages===messages&&entry.length===messages.length&&entry.hidden===signature();
  sharedTimelineSlots=function(messages){
    if(matches(prepared,messages))return prepared.slots;
    const slots=originalSlots(messages);
    prepared={messages,length:messages.length,hidden:signature(),slots};
    return slots;
  };
  function prepare(){
    const messages=state.room?.messages;if(!messages||matches(prepared,messages)||matches(job,messages))return;
    const token=++generation,hidden=signature(),hiddenTabs=new Set(state.hiddenTabs),slots=[];
    job={messages,length:messages.length,hidden};
    let index=0,visibleIndex=0,heightIndex=0;
    function chunk(deadline){
      if(token!==generation||state.room?.messages!==messages||messages.length!==job?.length||signature()!==hidden){if(token===generation)job=null;return}
      let work=0;
      while(index<messages.length&&(work<150||deadline.timeRemaining()>1)&&work<600){
        const message=messages[index++];work++;
        if(hiddenTabs.has(message.tab))continue;
        const key=message.time||`untimed-${visibleIndex++}`;
        // The untimed index follows the original filtered message positions.
        if(message.time)visibleIndex++;
        let slot=slots[slots.length-1];
        if(!slot||slot.key!==key){slot={key,time:message.time,byTab:new Map()};slots.push(slot)}
        const list=slot.byTab.get(message.tab)||[];list.push(message);slot.byTab.set(message.tab,list);
      }
      if(index<messages.length){idle(chunk);return}
      work=0;
      while(heightIndex<slots.length&&work++<600){
        const slot=slots[heightIndex++],count=Math.min(3,[...slot.byTab.values()].reduce((sum,list)=>sum+list.length,0));
        slot.height=Math.min(110,Math.max(30,count?count*29+8:0));
      }
      if(heightIndex<slots.length){idle(chunk);return}
      prepared={messages,length:messages.length,hidden,slots};job=null;
    }
    idle(chunk);
  }
  renderLog=function(...args){const result=originalRender.apply(this,args);if(state.viewMode!=="timeline")prepare();return result};
  prepare();
})();
