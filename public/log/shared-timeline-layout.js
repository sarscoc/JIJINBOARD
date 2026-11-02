'use strict';
// One chronological slot and one measured row height are shared by every tab.
(()=>{
 let slotsCache=null,layoutCache=null,resizeFrame=0;
 const hiddenKey=()=>[...(state.hiddenTabs||[])].sort().join('\u0000');
 function estimate(list,width){
  const font=parseFloat(document.documentElement.style.getPropertyValue('--log-font-size'))||12.5;
  const columns=Math.max(8,Math.floor((width-70)/(font*.8)));
  return Math.max(30,8+list.reduce((height,m)=>height+Math.max(1,String((m.speaker||'')+(m.text||'')).split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil(line.length/columns)),0))*font*1.8+8,0));
 }
 sharedTimelineSlots=function(messages){
  const hidden=hiddenKey();
  if(slotsCache?.messages===messages&&slotsCache.length===messages.length&&slotsCache.hidden===hidden)return slotsCache.slots;
  const slots=[],byKey=new Map();let day=0,previousClock=null,previousOrder=0;
  messages.forEach((message,index)=>{
   if(state.hiddenTabs.has(message.tab))return;
   const time=String(message.time||''),match=time.match(/(?:^|\s)(\d{1,2}):(\d{2})(?::(\d{2}))?(?:$|\s)/);
   let order=previousOrder,key;
   if(match&&Number(match[1])<24&&Number(match[2])<60){
    const clock=Number(match[1])*3600+Number(match[2])*60+Number(match[3]||0);
    if(previousClock!==null&&previousClock-clock>12*3600)day++;
    previousClock=clock;order=day*86400+clock;previousOrder=order;key='time:'+order;
   }else{order=previousOrder+(index+1)/Math.max(1,messages.length+1);key='untimed:'+index}
   let slot=byKey.get(key);if(!slot){slot={key,time,order,sourceOrder:index,byTab:new Map()};byKey.set(key,slot);slots.push(slot)}
   const list=slot.byTab.get(message.tab)||[];list.push(message);slot.byTab.set(message.tab,list);
  });
  slots.sort((a,b)=>a.order-b.order||a.sourceOrder-b.sourceOrder);
  for(const slot of slots)slot.height=Math.max(30,...[...slot.byTab.values()].map(list=>estimate(list,640)));
  slotsCache={messages,length:messages.length,hidden,slots};layoutCache=null;return slots;
 };
 function heights(slots,grouped,search=''){
  const pane=document.getElementById('logPane');
  const width=Math.max(120,Math.round(pane?.clientWidth||document.querySelector('.log-page')?.getBoundingClientRect().width||innerWidth||640));
  const font=document.documentElement.style.getPropertyValue('--log-font-size'),revision=Number(state.annotationVersion)||0;
  if(layoutCache?.slots===slots&&layoutCache.width===width&&layoutCache.font===font&&layoutCache.revision===revision&&layoutCache.search===search)return layoutCache.heights;
  const result=slots.map(slot=>Math.max(30,...[...slot.byTab.values()].map(list=>estimate(list,width))));
  const measure=document.createElement('section');measure.className='log-page';measure.setAttribute('aria-hidden','true');
  measure.style.cssText=`position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;width:${width}px;height:auto;contain:layout style;`;
  const scroll=document.createElement('div');scroll.className='page-scroll timeline-page';scroll.style.cssText='height:auto;max-height:none;overflow-y:scroll;';measure.append(scroll);
  slots.forEach((slot,index)=>{
   for(const messages of slot.byTab.values()){
    const list=messages.filter(m=>!search||`${m.speaker} ${m.text}`.toLowerCase().includes(search));if(!list.length)continue;
    const row=document.createElement('div');row.className='page-row timeline-slot has-message';row.dataset.measureSlot=String(index);
    row.innerHTML=`<time>${esc(slot.time)}</time><div class="timeline-slot-content">${list.map(m=>messageHtml(m,grouped)).join('')}</div>`;scroll.append(row);
   }
  });
  document.body.append(measure);
  try{
   const measured=new Map();
   for(const row of scroll.children){const height=Math.ceil(row.getBoundingClientRect().height);if(height>0){const i=Number(row.dataset.measureSlot);measured.set(i,Math.max(measured.get(i)||30,height))}}
   for(const [index,height]of measured)result[index]=height;
  }finally{measure.remove()}
  slots.forEach((slot,index)=>slot.height=result[index]);
  layoutCache={slots,width,font,revision,search,heights:result};return result;
 }
 function invalidate(){
  layoutCache=null;if(state.viewMode!=='timeline'||!state.room)return;
  cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>{if(state.viewMode==='timeline'&&typeof renderLog==='function')renderLog(typeof currentReadingTime==='function'?currentReadingTime():'')});
 }
 window.addEventListener('resize',invalidate);
 document.getElementById('fontSize')?.addEventListener('input',invalidate);
 document.fonts?.addEventListener('loadingdone',invalidate);
 window.JijinTimelineLayout={heights,invalidate};
 // The non-virtual/archive renderer follows the same geometry.
 timelinePagePanelHtml=function(tab,realIndex,trackIndex,slots,grouped,search,clone=''){
  const sizes=heights(slots,grouped,search);
  const rows=slots.map((slot,index)=>{const list=(slot.byTab.get(tab)||[]).filter(m=>!search||`${m.speaker} ${m.text}`.toLowerCase().includes(search));return `<div class="page-row timeline-slot ${list.length?'has-message':'empty-slot'}" data-slot-index="${index}" data-time="${esc(slot.time)}" style="height:${sizes[index]}px;min-height:${sizes[index]}px;box-sizing:border-box"><time>${esc(slot.time)}</time><div class="timeline-slot-content">${list.map(m=>messageHtml(m,grouped)).join('')}</div></div>`}).join('');
  return `<section class="log-page" data-real-index="${realIndex}" data-track-index="${trackIndex}" data-clone="${clone}"><div class="page-scroll timeline-page">${rows}</div></section>`;
 };
})();
