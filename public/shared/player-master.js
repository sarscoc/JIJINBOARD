(()=>{
  "use strict";
  if(/\/spreadsheet(?:\/|$)/.test(location.pathname))return;
  if(window.JIJINPlayerMaster)return;

  const TOKEN_KEY="jijinboardPlayerMasterToken.v1";
  const PLAYER_KEY="jijinboardPlayerMasterId.v1";
  const PEOPLE_KEY="trpgProjectPeople.v1";
  const params=new URL(location.href).searchParams;
  const boardId=params.get("board")||params.get("id")||"";
  if(!boardId)return;
  const root=`/api/boards/${encodeURIComponent(boardId)}/players`;
  const endpoint=(tail='')=>`${root}/${encodeURIComponent(playerId)}${tail}`;
  const roomId=()=>String((typeof state!=="undefined"&&state?.roomId)||params.get("room")||boardId||"");
  let master=null,token="",playerId="",syncTimer=0,applying=false,roomSelection=[],hydratingRoom="";

  const read=(key,fallback)=>{try{const value=JSON.parse(localStorage.getItem(key)||"");return value??fallback}catch{return fallback}};
  const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value))}catch{}return value};
  const profile=()=>typeof state!=="undefined"&&state?.profile?state.profile:read("trpgMarkerProfile",null);
  const named=list=>(Array.isArray(list)?list:[]).filter(item=>item&&String(item.name||"").trim());
  const api=async(path,options={})=>{const headers={"content-type":"application/json",...(options.headers||{})};if(token)headers["x-player-token"]=token;const response=await fetch(path,{...options,headers});const data=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(new Error(data.error||`通信エラー (${response.status})`),{status:response.status});return data};
  const charPayload=item=>({id:String(item.id||item.projectPersonId||""),type:String(item.type||"PC"),name:String(item.name||""),icon:String(item.icon||item.baseIcon||""),matrixIcon:String(item.matrixIcon||""),color:String(item.color||"#ffe66b"),colorDark:String(item.colorDark||item.color||"#ffe66b")});

  function localCandidates(){
    const p=profile();if(!p?.id)return[];
    const people=read(PEOPLE_KEY,[]),pls=people.filter(item=>item?.type==="PL"),currentPl=pls.find(item=>String(item.id||"")===String(p.id))||pls.find(item=>String(item.name||"")===String(p.plName||""))||null;
    const ownerIds=new Set([String(p.id||""),String(currentPl?.id||"")].filter(Boolean));
    const owned=people.filter(item=>{
      if(!["PC","NPC"].includes(String(item?.type||"")))return false;
      if(pls.length===1)return true;
      return ownerIds.has(String(item.plId||""));
    });
    const personas=typeof state!=="undefined"?named(state.profile?.personas):[];
    const map=new Map();
    for(const item of [...personas,...owned]){const data=charPayload(item),key=data.id||`${data.type}:${data.name}`;if(data.name&&!map.has(key))map.set(key,data)}
    return [...map.values()];
  }

  function mergeMasterLocal(nextMaster,{notify=true}={}){
    if(!nextMaster)return;
    const deleted=new Set((nextMaster.deletedCharacterIds||[]).map(String));
    if(typeof state!=='undefined'&&state?.profile?.personas)state.profile.personas=state.profile.personas.filter(p=>!deleted.has(String(p.projectPersonId||p.id)));
    for(const k of window.JijinRoomStorage?.keys()||[]){if(k?.startsWith('personas:'))write(k,named(read(k,[])).filter(p=>!deleted.has(String(p.projectPersonId||p.id))));
    }
    const people=read(PEOPLE_KEY,[]).filter(p=>!deleted.has(String(p.id))),byId=new Map(people.map(item=>[String(item?.id||""),item]));
    const existingPl=[...byId.values()].find(item=>item?.type==="PL"&&(String(item.id)===String(nextMaster.playerId)||String(item.name||"")===String(nextMaster.plName||"")))||{};
    if(existingPl.id&&String(existingPl.id)!==String(nextMaster.playerId))byId.delete(String(existingPl.id));
    byId.set(nextMaster.playerId,{...existingPl,id:nextMaster.playerId,type:"PL",name:nextMaster.plName,icon:nextMaster.plIcon||existingPl.icon||"",color:nextMaster.plColor||existingPl.color||"#ffe66b",plId:""});
    for(const ch of nextMaster.characters||[]){const old=byId.get(String(ch.id))||{};byId.set(String(ch.id),{...old,id:String(ch.id),type:ch.type||"PC",name:ch.name,icon:ch.icon||old.icon||"",matrixIcon:ch.matrixIcon||old.matrixIcon||"",color:ch.color||old.color||"#ffe66b",colorDark:ch.colorDark||old.colorDark||ch.color||"#ffe66b",plId:nextMaster.playerId})}
    write(PEOPLE_KEY,[...byId.values()]);
    document.querySelector("#masterRoomPcPicker")?.remove();
    if(notify)window.dispatchEvent(new CustomEvent("jijinboard-player-master-updated",{detail:{master:nextMaster}}));
  }

  async function bootstrapOnce(){
    const p=profile();if(!p?.id||!String(p.plName||"").trim())return null;
    playerId=String(localStorage.getItem(PLAYER_KEY)||p.id);token=String(localStorage.getItem(TOKEN_KEY)||"");
    const payload={playerId,plName:p.plName,plIcon:p.plIcon||"",plColor:p.plColor||"#ffe66b",plColorDark:p.plColorDark||p.plColor||"#ffe66b"};
    let result;
    try{result=await api(root,{method:"POST",body:JSON.stringify(payload)})}
    catch(error){if(error.status===403&&playerId!==String(p.id)){playerId=String(p.id);token="";result=await api(root,{method:"POST",body:JSON.stringify({...payload,playerId})})}else throw error}
    token=String(result.accessToken||token);playerId=String(result.playerId||playerId);if(token)localStorage.setItem(TOKEN_KEY,token);if(playerId)localStorage.setItem(PLAYER_KEY,playerId);master=result.master||null;mergeMasterLocal(master);return master;
  }

  let bootstrapTask=null;
  async function bootstrap(){
    if(bootstrapTask)return bootstrapTask;
    const task=bootstrapOnce();bootstrapTask=task;
    try{return await task}finally{if(bootstrapTask===task)bootstrapTask=null}
  }

  // Server snapshots replace the current room's profile, including an empty PC list.
  function applySnapshot(next){
    if(!next)return;
    master=next;
    const personas=(next.characters||[]).filter(ch=>ch.type==='PC').map(personaFromMaster);
    const current=profile()||{};
    const updated={...current,id:next.playerId,plName:next.plName,plIcon:next.plIcon||'',plColor:next.plColor||'#ffe66b',plColorDark:next.plColorDark||next.plColor||'#ffe66b',personas};
    write('trpgMarkerProfile',updated);
    const swatches={PL:{light:updated.plColor,dark:updated.plColorDark}};
    for(const p of personas)swatches[p.id]={light:p.color,dark:p.colorDark};
    write(`jijinboardSelectedColors:${boardId}:${next.playerId}`,swatches);
    write('trpgMarkerProfileColorsV2',{plColorDark:updated.plColorDark});
    for(const k of window.JijinRoomStorage?.keys()||[])if(k.startsWith('personas:'))write(k,personas);
    if(typeof state!=='undefined'){
      state.profile=updated;
      if(state.roomId)write(`personas:${state.roomId}`,personas);
      try{renderPlIcon?.();renderPersonas?.();fillPersonaSelect?.();emitIntegratedProfile?.();heartbeatPresence?.()}catch{}
    }
    // Drop old candidates belonging to this PL instead of merging deleted/empty lists.
    write(PEOPLE_KEY,read(PEOPLE_KEY,[]).filter(p=>String(p.id)!==String(next.playerId)&&String(p.plId)!==String(next.playerId)));
    mergeMasterLocal(next);
  }
  let refreshTask=null,refreshVersion=0;
  async function refresh(){
    ++refreshVersion;
    if(pushRunning||syncTimer)return;
    if(!playerId||!token)return bootstrap();
    if(refreshTask)return refreshTask;
    refreshTask=(async()=>{
      let applied=0;
      while(applied<refreshVersion){
        const version=refreshVersion,result=await api(endpoint());
        if(version!==refreshVersion)continue;
        if(!pushRunning&&!syncTimer)applySnapshot(result.master);
        applied=version;
      }
      return master;
    })().finally(()=>{refreshTask=null});
    return refreshTask;
  }
  async function updateProfile(value){
    if(!master)await bootstrap();
    if(!playerId||!token)throw Error('先にPL名を登録してください');
    const result=await api(endpoint(),{method:'PUT',body:JSON.stringify({...value,playerId})});
    const ids=(result.master.characters||[]).filter(c=>c.type==='PC').map(c=>c.id);
    await persistRoomSelection(ids);
    applySnapshot(result.master);
    return master;
  }
  function connectUpdates(){
    if(typeof WebSocket==='undefined')return;
    let socket=null,timer=0,stopped=false,attempt=0;
    const catchUp=()=>refresh().catch(error=>console.warn('Player refresh failed',error));
    function connect(){
      clearTimeout(timer);if(stopped||socket&&socket.readyState<2)return;
      const ws=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/api/boards/${encodeURIComponent(boardId)}/realtime`);socket=ws;
      ws.addEventListener('open',()=>{attempt=0;catchUp()});
      ws.addEventListener('message',event=>{let message;try{message=JSON.parse(event.data)}catch{return}if(message.type==='refresh'&&message.action==='participants')catchUp()});
      ws.addEventListener('close',()=>{if(socket!==ws)return;socket=null;if(!stopped)timer=setTimeout(connect,Math.min(15000,500*2**attempt++))});
      ws.addEventListener('error',()=>ws.close());
    }
    addEventListener('online',()=>{connect();catchUp()});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden){connect();catchUp()}});
    addEventListener('pagehide',()=>{stopped=true;clearTimeout(timer);socket?.close()});
    addEventListener('pageshow',()=>{stopped=false;connect()});
    connect();
  }

  function masterPc(id){return(master?.characters||[]).find(ch=>String(ch.id)===String(id)&&ch.type==="PC")||null}
  function personaFromMaster(ch){return{id:String(ch.id),projectPersonId:String(ch.id),name:ch.name,type:"PC",icon:ch.icon||"",matrixIcon:ch.matrixIcon||"",color:ch.color||"#ffe66b",colorDark:ch.colorDark||ch.color||"#ffe66b"}}

  async function persistRoomSelection(ids){
    const rid=roomId();if(!rid||!playerId||!token)return;
    ids=[...new Set((ids||[]).map(String).filter(Boolean))];
    await api(endpoint('/selection'),{method:"PUT",body:JSON.stringify({playerId,boardId,roomId:rid,characterIds:ids})});
  }

  async function setRoomSelection(ids,{persist=true}={}){
    const rid=roomId();if(!rid)return;
    ids=[...new Set((ids||[]).map(String).filter(id=>masterPc(id)))];roomSelection=ids;
    if(persist)await persistRoomSelection(ids);
    if(typeof state!=="undefined"&&state.profile){
      applying=true;state.profile.personas=ids.map(id=>personaFromMaster(masterPc(id))).filter(Boolean);
      try{localStorage.setItem(`personas:${rid}`,JSON.stringify(state.profile.personas))}catch{}
      try{saveProfile?.()}catch{};try{renderPersonas?.()}catch{};try{fillPersonaSelect?.()}catch{};try{emitIntegratedProfile?.()}catch{};applying=false;
    }
    document.querySelector("#masterRoomPcPicker")?.remove();
  }

  async function hydrateRoom(){
    const rid=roomId();if(!master||!playerId||!token||!rid)return;
    if(hydratingRoom===rid)return;hydratingRoom=rid;
    try{
      const result=await api(endpoint('/selection')),ids=Array.isArray(result.characterIds)?result.characterIds.map(String):[];
      await setRoomSelection(ids,{persist:false});
    }finally{hydratingRoom=""}
  }

  let pushRunning=null,pushQueued=false;
  function pushCurrent(){
    if(pushRunning){pushQueued=true;return pushRunning}
    pushRunning=(async()=>{do{pushQueued=false;await pushSnapshot()}while(pushQueued)})().finally(()=>{pushRunning=null});
    return pushRunning;
  }
  async function pushSnapshot(){
    if(applying)return;
    if(!master||!playerId||!token)await bootstrap();
    if(!master||!playerId||!token)return;
    const p=profile();if(!p)return;
    const roomChars=typeof state!=="undefined"?named(state.profile?.personas).map(charPayload):[];
    const candidates=localCandidates(),map=new Map();
    for(const ch of [...roomChars,...candidates]){const key=String(ch.id||`${ch.type}:${ch.name}`);if(ch.name&&!map.has(key))map.set(key,ch)}
    const chars=[...map.values()];
    try{
      const result=await api(endpoint(),{method:"PUT",body:JSON.stringify({playerId,plName:p.plName,plIcon:p.plIcon||"",plColor:p.plColor||"#ffe66b",plColorDark:p.plColorDark||p.plColor||"#ffe66b",characters:chars})});
      master=result.master||master;
      mergeMasterLocal(master,{notify:false});
      if(roomId()){
        roomSelection=roomChars.filter(ch=>masterPc(ch.id)).map(ch=>String(ch.id));
        await persistRoomSelection(roomSelection);
        try{parent.postMessage({type:"jijinboard-participants-saved",boardId},location.origin)}catch{}
      }
      window.dispatchEvent(new CustomEvent("jijinboard-player-master-saved",{detail:{master}}));
    }catch(error){console.warn("Player master sync failed",error)}
  }
  const schedulePush=(delay=120)=>{if(applying)return;clearTimeout(syncTimer);syncTimer=setTimeout(()=>{syncTimer=0;pushCurrent()},delay)};

  async function issueDeviceCode(){if(!master)await bootstrap();if(!playerId||!token)return alert("先にPL名を登録してください。");try{const result=await api(endpoint('/code'),{method:"POST",body:JSON.stringify({playerId})});await navigator.clipboard?.writeText(result.code).catch(()=>{});alert(`端末追加コード：${result.code}\n10分以内にスマホの「引き継ぎ設定」で入力してください。\nPC側のアクセス権はそのまま残ります。`)}catch(error){alert(error.message)}}
  async function redeemDeviceCode(){const input=document.querySelector("#transferCodeInput"),code=String(input?.value||"").trim();if(!/^\d{4}$/.test(code))return alert("4桁のコードを入力してください。");try{const result=await fetch(`${root}/redeem/${encodeURIComponent(code)}`,{method:"POST",headers:{"content-type":"application/json"}}).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"引き継げませんでした");return d});playerId=String(result.playerId);token=String(result.accessToken);master=result.master;localStorage.setItem(PLAYER_KEY,playerId);localStorage.setItem(TOKEN_KEY,token);applySnapshot(master);if(typeof state!=="undefined"&&state.profile){state.profile.id=playerId;state.profile.plName=master.plName;state.profile.plIcon=master.plIcon||"";state.profile.plColor=master.plColor||"#ffe66b";state.profile.plColorDark=master.plColorDark||master.plColor||"#ffe66b";try{saveProfile?.()}catch{};await hydrateRoom();try{renderPlIcon?.();renderPersonas?.();fillPersonaSelect?.();emitIntegratedProfile?.()}catch{}}if(input)input.value="";alert("この端末から同じPL・PCマスターを使えるようになりました。") }catch(error){alert(error.message)}}

  async function deleteCharacter(id){
    if(!master)await bootstrap();if(!playerId||!token)throw Error('先にPL名を登録してください');
    await api(endpoint('/characters/'+encodeURIComponent(id)),{method:'DELETE',body:JSON.stringify({playerId})});
    const result=await api(endpoint());master=result.master;mergeMasterLocal(master);await hydrateRoom();
  }
  function hookRoomLoad(){
    if(typeof window.loadRoomPersonas!=="function"||window.loadRoomPersonas.__jijinMasterHooked)return;
    const original=window.loadRoomPersonas;
    const wrapped=function(...args){const result=original.apply(this,args);queueMicrotask(()=>hydrateRoom().catch(error=>console.warn("Room master hydrate failed",error)));return result};
    wrapped.__jijinMasterHooked=true;window.loadRoomPersonas=wrapped;
  }

  if(typeof state!=='undefined'){
      document.addEventListener('click',event=>{
        const button=event.target.closest?.('[data-remove-persona]');if(!button)return;
        event.preventDefault();event.stopImmediatePropagation();
        const persona=state.profile?.personas?.[Number(button.dataset.removePersona)];if(!persona)return;
        button.disabled=true;deleteCharacter(persona.projectPersonId||persona.id).catch(error=>{alert(error.message);button.disabled=false});
      },true);
  }

  async function start(){
    document.querySelector("#masterRoomPcPicker")?.remove();
    try{await window.JijinBoardReady?.image;await bootstrap();hookRoomLoad();if(typeof state!=="undefined")await hydrateRoom();connectUpdates()}catch(error){console.warn("Player master bootstrap failed",error)}finally{window.JijinBoardReady?.finishProfile()}
    const issue=document.querySelector("#issueTransferBtn"),redeem=document.querySelector("#redeemTransferBtn");if(issue){issue.textContent="スマホ・別端末を追加";issue.onclick=issueDeviceCode}if(redeem)redeem.onclick=redeemDeviceCode;
    if(typeof state!=="undefined"){
      document.addEventListener("change",event=>{
        if(event.target.closest?.("#plName,[data-persona-name],[data-persona-color],[data-persona-color-dark],#plIconInput,[data-persona-icon],[data-matrix-icon]"))schedulePush(80);
      });
      document.addEventListener("click",event=>{if(event.target.closest?.("#savePersonaBtn,[data-remove-persona]"))schedulePush(100)});
    }
  }

  function scheduleStart(){
    const embeddedLog=params.get("embedded")==="1"&&/\/log(?:\/|$)/.test(location.pathname);
    if(!embeddedLog){start();return}
    const run=()=>start();
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      if(typeof requestIdleCallback==="function")requestIdleCallback(run,{timeout:900});
      else setTimeout(run,250);
    }));
  }

  window.JIJINPlayerMaster={get master(){return master},get playerId(){return playerId},bootstrap,refresh,updateProfile,hydrateRoom,pushCurrent,deleteCharacter,setRoomSelection,issueDeviceCode,redeemDeviceCode};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",scheduleStart,{once:true});else scheduleStart();
})();
