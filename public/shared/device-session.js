'use strict';
(()=>{
 if(window.JijinDeviceSession)return;
 const network=window.fetch.bind(window),params=new URL(location.href).searchParams,board=params.get('board')||params.get('id');if(!board)return;
 let owner=null;try{if(parent!==window)owner=parent.JijinDeviceSession}catch{}
 if(owner){window.JijinDeviceSession=owner;window.fetch=async(input,options={})=>{const url=new URL(input instanceof Request?input.url:String(input),location.href),method=String(options.method||(input instanceof Request?input.method:'GET')).toUpperCase();if(url.origin===location.origin&&url.pathname.startsWith('/api/')&&!['GET','HEAD','OPTIONS'].includes(method))await owner.check();return network(input,options)};return}
 let device=localStorage.getItem('jijinboardDeviceId.v1');if(!device){device=crypto.randomUUID();localStorage.setItem('jijinboardDeviceId.v1',device)}
 const tab=crypto.randomUUID();let current=null,task=Promise.resolve(),timer=0,blocked=false,stopped=false,leaseUntil=0;
 function notice(message,title='もう片方の端末が開いています'){
  const show=()=>{let box=document.getElementById('jijinDeviceNotice');if(!box){box=document.createElement('div');box.id='jijinDeviceNotice';box.style.cssText='position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:24px;background:rgba(247,245,250,.94);font:14px/1.8 system-ui;color:#565064';box.innerHTML='<section style="max-width:370px;padding:30px;border:1px solid #eadfeb;border-radius:22px;background:white;box-shadow:0 12px 40px #7d557d15;text-align:center"><div style="font-size:28px">☁</div><strong style="display:block;font-size:17px;margin:8px 0">もう片方の端末が開いています</strong><p></p><button type="button" style="border:1px solid #e6d4e5;border-radius:12px;padding:9px 18px;background:#fbf3fb;color:#875f88;font:inherit;cursor:pointer">再読み込み</button></section>';box.querySelector('button').onclick=()=>location.reload();document.body.append(box)}box.querySelector('strong').textContent=title;box.querySelector('p').textContent=message};
  if(document.body)show();else document.addEventListener('DOMContentLoaded',show,{once:true});
 }
 async function renew(){
  if(!current||stopped)return;
  const recovering=blocked;
  let response;try{response=await network(current.url,{method:'POST',cache:'no-store',signal:AbortSignal.timeout(10000),headers:{'content-type':'application/json','x-player-token':current.token},body:JSON.stringify({deviceId:device,tabId:tab})})}catch(error){blocked=true;notice('通信が戻ったら、再読み込みしてください。','利用端末を確認できませんでした');clearTimeout(timer);timer=setTimeout(()=>{task=renew();task.catch(()=>{})},5000);throw error}
  const result=await response.json();if(!response.ok){blocked=true;notice(result.code==='DEVICE_IN_USE'?'もう片方の端末を閉じてから、再読み込みしてください。':result.error||'端末の利用状況を確認できませんでした。',response.status===409?'もう片方の端末が開いています':'端末情報を確認できませんでした');throw Object.assign(Error(result.error),{code:result.code})}
  leaseUntil=Date.now()+40000;blocked=false;document.getElementById('jijinDeviceNotice')?.remove();clearTimeout(timer);timer=setTimeout(()=>{task=renew();task.catch(()=>{})},15000);if(recovering)location.reload();
 }
 function start(boardId,playerId,token){
  const url=`/api/boards/${encodeURIComponent(boardId)}/players/${encodeURIComponent(playerId)}/session`;
  if(current?.url===url&&current.token===token)return task;
  if(current&&current.url!==url&&!blocked)network(current.url,{method:'POST',keepalive:true,headers:{'content-type':'application/json','x-player-token':current.token},body:JSON.stringify({deviceId:device,tabId:tab,action:'release'})}).catch(()=>{});
  clearTimeout(timer);current={url,token};task=renew();task.catch(()=>{});return task;
 }
 const check=async()=>{if(current&&Date.now()>=leaseUntil&&!blocked){task=renew();task.catch(()=>{})}await task;if(blocked)throw Error('もう片方の端末を閉じてください。')};
 window.JijinDeviceSession={start,check};
 window.fetch=async(input,options={})=>{const url=new URL(input instanceof Request?input.url:String(input),location.href),method=String(options.method||(input instanceof Request?input.method:'GET')).toUpperCase();if(current&&url.origin===location.origin&&url.pathname.startsWith('/api/')&&!['GET','HEAD','OPTIONS'].includes(method)&&!url.pathname.endsWith('/session'))await check();return network(input,options)};
 const savedId=localStorage.getItem('jijinboardPlayerMasterId.v1'),savedToken=localStorage.getItem('jijinboardPlayerMasterToken.v1');
 if(savedId&&savedToken)start(board,savedId,savedToken);
 addEventListener('pagehide',()=>{stopped=true;clearTimeout(timer);if(current&&!blocked)network(current.url,{method:'POST',keepalive:true,headers:{'content-type':'application/json','x-player-token':current.token},body:JSON.stringify({deviceId:device,tabId:tab,action:'release'})}).catch(()=>{})});
 document.addEventListener('visibilitychange',()=>{if(current&&!document.hidden&&!stopped){task=renew();task.catch(()=>{})}});
 addEventListener('pageshow',()=>{if(stopped){stopped=false;task=renew();task.catch(()=>{})}});
})();
