(()=>{
  "use strict";
  const params=new URL(location.href).searchParams;
  const boardId=params.get("board")||"";
  if(!boardId||typeof window.renderComments!=="function")return;

  let participantMap=new Map(),loading=null,lastRoom="";
  const key=(authorId,name,type="PC")=>`${String(authorId||"")}\u001f${String(name||"")}\u001f${String(type||"PC")}`;

  function seedLocal(){
    try{
      const p=state?.profile;
      if(!p?.id)return;
      if(p.plName&&p.plIcon)participantMap.set(key(p.id,p.plName,"PL"),p.plIcon);
      for(const person of p.personas||[]){
        const icon=String(person?.icon||"");
        if(icon&&person?.name)participantMap.set(key(p.id,person.name,person.type||"PC"),icon);
      }
    }catch{}
  }

  async function loadParticipants(force=false){
    const room=String(state?.roomId||"");
    if(!room)return;
    if(!force&&room===lastRoom&&participantMap.size)return;
    if(loading)return loading;
    loading=(async()=>{
      const next=new Map();
      seedLocal();
      for(const [k,v] of participantMap)next.set(k,v);
      try{
        const response=await fetch(`/api/boards/${encodeURIComponent(boardId)}`,{cache:"no-store"});
        if(response.ok){
          const board=await response.json();
          const entry=(board.logs||[]).find(log=>String(log.roomId)===room);
          for(const person of entry?.participants||[]){
            const icon=String(person.baseIcon||person.icon||"");
            if(icon&&person.name)next.set(key(person.authorId,person.name,"PC"),icon);
          }
        }
      }catch{}
      participantMap=next;lastRoom=room;
    })();
    try{await loading}finally{loading=null}
  }

  function applyFallbacks(){
    seedLocal();
    let changed=false;
    for(const annotation of state?.annotations||[]){
      if(annotation?.persona_icon)continue;
      const icon=participantMap.get(key(annotation.author_id,annotation.persona_name,annotation.persona_type));
      if(icon){annotation.persona_icon=icon;changed=true}
    }
    return changed;
  }

  const rawRender=window.renderComments;
  window.renderComments=function(...args){applyFallbacks();return rawRender.apply(this,args)};

  const refresh=()=>loadParticipants(true).then(()=>{if(applyFallbacks())rawRender()}).catch(()=>{});
  window.addEventListener("jijinboard-player-master-saved",refresh);
  window.addEventListener("jijinboard-player-master-updated",refresh);
  window.addEventListener("storage",event=>{if(event.key===`personas:${state?.roomId}`||event.key==="trpgMarkerProfile")refresh()});
  setTimeout(refresh,250);
})();
