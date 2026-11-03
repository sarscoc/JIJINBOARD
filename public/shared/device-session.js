'use strict';
(()=>{
 if(window.JijinDeviceSession)return;
 const network=window.fetch.bind(window),params=new URL(location.href).searchParams,board=params.get('board')||params.get('id');if(!board)return;
 let owner=null;try{if(parent!==window)owner=parent.JijinDeviceSession}catch{}
 if(owner){window.JijinDeviceSessionOwner=false;window.JijinDeviceSession=owner;window.fetch=async(input,options={})=>{const url=new URL(input instanceof Request?input.url:String(input),location.href),method=String(options.method||(input instanceof Request?input.method:'GET')).toUpperCase();if(url.origin===location.origin&&url.pathname.startsWith('/api/')&&!['GET','HEAD','OPTIONS'].includes(method))await owner.check();return network(input,options)};return}
 window.JijinDeviceSessionOwner=true;
 let device=localStorage.getItem('jijinboardDeviceId.v1');if(!device){device=crypto.randomUUID();localStorage.setItem('jijinboardDeviceId.v1',device)}
 const tab=crypto.randomUUID();let current=null,task=Promise.resolve(),blocked=false,stopped=false,used=false,boundSocket=null;
 let gate=Promise.resolve(),resolveGate=null,rejectGate=null;
 function waiting(){if(resolveGate)return;gate=new Promise((resolve,reject)=>{resolveGate=resolve;rejectGate=reject});gate.catch(()=>{})}
 function deny(message,title){blocked=true;notice(message,title);rejectGate?.(Error(message));resolveGate=rejectGate=null}
 function notice(message,title='もう片方の端末が開いています'){
  const show=()=>{let box=document.getElementById('jijinDeviceNotice');if(!box){box=document.createElement('div');box.id='jijinDeviceNotice';box.style.cssText='position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:24px;background:rgba(247,245,250,.94);font:14px/1.8 system-ui;color:#565064';box.innerHTML='<section style="max-width:370px;padding:30px;border:1px solid #eadfeb;border-radius:22px;background:white;box-shadow:0 12px 40px #7d557d15;text-align:center"><div style="font-size:28px">☁</div><strong style="display:block;font-size:17px;margin:8px 0">もう片方の端末が開いています</strong><p></p><button type="button" style="border:1px solid #e6d4e5;border-radius:12px;padding:9px 18px;background:#fbf3fb;color:#875f88;font:inherit;cursor:pointer">再読み込み</button></section>';box.querySelector('button').onclick=()=>location.reload();document.body.append(box)}box.querySelector('strong').textContent=title;box.querySelector('p').textContent=message};
  if(document.body)show();else document.addEventListener('DOMContentLoaded',show,{once:true});
 }
 async function claim(){
  const session=current;
  let response;try{response=await network(session.url,{method:'POST',cache:'no-store',signal:AbortSignal.timeout(10000),headers:{'content-type':'application/json','x-player-token':session.token},body:JSON.stringify({deviceId:device,tabId:tab})})}
  catch(error){deny('通信が戻ったら、再読み込みしてください。','利用端末を確認できませんでした');throw error}
  const result=await response.json();
  if(!response.ok){const message=result.code==='DEVICE_IN_USE'?'もう片方の端末を閉じてから、再読み込みしてください。':result.error||'端末情報を確認できませんでした。';deny(message,response.status===409?'もう片方の端末が開いています':'端末情報を確認できませんでした');throw Object.assign(Error(message),{code:result.code})}
  if(!result.ticket){const message='端末の接続情報を確認できませんでした。再読み込みしてください。';deny(message,'端末情報を確認できませんでした');throw Error(message)}
  session.ticket=result.ticket;session.ticketExpiresAt=result.expiresAt||Date.now()+30000;return result;
 }
 function start(boardId,playerId,token){
  const url=`/api/boards/${encodeURIComponent(boardId)}/players/${encodeURIComponent(playerId)}/session`;
  if(current?.url===url&&current.token===token)return task;
  if(current&&current.url!==url)network(current.url,{method:'POST',keepalive:true,headers:{'content-type':'application/json','x-player-token':current.token},body:JSON.stringify({deviceId:device,tabId:tab,action:'release'})}).catch(()=>{});
  const old=boundSocket;boundSocket=null;old?.close();rejectGate?.(Error('利用するPLを切り替えています'));resolveGate=rejectGate=null;
  current={url,token};blocked=false;used=false;waiting();task=claim();task.catch(()=>{});
  window.dispatchEvent(new Event('jijinboard-device-session-changed'));return task;
 }
 async function connectionUrl(base){
  if(!current)return base;
  const session=current;await task;if(current!==session)return connectionUrl(base);
  if(blocked)throw Error('もう片方の端末を閉じてください。');
  if(used||Date.now()>=current.ticketExpiresAt-1000){waiting();task=claim();task.catch(()=>{});await task}
  used=true;const url=new URL(base);url.searchParams.set('sessionTicket',current.ticket);return url.href;
 }
 function attach(socket){
  boundSocket=socket;
  socket.addEventListener('message',event=>{
   if(boundSocket!==socket)return;let message;try{message=JSON.parse(event.data)}catch{return}
   if(message.type==='device-session-ready'){blocked=false;document.getElementById('jijinDeviceNotice')?.remove();resolveGate?.();resolveGate=rejectGate=null}
   if(message.type==='device-session-denied')deny('もう片方の端末を閉じてから、再読み込みしてください。','もう片方の端末が開いています');
  });
  socket.addEventListener('close',()=>{if(boundSocket!==socket)return;boundSocket=null;if(current&&!stopped&&!blocked)waiting()});
 }
 const check=async()=>{await task;if(blocked)throw Error('もう片方の端末を閉じてください。');if(current)await gate};
 window.JijinDeviceSession={start,check,connectionUrl,attach,get blocked(){return blocked}};
 window.fetch=async(input,options={})=>{const url=new URL(input instanceof Request?input.url:String(input),location.href),method=String(options.method||(input instanceof Request?input.method:'GET')).toUpperCase();if(current&&url.origin===location.origin&&url.pathname.startsWith('/api/')&&!['GET','HEAD','OPTIONS'].includes(method)&&!url.pathname.endsWith('/session'))await check();return network(input,options)};
 const savedId=localStorage.getItem('jijinboardPlayerMasterId.v1'),savedToken=localStorage.getItem('jijinboardPlayerMasterToken.v1');
 if(savedId&&savedToken)start(board,savedId,savedToken);
 addEventListener('pagehide',()=>{stopped=true;boundSocket?.close(1000,'page closed')});
 addEventListener('pageshow',()=>{if(stopped){stopped=false;if(current)waiting();window.dispatchEvent(new Event('jijinboard-device-session-changed'))}});
})();
