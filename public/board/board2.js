"use strict";

const $=selector=>document.querySelector(selector),params=new URL(location.href).searchParams,boardId=params.get("id");
const state={board:null,tool:"log",activeRoom:"",pendingRoom:"",editingRoom:"",summaries:{},opened:{},profile:null};

function esc(value=""){return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
async function api(path,options={}){const response=await fetch(path,{headers:{"content-type":"application/json",...(options.headers||{})},...options}),body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||`通信エラー (${response.status})`);return body}
function showBoardTitle(name){
 if(!name)return;
 $("#boardName").textContent=name;document.title=`${name} | JIJINBOARD`;
}
async function loadBoardTitle(){
 const header=await (window.JijinBoardReady?.title||api(`/api/boards/${encodeURIComponent(boardId)}?summary=1`,{cache:'no-store'}));
 showBoardTitle(header.name);
}
async function loadBoard(){
  let failure;
  for(let attempt=0;attempt<2;attempt++){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
    try{
      const data=attempt===0&&window.JijinBoardReady?.boardData?await window.JijinBoardReady.boardData:await api(`/api/boards/${encodeURIComponent(boardId)}`,{signal:controller.signal});
      if(!data?.id||!Array.isArray(data.logs))throw new Error('部屋情報の応答形式が正しくありません');
      return data;
    }catch(error){failure=error;if(attempt===0)$("#boardName").textContent="再接続中…";}
    finally{clearTimeout(timer)}
  }
  throw new Error(failure?.name==='AbortError'?'部屋情報の取得がタイムアウトしました。再読み込みしてください。':failure?.message||'部屋情報を取得できませんでした');
}
function adminToken(){return localStorage.getItem(`boardAdmin:${boardId}`)||JSON.parse(localStorage.getItem("jijinboardOwnedBoards.v1")||"{}")[boardId]?.adminToken||""}
function openedKey(){return `jijinboardOpenedLogs:${boardId}`}
function saveOpened(){try{sessionStorage.setItem(openedKey(),JSON.stringify(state.opened))}catch{}}
function loadOpened(){try{return JSON.parse(sessionStorage.getItem(openedKey())||"{}")||{}}catch{return{}}}
function validPersonas(value){return Array.isArray(value)?value.filter(persona=>persona&&typeof persona==="object"&&String(persona.name||"").trim()):[]}
function storedProfileForRoom(roomId=state.activeRoom){
  if(!roomId)return null;
  let base=null,personas=[];
  try{base=JSON.parse(localStorage.getItem("trpgMarkerProfile")||"null")}catch{}
  try{personas=validPersonas(JSON.parse(localStorage.getItem(`personas:${roomId}`)||"[]"))}catch{}
  if(!base?.id&&!base?.plName&&!personas.length)return null;
  return {id:String(base?.id||""),plName:String(base?.plName||""),plIcon:String(base?.plIcon||""),personas,__roomId:roomId};
}
function hydrateProfile(roomId=state.activeRoom){
  const stored=storedProfileForRoom(roomId);if(!stored)return state.profile;
  const current=state.profile&&state.profile.__roomId===roomId?state.profile:null;
  const storedPersonas=validPersonas(stored.personas),currentPersonas=validPersonas(current?.personas);
  state.profile={...(current||{}),...stored,personas:storedPersonas,__roomId:roomId};
  return state.profile;
}
function acceptProfile(message){
  const roomId=String(message?.roomId||"");
  if(!roomId||roomId!==state.activeRoom)return null;
  const incoming=message?.profile;if(!incoming||typeof incoming!=="object")return null;
  const current=hydrateProfile(roomId)||{},incomingPersonas=validPersonas(incoming.personas),currentPersonas=validPersonas(current.personas);
  const personas=incomingPersonas;
  const profile={...current,...incoming,personas,__roomId:roomId};
  state.profile=profile;
  try{localStorage.setItem(`personas:${roomId}`,JSON.stringify(personas))}catch{}
  return profile;
}
function logBridge(){try{return $("#logFrame")?.contentWindow?.JIJINBOARD_LOG_APP||null}catch{return null}}
function requestProfile(retries=4){
  const frame=$("#logFrame"),roomId=state.activeRoom;if(!frame?.contentWindow||!roomId)return;
  const bridge=logBridge();if(bridge?.requestProfile)bridge.requestProfile();else frame.contentWindow.postMessage({type:"jijinboard-request-profile"},location.origin);
  if(retries>0)setTimeout(()=>{if(state.activeRoom!==roomId)return;hydrateProfile(roomId);if(!validPersonas(state.profile?.personas).length)requestProfile(retries-1)},200);
}
function setLogActive(frame,active){try{const win=frame?.contentWindow;if(!win)return;const bridge=logBridge();if(bridge?.setActive)bridge.setActive(active);else{if(active)win.connectRealtime?.();else win.disconnectRealtime?.();win.postMessage({type:"jijinboard-log-active",active},location.origin)}}catch{}}
function setToolFrameLoading(frame){if(!frame)return;frame.dataset.ready="";frame.style.visibility="hidden";const stamp=String(Date.now())+Math.random();frame.dataset.loadStamp=stamp;setTimeout(()=>{if(frame.id!=="logFrame"&&frame.dataset.loadStamp===stamp&&frame.dataset.ready!=="1")frame.style.visibility=""},8000)}
function setToolFrameReady(frame){if(!frame)return;frame.dataset.ready="1";frame.style.visibility=""}
async function summary(roomId){if(!state.summaries[roomId])state.summaries[roomId]=await api(`/api/rooms/${encodeURIComponent(roomId)}?summary=1`);return state.summaries[roomId]}
function navigationKey(){return `board:${encodeURIComponent(boardId)}:navigation`}
function saveNavigation(){
 try{if(!state.board?.id)return;const data={id:state.board.id,name:state.board.name,logs:state.board.logs||[]},saved={generation:localStorage.getItem('jijin.dataset.generation.v1'),data};const value=JSON.stringify(saved);if(localStorage.getItem(navigationKey())!==value)localStorage.setItem(navigationKey(),value)}catch{}
}
function restoreNavigation(){
 try{const saved=JSON.parse(localStorage.getItem(navigationKey())||'null');if(saved?.generation!==localStorage.getItem('jijin.dataset.generation.v1')||saved?.data?.id!==boardId||!Array.isArray(saved.data.logs))return false;state.board=saved.data;showBoardTitle(saved.data.name);renderLogs();return true}catch{return false}
}
function renderLogs(){
 const logs=state.board?.logs||[],owner=!!adminToken(),list=$("#logList");if(!list)return;
 $("#emptyLogs").hidden=logs.length>0;
 const existing=new Map([...list.children].map(row=>[row.dataset.logId,row]));
 const keep=new Set(logs.map(item=>String(item.roomId)));
 for(const row of [...list.children])if(!keep.has(row.dataset.logId))row.remove();
 logs.forEach((item,index)=>{
   const id=String(item.roomId),known=state.opened[id],active=id===state.activeRoom,title=item.scenarioTitle||item.title||known||"ログ";
   let row=existing.get(id);
   if(!row){row=document.createElement('div');row.className='log-entry';row.dataset.logId=id;const button=document.createElement('button');button.className='log-item';button.dataset.room=id;button.append(document.createElement('strong'));button.onclick=()=>requestOpen(id);row.append(button)}
   const button=row.querySelector('[data-room]');button.classList.toggle('unopened',!!item.spoiler&&!known);button.classList.toggle('active',active);
   const label=button.querySelector('strong');if(label.textContent!==title)label.textContent=title;
   let edit=row.querySelector('[data-edit-log]');
   if(owner&&!edit){edit=document.createElement('button');edit.className='log-edit';edit.dataset.editLog=id;edit.title='ログの編集';edit.textContent='✎';edit.onclick=event=>{event.stopPropagation();openLogEdit(id)};row.append(edit)}else if(!owner)edit?.remove();
   if(list.children[index]!==row)list.insertBefore(row,list.children[index]||null);
 });
 saveNavigation();
}
function closeSpoiler(){const dialog=$("#spoilerDialog");if(dialog.open)dialog.close();state.pendingRoom=""}
function requestOpen(roomId){const item=state.board.logs.find(item=>item.roomId===roomId);if(!item)return;if(!item.spoiler||state.opened[roomId])return openLog(roomId);const index=state.board.logs.indexOf(item);state.pendingRoom=roomId;$("#spoilerLabel").textContent=`LOG ${String(index+1).padStart(2,"0")}`;$("#spoilerTitle").textContent=item.scenarioTitle||item.title||"LOG";const people=$("#spoilerParticipants");people.textContent=item.scenarioParticipants?`参加PC：${item.scenarioParticipants}`:"";people.classList.toggle("hidden",!item.scenarioParticipants);const dialog=$("#spoilerDialog");if(!dialog.open)dialog.show()}
async function openLog(roomId,title=""){if($("#spoilerDialog").open)closeSpoiler();const item=state.board.logs.find(item=>item.roomId===roomId);if(title)state.opened[roomId]=title;else if(!state.opened[roomId])state.opened[roomId]=item?.title||(await summary(roomId)).title;saveOpened();state.activeRoom=roomId;state.profile=null;hydrateProfile(roomId);renderLogs();const url=new URL(location.href);url.searchParams.set("id",boardId);url.searchParams.set("room",roomId);history.replaceState(null,"",url.pathname+url.search);$("#welcome").classList.add("hidden");const frame=$("#logFrame"),src=`/log/?room=${encodeURIComponent(roomId)}&embedded=1&board=${encodeURIComponent(boardId)}`;if(frame.dataset.room!==roomId){setToolFrameLoading(frame);frame.dataset.room=roomId;frame.src=src}selectTool("log")}
function selectTool(tool){
  state.tool=tool;if(tool!=="log")closeSpoiler();
  document.querySelectorAll("[data-tool]").forEach(button=>button.classList.toggle("active",button.dataset.tool===tool));
  const frames={log:$("#logFrame"),matrix:$("#matrixFrame"),spreadsheet:$("#spreadsheetFrame")},hasLog=!!frames.log.getAttribute("src");
  Object.entries(frames).forEach(([name,frame])=>frame.classList.toggle("hidden",name!==tool||(name==="log"&&!hasLog)));
  $("#welcome").classList.toggle("hidden",tool!=="log"||hasLog);
  $("#logSidebar").classList.toggle("tool-hidden",tool==="matrix");
  $(".board-layout").classList.toggle("matrix-open",tool==="matrix");
  if(tool==="matrix"&&!frames.matrix.getAttribute("src")){
    setToolFrameLoading(frames.matrix);
    frames.matrix.src=`/matrix/?embedded=1&board=${encodeURIComponent(boardId)}&room=${encodeURIComponent(state.activeRoom||boardId)}`;
  }
  if(tool==="spreadsheet"&&!frames.spreadsheet.getAttribute("src")){
    setToolFrameLoading(frames.spreadsheet);
    frames.spreadsheet.src=`/spreadsheet/?embedded=1&board=${encodeURIComponent(boardId)}`;
  }
  setLogActive(frames.log,tool==="log");
  if(tool==="matrix"&&frames.matrix.getAttribute("src")&&frames.matrix.dataset.ready==="1")frames.matrix.contentWindow?.postMessage({type:"jijinboard-active-room",roomId:state.activeRoom},location.origin);
  frames.matrix.contentWindow?.postMessage({type:"jijinboard-matrix-active",active:tool==="matrix"},location.origin);
  frames.spreadsheet.contentWindow?.postMessage({type:"jijinboard-spreadsheet-active",active:tool==="spreadsheet"},location.origin);
}
async function attachRoom(message){const token=adminToken();if(!token)return;await api(`/api/boards/${encodeURIComponent(boardId)}/logs`,{method:"POST",headers:{"x-board-admin-token":token},body:JSON.stringify({roomId:message.roomId,roomAdminToken:message.adminToken,spoiler:!!message.spoiler,scenarioTitle:message.scenarioTitle||"",scenarioParticipants:message.scenarioParticipants||""})});state.opened[message.roomId]=message.title||"LOG";saveOpened();state.board=await api(`/api/boards/${encodeURIComponent(boardId)}`);openLog(message.roomId,state.opened[message.roomId])}
function openLogEdit(roomId){closeSpoiler();const item=state.board.logs.find(log=>log.roomId===roomId);if(!item)return;state.editingRoom=roomId;$("#logSpoilerInput").checked=!!item.spoiler;$("#logScenarioTitle").value=item.scenarioTitle||"";$("#logScenarioParticipants").value=item.scenarioParticipants||"";$("#logEditDialog").showModal()}
async function saveLogEdit(event){event.preventDefault();const roomId=state.editingRoom;if(!roomId)return;const spoiler=$("#logSpoilerInput").checked;try{await api(`/api/boards/${encodeURIComponent(boardId)}/logs/${encodeURIComponent(roomId)}`,{method:"PATCH",headers:{"x-board-admin-token":adminToken()},body:JSON.stringify({spoiler,scenarioTitle:$("#logScenarioTitle").value,scenarioParticipants:$("#logScenarioParticipants").value})});state.board=await api(`/api/boards/${encodeURIComponent(boardId)}`);if(spoiler){delete state.opened[roomId];saveOpened()}renderLogs();$("#logEditDialog").close();if(spoiler&&state.activeRoom===roomId)requestOpen(roomId)}catch(error){alert(error.message)}}
async function removeLog(){const roomId=state.editingRoom;if(!roomId||!confirm("このログを完全に削除しますか？\nログ本文・感想・MATRIXの配置とコメントも元に戻せません。"))return;try{await api(`/api/boards/${encodeURIComponent(boardId)}/logs/${encodeURIComponent(roomId)}`,{method:"DELETE",headers:{"x-board-admin-token":adminToken()}});["admin:","personas:","mainTab:","hiddenTabs:","theme:"].forEach(prefix=>localStorage.removeItem(prefix+roomId));delete state.opened[roomId];saveOpened();state.board=await api(`/api/boards/${encodeURIComponent(boardId)}`);if(state.activeRoom===roomId){state.activeRoom="";state.profile=null;const frame=$("#logFrame");logBridge()?.destroy?.();setLogActive(frame,false);frame.removeAttribute("src");delete frame.dataset.room;frame.dataset.ready="";frame.style.visibility="";$("#welcome").classList.remove("hidden")}$("#logEditDialog").close();renderLogs()}catch(error){alert(error.message)}}
function showBoardConnectionIssue(error){
 let notice=document.getElementById('boardConnectionIssue');if(!notice){notice=document.createElement('div');notice.id='boardConnectionIssue';notice.setAttribute('role','status');notice.style.cssText='position:fixed;bottom:12px;left:12px;z-index:250;max-width:380px;padding:10px 14px;border:1px solid #eadfec;border-radius:14px;background:#fff;color:#88728e;font:12px/1.5 system-ui;box-shadow:0 4px 16px #55446612';document.body.append(notice)}
 notice.replaceChildren();const text=document.createElement('span');text.textContent='部屋情報を取得できませんでした。表示と下書きはそのままです。 ';const retry=document.createElement('button');retry.type='button';retry.className='quiet';retry.textContent='再接続';retry.onclick=async()=>{retry.disabled=true;try{const data=await loadBoard();state.board=data;showBoardTitle(data.name);renderLogs();notice.remove()}catch(error){console.warn(error);retry.disabled=false}};notice.append(text,retry);console.warn(error);
}
async function init(){if(!boardId){document.body.innerHTML='<p style="padding:30px">部屋URLが正しくありません。</p>';return}try{state.opened=loadOpened();restoreNavigation();const pendingBoard=loadBoard();pendingBoard.catch(()=>{});await loadBoardTitle().catch(error=>{if(!window.JijinDesktop)throw error;console.warn(error)});await window.JijinBoardReady?.image;state.opened=loadOpened();state.board=await pendingBoard.catch(error=>{if(window.JijinDesktop&&state.board?.id===boardId&&Array.isArray(state.board.logs)){showBoardConnectionIssue(error);return state.board}throw error});showBoardTitle(state.board.name);const owner=!!adminToken();$("#ownerTopLink").classList.toggle("hidden",!owner);$("#guestBrand").classList.toggle("hidden",owner);$("#addLogButton").classList.toggle("hidden",!owner);renderLogs();const url=new URL(location.href);if(url.searchParams.has("room")){url.searchParams.delete("room");history.replaceState(null,"",url.pathname+url.search)}}catch(error){if(window.JijinDesktop){showBoardConnectionIssue(error);return}document.body.innerHTML=`<div role="alert" style="margin:40px auto;padding:24px;max-width:400px;border:1px solid #eadfec;border-radius:16px;background:#fff;color:#88728e"><p>${esc(error.message)}</p><button type="button" id="boardStartupReload" class="quiet">再読み込み</button></div>`;document.getElementById("boardStartupReload").onclick=()=>location.reload()}}

document.querySelectorAll("[data-tool]").forEach(button=>button.onclick=()=>selectTool(button.dataset.tool));
$("#confirmOpen").onclick=async()=>{const room=state.pendingRoom,title=$("#spoilerTitle").textContent;closeSpoiler();if(room)await openLog(room,title)};
function showUploader(){closeSpoiler();$("#welcome").classList.add("hidden");const frame=$("#logFrame");setLogActive(frame,false);delete frame.dataset.room;setToolFrameLoading(frame);frame.src=`/log/?embedded=1&board=${encodeURIComponent(boardId)}`;selectTool("log")}
$("#addLogButton").onclick=showUploader;
$("#closeLogEdit").onclick=()=>$("#logEditDialog").close();$("#logEditForm").onsubmit=saveLogEdit;$("#deleteLogButton").onclick=removeLog;
$("#logFrame").addEventListener("load",()=>{const frame=$("#logFrame");hydrateProfile(frame.dataset.room||state.activeRoom);requestProfile();setLogActive(frame,state.tool==="log")});
$("#matrixFrame").addEventListener("load",()=>{const frame=$("#matrixFrame");frame.contentWindow?.postMessage({type:"jijinboard-matrix-active",active:state.tool==="matrix"},location.origin)});
$("#spreadsheetFrame").addEventListener("load",()=>$("#spreadsheetFrame").contentWindow?.postMessage({type:"jijinboard-spreadsheet-active",active:state.tool==="spreadsheet"},location.origin));
addEventListener("storage",event=>{if(event.key===`personas:${state.activeRoom}`||event.key==="trpgMarkerProfile")hydrateProfile()});
addEventListener("message",event=>{if(event.origin!==location.origin)return;const message=event.data||{};if(message.type==="jijinboard-room-created")attachRoom(message).catch(error=>alert(error.message));if(message.type==="jijinboard-profile")acceptProfile(message);if(message.type==="jijinboard-presence"&&!window.__boardPresenceOwner)$("#presenceBar").innerHTML=(message.people||[]).map(person=>`<span class="presence-person">${person.pl_icon?`<img src="${esc(person.pl_icon)}" alt="">`:`<i>${esc((person.pl_name||"?").slice(0,1))}</i>`}<b style="color:${/^#[0-9a-f]{6}$/i.test(person.text_color||'')?person.text_color:'inherit'}">${esc(person.pl_name)}</b>${person.is_typing?'<em>入力中…</em>':""}</span>`).join("");if(message.type==="jijinboard-log-ready"&&event.source===$("#logFrame").contentWindow&&String(message.roomId||"")===String($("#logFrame").dataset.room||""))setToolFrameReady($("#logFrame"));if(message.type==="jijinboard-matrix-ready"&&event.source===$("#matrixFrame").contentWindow)setToolFrameReady($("#matrixFrame"));if(message.type==="jijinboard-spreadsheet-ready"&&event.source===$("#spreadsheetFrame").contentWindow)setToolFrameReady($("#spreadsheetFrame"))});

init();
addEventListener("message",event=>{if(event.origin!==location.origin||event.data?.type!=="jijinboard-participants-saved"||event.data.boardId!==boardId)return;$("#matrixFrame").contentWindow?.postMessage({type:"jijinboard-participants-saved"},location.origin)});

document.addEventListener("pointerdown",()=>{document.querySelector("#matrixFrame")?.contentWindow?.postMessage({type:"jijinboard-save-matrix-comment"},location.origin)},true);

// Presence belongs to the board page, independent of which tool/log is open.
(()=>{
  if(!boardId)return;
  window.__boardPresenceOwner=true;
  let socket=null,reconnectTimer=0,stopped=false,attempt=0,connecting=false;
  const clientId=crypto.randomUUID();
  const currentProfile=()=>{try{return JSON.parse(localStorage.getItem('trpgMarkerProfile')||'null')}catch{return null}};
  function publish(type='presence'){
    if(socket?.readyState!==WebSocket.OPEN)return;
    const p=currentProfile();
    const name=String(p?.plName||'').trim();
    if(!p?.id||!name)return;
    socket.send(JSON.stringify({type,clientId,authorId:p.id,plName:name,plTextColor:p.plTextColor||'',plIcon:p.plIcon||'',isTyping:false}));
  }
  const rosterKey=`board:${encodeURIComponent(boardId)}:presence`;
  let rosterOrder=[];
  if(window.JijinDesktop)try{rosterOrder=JSON.parse(localStorage.getItem(rosterKey+':order')||'[]')}catch{}
  function draw(people,cached=false){
    const bar=document.querySelector('#presenceBar');if(!bar)return;
    const valid=(people||[]).filter(person=>String(person.pl_name||'').trim()&&!String(person.author_id||'').startsWith('visitor:'));
    const byId=new Map(valid.map(person=>[String(person.author_id||person.pl_name),person]));
    const ids=[...rosterOrder.filter(id=>byId.has(id)),...[...byId.keys()].filter(id=>!rosterOrder.includes(id))];if(window.JijinDesktop){rosterOrder=[...new Set([...rosterOrder,...ids])];try{localStorage.setItem(rosterKey+':order',JSON.stringify(rosterOrder))}catch{}}else rosterOrder=ids;
    const existing=new Map([...bar.children].map(node=>[node.dataset.authorId,node]));
    for(const node of [...bar.children])if(!byId.has(node.dataset.authorId))node.remove();
    ids.forEach((id,index)=>{
      const person=byId.get(id);let node=existing.get(id);
      if(!node){node=document.createElement('span');node.className='presence-person';node.dataset.authorId=id;bar.append(node)}
      node.toggleAttribute('data-presence-cached',cached);node.title=cached?'入室状況を確認中':person.pl_name;
      const visual=JSON.stringify([person.pl_name,person.pl_icon||'',person.text_color||'',!!person.is_typing]);
      if(node.dataset.visual!==visual){node.dataset.visual=visual;node.innerHTML=`${person.pl_icon?`<img src="${esc(person.pl_icon)}" alt="">`:`<i>${esc((person.pl_name||'?').slice(0,1))}</i>`}<b style="color:${/^#[0-9a-f]{6}$/i.test(person.text_color||'')?person.text_color:'inherit'}">${esc(person.pl_name)}</b>${person.is_typing?'<em>入力中…</em>':''}`}
      if(bar.children[index]!==node)bar.insertBefore(node,bar.children[index]||null);
    });
    if(!cached)try{localStorage.setItem(rosterKey,JSON.stringify({generation:localStorage.getItem('jijin.dataset.generation.v1'),people:ids.map(id=>{const p=byId.get(id);return {author_id:p.author_id,pl_name:p.pl_name,pl_icon:p.pl_icon||'',text_color:p.text_color||''}})}))}catch{}
  }
  try{const saved=JSON.parse(localStorage.getItem(rosterKey)||'null');if(saved?.generation===localStorage.getItem('jijin.dataset.generation.v1'))draw(saved.people,true)}catch{}
  async function connect(){
    if(stopped||connecting||socket&&socket.readyState<2)return;
    connecting=true;let address=`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/api/boards/${encodeURIComponent(boardId)}/realtime`;
    connecting=false;if(stopped)return;
    const ws=new WebSocket(address);
    socket=ws;
    ws.addEventListener('open',()=>{if(socket===ws){attempt=0;publish('join');window.dispatchEvent(new Event('jijinboard-reconnected'))}});
    ws.addEventListener('message',event=>{if(socket!==ws)return;let data;try{data=JSON.parse(event.data)}catch{return}if(data.type==='presence'){const own=currentProfile();if(!own?.id||!String(own.plName||'').trim()||(data.presence||[]).some(person=>String(person.author_id)===String(own.id)))draw(data.presence)}else if(data.type==='refresh')window.dispatchEvent(new CustomEvent('jijinboard-resource-change',{detail:{action:data.action,data:data.data}}))});
    ws.addEventListener('close',()=>{if(socket!==ws)return;socket=null;if(!stopped){clearTimeout(reconnectTimer);reconnectTimer=setTimeout(connect,Math.min(30000,1000*2**attempt++))}});
    ws.addEventListener('error',()=>ws.close());
  }
  (window.JijinBoardReady?.image||Promise.resolve()).then(connect);
  document.querySelector("#boardProfileDialog")?.addEventListener("close",()=>publish());
  window.addEventListener('storage',event=>{if(event.key==='trpgMarkerProfile'||event.key===`board:${encodeURIComponent(boardId)}:players:trpgMarkerProfile`)publish()});
  window.addEventListener('jijinboard-player-master-updated',()=>publish());
  window.addEventListener('jijinboard-player-master-saved',()=>publish());
  window.addEventListener('message',event=>{if(event.origin===location.origin&&event.data?.type==='jijinboard-profile')publish()});
  window.addEventListener('online',connect);
  window.addEventListener('pageshow',()=>{if(stopped){stopped=false;connect()}});
  window.addEventListener('pagehide',()=>{stopped=true;clearTimeout(reconnectTimer);socket?.close()});
})();

window.JIJINBOARD_LOG_TITLE=roomId=>{
  const item=state.board?.logs?.find(log=>log.roomId===roomId);
  return item?.scenarioTitle||item?.title||state.opened[roomId]||"";
};

// Room metadata updates have one coalesced catch-up path, without interval reads.
(()=>{
 const refresh=window.JijinSync?.loader(()=>api(`/api/boards/${encodeURIComponent(boardId)}`,{cache:'no-store'}),data=>{state.board=data;showBoardTitle(data.name);renderLogs()});
 if(!refresh)return;
 window.addEventListener('jijinboard-resource-change',event=>{if(event.detail?.action==='board-meta')refresh().catch(console.warn)});
 window.addEventListener('jijinboard-reconnected',()=>refresh().catch(console.warn));
})();
