(()=>{
  "use strict";
  if(/\/spreadsheet(?:\/|$)/.test(location.pathname))return;

  const TOKEN_KEY="jijinboardPlayerMasterToken.v1";
  const PLAYER_KEY="jijinboardPlayerMasterId.v1";
  const PEOPLE_KEY="trpgProjectPeople.v1";
  const params=new URL(location.href).searchParams;
  const boardId=params.get("board")||params.get("id")||"";
  const roomId=()=>String((typeof state!=="undefined"&&state?.roomId)||params.get("room")||"");
  let master=null,token="",playerId="",syncTimer=0,applying=false,roomSelection=[];

  const read=(key,fallback)=>{try{const value=JSON.parse(localStorage.getItem(key)||"");return value??fallback}catch{return fallback}};
  const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value))}catch{}return value};
  const profile=()=>typeof state!=="undefined"&&state?.profile?state.profile:read("trpgMarkerProfile",null);
  const named=list=>(Array.isArray(list)?list:[]).filter(item=>item&&String(item.name||"").trim());
  const api=async(path,options={})=>{const headers={"content-type":"application/json",...(options.headers||{})};if(token)headers["x-player-token"]=token;const response=await fetch(path,{...options,headers});const data=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(new Error(data.error||`通信エラー (${response.status})`),{status:response.status});return data};
  const charPayload=item=>({id:String(item.id||item.projectPersonId||""),type:String(item.type||"PC"),name:String(item.name||""),icon:String(item.icon||item.baseIcon||""),matrixIcon:String(item.matrixIcon||""),color:String(item.color||"#ffe66b"),colorDark:String(item.colorDark||item.color||"#ffe66b")});

  function localCandidates(){
    const p=profile();if(!p?.id)return[];
    const people=read(PEOPLE_KEY,[]),pls=people.filter(item=>item?.type==="PL");
    const owned=people.filter(item=>["PC","NPC"].includes(String(item?.type||""))&&(String(item.plId||"")===String(p.id)||(!item.plId&&pls.length<=1)));
    const personas=typeof state!=="undefined"?named(state.profile?.personas):[];
    const map=new Map();
    for(const item of [...owned,...personas]){const data=charPayload(item),key=data.id||`${data.type}:${data.name}`;if(data.name&&!map.has(key))map.set(key,data)}
    return [...map.values()];
  }

  function mergeMasterLocal(nextMaster){
    if(!nextMaster)return;
    const people=read(PEOPLE_KEY,[]),byId=new Map(people.map(item=>[String(item?.id||""),item]));
    const plExisting=byId.get(nextMaster.playerId)||{};
    byId.set(nextMaster.playerId,{...plExisting,id:nextMaster.playerId,type:"PL",name:nextMaster.plName,icon:nextMaster.plIcon||plExisting.icon||"",color:nextMaster.plColor||plExisting.color||"#ffe66b",plId:""});
    for(const ch of nextMaster.characters||[]){const old=byId.get(String(ch.id))||{};byId.set(String(ch.id),{...old,id:String(ch.id),type:ch.type||"PC",name:ch.name,icon:ch.icon||old.icon||"",matrixIcon:ch.matrixIcon||old.matrixIcon||"",color:ch.color||old.color||"#ffe66b",colorDark:ch.colorDark||old.colorDark||ch.color||"#ffe66b",plId:nextMaster.playerId})}
    write(PEOPLE_KEY,[...byId.values()]);
    window.dispatchEvent(new CustomEvent("jijinboard-player-master-updated",{detail:{master:nextMaster}}));
  }

  async function bootstrap(){
    const p=profile();if(!p?.id||!String(p.plName||"").trim())return null;
    playerId=String(localStorage.getItem(PLAYER_KEY)||p.id);token=String(localStorage.getItem(TOKEN_KEY)||"");
    const payload={playerId,plName:p.plName,plIcon:p.plIcon||"",plColor:p.plColor||"#ffe66b",plColorDark:p.plColorDark||p.plColor||"#ffe66b",characters:localCandidates()};
    let result;
    try{result=await api("/api/player-master/",{method:"POST",body:JSON.stringify(payload)})}
    catch(error){if(error.status===403&&playerId!==String(p.id)){playerId=String(p.id);token="";result=await api("/api/player-master/",{method:"POST",body:JSON.stringify({...payload,playerId})})}else throw error}
    token=String(result.accessToken||token);playerId=String(result.playerId||playerId);if(token)localStorage.setItem(TOKEN_KEY,token);if(playerId)localStorage.setItem(PLAYER_KEY,playerId);master=result.master||null;mergeMasterLocal(master);return master;
  }

  function masterPc(id){return(master?.characters||[]).find(ch=>String(ch.id)===String(id)&&ch.type==="PC")||null}
  function personaFromMaster(ch){return{id:String(ch.id),projectPersonId:String(ch.id),name:ch.name,type:"PC",icon:ch.icon||"",matrixIcon:ch.matrixIcon||"",color:ch.color||"#ffe66b",colorDark:ch.colorDark||ch.color||"#ffe66b"}}

  async function inferRoomSelection(){
    const current=named(typeof state!=="undefined"?state.profile?.personas:[]),ids=[];
    for(const persona of current){const hit=(master?.characters||[]).find(ch=>ch.type==="PC"&&(String(ch.id)===String(persona.projectPersonId||persona.id)||ch.name===persona.name));if(hit&&!ids.includes(String(hit.id)))ids.push(String(hit.id))}
    if(ids.length)return ids;
    if(boardId&&roomId())try{const board=await fetch(`/api/boards/${encodeURIComponent(boardId)}`,{cache:"no-store"}).then(r=>r.ok?r.json():null);const log=(board?.logs||[]).find(item=>item.roomId===roomId());for(const person of log?.participants||[]){if(String(person.authorId)!==String(playerId))continue;const hit=(master?.characters||[]).find(ch=>ch.type==="PC"&&(String(ch.id)===String(person.personaId)||ch.name===person.name));if(hit&&!ids.includes(String(hit.id)))ids.push(String(hit.id))}}catch{}
    const pcs=(master?.characters||[]).filter(ch=>ch.type==="PC");if(!ids.length&&pcs.length===1)ids.push(String(pcs[0].id));
    return ids;
  }

  async function setRoomSelection(ids,{persist=true}={}){
    ids=[...new Set((ids||[]).map(String).filter(id=>masterPc(id)))];roomSelection=ids;
    if(persist&&playerId&&token&&roomId())await api(`/api/player-master/room?playerId=${encodeURIComponent(playerId)}`,{method:"PUT",body:JSON.stringify({playerId,boardId,roomId:roomId(),characterIds:ids})});
    if(typeof state!=="undefined"&&state.profile&&roomId()){
      applying=true;state.profile.personas=ids.map(id=>personaFromMaster(masterPc(id))).filter(Boolean);
      try{localStorage.setItem(`personas:${roomId()}`,JSON.stringify(state.profile.personas))}catch{}
      try{saveProfile?.()}catch{};try{renderPersonas?.()}catch{};try{fillPersonaSelect?.()}catch{};try{emitIntegratedProfile?.()}catch{};applying=false;
    }
    renderRoomPicker();
  }

  async function hydrateRoom(){
    if(!master||!playerId||!token||!roomId())return;
    let ids=[];try{const result=await api(`/api/player-master/room?playerId=${encodeURIComponent(playerId)}&boardId=${encodeURIComponent(boardId)}&roomId=${encodeURIComponent(roomId())}`);ids=Array.isArray(result.characterIds)?result.characterIds.map(String):[]}catch{}
    if(!ids.length){ids=await inferRoomSelection();if(ids.length)await setRoomSelection(ids,{persist:true});else{roomSelection=[];renderRoomPicker();return}}
    await setRoomSelection(ids,{persist:false});
  }

  function renderRoomPicker(){
    const dialog=document.querySelector("#profileDialog"),list=document.querySelector("#personaList");if(!dialog||!list||!master)return;
    let box=dialog.querySelector("#masterRoomPcPicker");if(!box){box=document.createElement("section");box.id="masterRoomPcPicker";box.style.cssText="margin:10px 0 4px;padding:9px;border:1px solid #e2e6eb;border-radius:10px;background:#fafbfc";list.insertAdjacentElement("afterend",box)}
    const pcs=(master.characters||[]).filter(ch=>ch.type==="PC");box.innerHTML=`<div style="font-size:9px;font-weight:800;letter-spacing:.08em;margin-bottom:7px">この部屋で使うPC</div>${pcs.length?pcs.map(ch=>`<label style="display:flex;align-items:center;gap:7px;padding:4px 0;font-size:11px"><input type="checkbox" data-master-room-pc="${String(ch.id).replace(/"/g,"&quot;")}" ${roomSelection.includes(String(ch.id))?"checked":""}><span>${String(ch.name).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]))}</span></label>`).join(""):"<div style='font-size:10px;color:#8a929d'>PEOPLEにPCを追加してください。</div>"}`;
    box.querySelectorAll("[data-master-room-pc]").forEach(input=>input.onchange=()=>setRoomSelection([...box.querySelectorAll("[data-master-room-pc]:checked")].map(node=>node.dataset.masterRoomPc),{persist:true}).catch(console.warn));
  }

  async function pushCurrent(){
    if(applying||!master||!playerId||!token)return;
    const p=profile();if(!p)return;const chars=typeof state!=="undefined"?named(state.profile?.personas).map(charPayload):localCandidates();
    try{const result=await api(`/api/player-master/?playerId=${encodeURIComponent(playerId)}`,{method:"PUT",body:JSON.stringify({playerId,plName:p.plName,plIcon:p.plIcon||"",plColor:p.plColor||"#ffe66b",plColorDark:p.plColorDark||p.plColor||"#ffe66b",characters:chars})});master=result.master||master;mergeMasterLocal(master);if(roomId()){for(const ch of chars){if(ch.type==="PC"&&!roomSelection.includes(String(ch.id)))roomSelection.push(String(ch.id))}await setRoomSelection(roomSelection,{persist:true})}}
    catch(error){console.warn("Player master sync failed",error)}
  }
  const schedulePush=()=>{if(applying)return;clearTimeout(syncTimer);syncTimer=setTimeout(pushCurrent,350)};

  async function issueDeviceCode(){if(!master)await bootstrap();if(!playerId||!token)return alert("先にPL名を登録してください。");try{const result=await api(`/api/player-master/code?playerId=${encodeURIComponent(playerId)}`,{method:"POST",body:JSON.stringify({playerId})});await navigator.clipboard?.writeText(result.code).catch(()=>{});alert(`端末追加コード：${result.code}\n10分以内にスマホの「引き継ぎ設定」で入力してください。\nPC側のアクセス権はそのまま残ります。`)}catch(error){alert(error.message)}}
  async function redeemDeviceCode(){const input=document.querySelector("#transferCodeInput"),code=String(input?.value||"").trim();if(!/^\d{4}$/.test(code))return alert("4桁のコードを入力してください。");try{const result=await fetch(`/api/player-master/redeem/${encodeURIComponent(code)}`,{method:"POST",headers:{"content-type":"application/json"}}).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"引き継げませんでした");return d});playerId=String(result.playerId);token=String(result.accessToken);master=result.master;localStorage.setItem(PLAYER_KEY,playerId);localStorage.setItem(TOKEN_KEY,token);mergeMasterLocal(master);if(typeof state!=="undefined"&&state.profile){state.profile.id=playerId;state.profile.plName=master.plName;state.profile.plIcon=master.plIcon||"";state.profile.plColor=master.plColor||"#ffe66b";state.profile.plColorDark=master.plColorDark||master.plColor||"#ffe66b";try{saveProfile?.()}catch{};await hydrateRoom();try{renderPlIcon?.();renderPersonas?.();fillPersonaSelect?.();emitIntegratedProfile?.()}catch{}}if(input)input.value="";alert("この端末から同じPL・PCマスターを使えるようになりました。") }catch(error){alert(error.message)}}

  async function start(){
    try{await bootstrap();if(typeof state!=="undefined")await hydrateRoom()}catch(error){console.warn("Player master bootstrap failed",error)}
    const issue=document.querySelector("#issueTransferBtn"),redeem=document.querySelector("#redeemTransferBtn");if(issue){issue.textContent="スマホ・別端末を追加";issue.onclick=issueDeviceCode}if(redeem)redeem.onclick=redeemDeviceCode;
    if(typeof state!=="undefined"){
      document.addEventListener("input",event=>{if(event.target.closest?.("#plName,[data-persona-name],[data-persona-color],[data-persona-color-dark]"))schedulePush()});
      document.addEventListener("change",event=>{if(event.target.closest?.("#plIconInput,[data-persona-icon],[data-matrix-icon]"))setTimeout(schedulePush,50)});
      document.addEventListener("click",event=>{if(event.target.closest?.("#savePersonaBtn,[data-remove-persona]"))setTimeout(schedulePush,80)});
      window.addEventListener("jijinboard-player-master-updated",renderRoomPicker);
    }
  }

  window.JIJINPlayerMaster={get master(){return master},get playerId(){return playerId},bootstrap,hydrateRoom,pushCurrent,setRoomSelection,issueDeviceCode,redeemDeviceCode};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();
