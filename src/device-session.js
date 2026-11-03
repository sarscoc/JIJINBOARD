// One active device per room/PL. Tabs on that device hold separate expiring leases.
export async function deviceSession(storage,{playerId,deviceId,tabId,action='claim'},now=Date.now()){
 if(!playerId||!deviceId||!tabId)return {status:400,body:{error:'端末情報がありません'}};
 const key='device-session:'+playerId;
 return storage.transaction(async tx=>{
  const old=await tx.get(key),tabs=Object.fromEntries(Object.entries(old?.tabs||{}).filter(([,until])=>until>now));
  if(action==='release'){
   if(old?.deviceId===deviceId){delete tabs[tabId];if(Object.keys(tabs).length)await tx.put(key,{deviceId,tabs});else await tx.delete(key)}
   return {status:200,body:{ok:true}};
  }
  if(Object.keys(tabs).length&&old.deviceId!==deviceId)return {status:409,body:{code:'DEVICE_IN_USE',error:'もう片方の端末を閉じてから、再読み込みしてください。',retryAfter:Math.ceil((Math.max(...Object.values(tabs))-now)/1000)}};
  tabs[tabId]=now+45000;await tx.put(key,{deviceId,tabs});return {status:200,body:{ok:true,expiresIn:45}};
 });
}
