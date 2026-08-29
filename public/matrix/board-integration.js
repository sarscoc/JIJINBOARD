"use strict";
(()=>{
  const params=new URL(location.href).searchParams,boardId=params.get("board");if(!boardId)return;
  let roomId=params.get("room")||"",lastState="",saving=false,active=true;
  const api=async(path,options={})=>{const response=await fetch(path,{headers:{"content-type":"application/json",...(options.headers||{})},...options}),body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||`通信エラー (${response.status})`);return body};
  const profile=()=>{try{return JSON.parse(localStorage.getItem("trpgMarkerProfile")||"null")}catch{return null}};
  window.matrixBoardContext={boardId,get roomId(){return roomId},api,profile,isActive:()=>active};
  async function loadRoom(nextRoom){roomId=nextRoom||"";window.dispatchEvent(new CustomEvent("matrix-board-room",{detail:{roomId}}));if(!roomId)return;const matrix=await api(`/api/boards/${encodeURIComponent(boardId)}/matrix/${encodeURIComponent(roomId)}`);if(matrix.state&&Object.keys(matrix.state).length){saveState(matrix.state);restoreDisplay();restorePaneWidth();renderLibrary();renderPlaced()}lastState=JSON.stringify(matrix.state||{})}
  async function save(){if(saving||!roomId)return;const me=profile();if(!me?.plName)return;const state=appState(),serial=JSON.stringify(state);if(serial===lastState)return;saving=true;try{await api(`/api/boards/${encodeURIComponent(boardId)}/matrix/${encodeURIComponent(roomId)}`,{method:"POST",body:JSON.stringify({authorId:me.id,authorName:me.plName,state})});lastState=serial}catch{}finally{saving=false}}
  window.addEventListener("message",event=>{if(event.origin!==location.origin)return;if(event.data?.type==="jijinboard-active-room")loadRoom(event.data.roomId).catch(console.warn);if(event.data?.type==="jijinboard-matrix-active"){active=!!event.data.active;if(active)window.dispatchEvent(new CustomEvent("matrix-board-active"))}});setTimeout(()=>loadRoom(roomId).catch(console.warn),300);setInterval(()=>{if(active)save()},5000);window.addEventListener("pagehide",save);

  // Load interaction overrides only after the original MATRIX scripts are ready.
  window.addEventListener("load",()=>{
    if(document.querySelector('script[data-matrix-icon-interactions]'))return;
    const script=document.createElement("script");
    script.src="matrix-icon-interactions.js";
    script.dataset.matrixIconInteractions="1";
    document.body.append(script);
  },{once:true});
})();
