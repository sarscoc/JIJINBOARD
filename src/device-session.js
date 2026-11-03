// Admission is checked when opening/reconnecting. Open sockets own the session;
// only the brief gap between HTTP admission and WebSocket upgrade expires.
const pendingKey=player=>'device-entry:'+player;
const ticketKey=ticket=>'device-ticket:'+ticket;
export function activeDeviceSessions(sockets=[]){return sockets.filter(socket=>socket.readyState!==2&&socket.readyState!==3).map(socket=>socket.deserializeAttachment?.()||{}).filter(p=>p.session_player_id)}
export async function deviceSession(storage,{playerId,deviceId,tabId,action='claim'},now=Date.now(),sessions=[]){
 if(!playerId||!deviceId||!tabId)return {status:400,body:{error:'端末情報がありません'}};
 return storage.transaction(async tx=>{
  const key=pendingKey(playerId),old=await tx.get(key),tabs={};
  for(const [id,entry]of Object.entries(old?.tabs||{})){if(entry.until>now)tabs[id]=entry;else if(entry.ticket)await tx.delete(ticketKey(entry.ticket))}
  if(action==='release'){
   if(old?.deviceId===deviceId){if(tabs[tabId]?.ticket)await tx.delete(ticketKey(tabs[tabId].ticket));delete tabs[tabId];if(Object.keys(tabs).length)await tx.put(key,{deviceId,tabs});else await tx.delete(key)}
   return {status:200,body:{ok:true}};
  }
  const conflict=sessions.some(p=>p.session_player_id===playerId&&p.session_device_id!==deviceId)||(Object.keys(tabs).length&&old.deviceId!==deviceId);
  if(conflict)return {status:409,body:{code:'DEVICE_IN_USE',error:'もう片方の端末を閉じてから、再読み込みしてください。'}};
  if(tabs[tabId]?.ticket)await tx.delete(ticketKey(tabs[tabId].ticket));
  const ticket=crypto.randomUUID(),entry={playerId,deviceId,tabId,until:now+30000};tabs[tabId]={ticket,until:entry.until};
  await tx.put(ticketKey(ticket),entry);await tx.put(key,{deviceId,tabs});return {status:200,body:{ok:true,ticket,expiresAt:entry.until}};
 });
}
export async function consumeDeviceTicket(storage,ticket,now=Date.now(),sessions=[]){
 return storage.transaction(async tx=>{
  const entry=await tx.get(ticketKey(ticket));if(!entry||entry.until<=now)return null;
  if(sessions.some(p=>p.session_player_id===entry.playerId&&p.session_device_id!==entry.deviceId))return null;
  await tx.delete(ticketKey(ticket));
  // Keep the short admission reservation until close/expiry to cover concurrent upgrades.
  return {session_player_id:entry.playerId,session_device_id:entry.deviceId,session_tab_id:entry.tabId};
 });
}
