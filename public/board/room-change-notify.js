"use strict";

// Send a one-shot realtime event only after an actual room-scoped mutation.
// There is no idle connection here: the socket exists only long enough to carry
// the change signal, then closes immediately.
window.jijinboardNotifyRoomChange=function(roomId,action){
  const room=String(roomId||""),kind=String(action||"");
  if(!room||!kind)return;
  const protocol=location.protocol==="https:"?"wss:":"ws:";
  let socket;
  try{socket=new WebSocket(`${protocol}//${location.host}/api/rooms/${encodeURIComponent(room)}/realtime`)}catch{return}
  const close=()=>{try{if(socket.readyState<2)socket.close()}catch{}};
  socket.addEventListener("open",()=>{
    try{socket.send(JSON.stringify({type:"change",action:kind}))}catch{}
    setTimeout(close,0);
  },{once:true});
  socket.addEventListener("error",close,{once:true});
};

