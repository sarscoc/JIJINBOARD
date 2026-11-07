// One after-commit notification policy for non-comment resources.
export function resourceAction(path){
 if(/\/spreadsheet\/state$/.test(path))return 'spreadsheet-state';
 if(/\/spreadsheet\/image$/.test(path))return 'spreadsheet-image';
 if(/\/matrix\/[^/]+\/templates(?:\/[^/]+)?$/.test(path))return 'matrix-template-state';
 if(/\/matrix\/[^/]+\/points\/[^/]+$/.test(path))return 'matrix-point';
 if(/\/matrix\/[^/]+$/.test(path))return 'matrix-state';
 if(/\/theme$/.test(path))return 'board-theme';
 if(/\/group-row-colors$/.test(path))return 'group-row-colors';
 if(/\/display-mode$/.test(path))return 'log-display-mode';
 if(/\/log-tab-settings\/[^/]+$/.test(path))return 'log-tab-settings';
 if(/\/home-image$/.test(path))return 'board-home';
 if(/^\/api\/boards\/[^/]+(?:\/logs(?:\/[^/]+)?)?$/.test(path))return 'board-meta';
 return '';
}
export async function notifyResource(request,response,env,context,bodyRequest){
 if(!response?.ok||['GET','HEAD','OPTIONS'].includes(request.method)||!env.ROOMS)return response;
 const path=new URL(request.url).pathname.replace(/\/+$/,''),isLogCreation=path==='/api/rooms'&&request.method==='POST';
 const action=isLogCreation?'board-meta':resourceAction(path);
 if(!action)return response;
 const task=(async()=>{
  const board=isLogCreation?(await response.clone().json()).roomId:decodeURIComponent(path.match(/^\/api\/boards\/([^/]+)/)?.[1]||'');
  if(!board)return;
  let data=null;
  if(action==='matrix-point')data=(await response.clone().json()).point||null;
  if(action==='spreadsheet-state'){
   const saved=await response.clone().json(),input=await bodyRequest.json();const payload={state:input.state,baseRevision:input.baseRevision,revision:saved.revision};
   if(JSON.stringify(payload).length<=5500)data=payload;
  }
  await env.ROOMS.get(env.ROOMS.idFromName(board)).fetch('https://room/notify',{method:'POST',body:JSON.stringify({action,data,excludeClientId:request.headers.get('x-realtime-client')||''})});
 })().catch(error=>console.warn('Resource notification failed',error));
 if(context?.waitUntil)context.waitUntil(task);else await task;
 return response;
}
