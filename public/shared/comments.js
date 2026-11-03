"use strict";
(() => {
  if (globalThis.JijinComments) return;
  const target = globalThis.JijinCommentTarget;
  const clientId = crypto.randomUUID();
  async function request(board, suffix = '', options = {}) {
    const response = await fetch(`/api/boards/${encodeURIComponent(board)}/comments${suffix}`, {
      ...options, cache:'no-store', headers:{'content-type':'application/json', 'x-realtime-client':clientId, ...(options.headers || {})}
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(Error(data.error || 'コメントの通信に失敗しました'), {status:response.status});
    return data;
  }
  // Thin compatibility at the view boundary. Renderers can keep their current
  // selection fields while every request uses the common API and address codec.
  function adapter(board, fallback) {
    return async (path, options = {}) => {
      const boardId=typeof board==='function'?board():board;
      if(!boardId)return fallback(path,options);
      const url=new URL(path,location.href),p=url.pathname;
      const log=p.match(/^\/api\/rooms\/([^/]+)\/annotations(?:\/([^/]+))?(?:\/([^/]+))?$/),
        sheet=p.match(/^\/api\/boards\/([^/]+)\/spreadsheet\/comments(?:\/([^/]+))?(?:\/([^/]+))?$/),
        matrix=p.match(/^\/api\/boards\/([^/]+)\/matrix\/([^/]+)\/comments(?:\/([^/]+))?(?:\/([^/]+))?$/);
      if((!log&&!sheet&&!matrix)||log?.[2]==='color')return fallback(path,options);
      let id,action,scope;
      if(log){id=log[2];action=log[3];scope=target.log(boardId,decodeURIComponent(log[1]));}
      else{const m=sheet||matrix;if(decodeURIComponent(m[1])!==String(boardId))throw Error('別の自陣のコメントです');id=m[sheet?2:3];action=m[sheet?3:4];scope=sheet?target.cell(boardId):target.matrix(boardId);}
      const query=new URLSearchParams(url.search);query.set('scope',scope);
      const next={...options};
      if((options.method||'GET')==='POST'&&!id){
        const b=JSON.parse(options.body||'{}');
        if(b.target){target.parse(b.target,boardId);}
        else if(log)b.target=target.log(boardId,decodeURIComponent(log[1]),b);
        else if(sheet)b.target=target.cell(boardId,b.cellId);
        else{const raw=String(b.targetId||''),at=raw.indexOf('@@matrix-template@@');b.target=at<0?`${target.root(boardId)}/matrix-legacy/matrix_point/${encodeURIComponent(raw)}`:target.matrix(boardId,raw.slice(0,at),raw.slice(at+'@@matrix-template@@'.length));}
        next.body=JSON.stringify(b);
      }
      return request(boardId,`${id?`/${id}${action?`/${action}`:''}`:''}?${query}`,next);
    };
  }
  const {loader,serialize}=globalThis.JijinSync;
  // Shared reconnect and catch-up policy. Presence/layout channels can keep their
  // own messages; all comment views use this channel for durable changes.
  function live({board, refresh, onNote = () => {}, onTyping = () => {}, onChange = () => false, onError = console.warn}) {
    let active = false, socket = null, timer = null, attempts = 0, resume = false, connecting = false;
    const room = () => typeof board === 'function' ? board() : board;
    const update = () => Promise.resolve().then(refresh).catch(onError);
    function retry() { clearTimeout(timer); if (active) timer = setTimeout(connect, Math.min(15000, 500 * 2 ** attempts++)); }
    async function connect() {
      clearTimeout(timer);
      if (!active || connecting || !room() || socket?.readyState < 2) return;
      const boardId = String(room());
      let current;
      let address=`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/boards/${encodeURIComponent(boardId)}/realtime`;
      const session=window.JijinDeviceSessionOwner||parent===window?window.JijinDeviceSession:null;
      if(session){connecting=true;try{address=await session.connectionUrl(address)}catch{connecting=false;return}connecting=false;if(!active)return}
      try { current = new WebSocket(address);session?.attach(current); }
      catch { retry(); return; }
      socket = current;
      current.addEventListener('open', () => {
        if (socket !== current) return;
        attempts = 0; publishPresence('join'); update();
      });
      current.addEventListener('message', event => {
        if (socket !== current || boardId !== String(room())) return;
        let message; try { message = JSON.parse(event.data); } catch { return; }
        if (message.action === 'comment:typing') { onTyping(message.data); return; }
        if (message.action === 'comment:note') { onNote(message.data); return; }
        if(message.type==='comment-change'){try{if(onChange(message.action,message.data)===true)return}catch(error){onError(error)}}
        if (message.type === 'comment-change' || (message.type === 'refresh' && ['participants','spreadsheet-comments','matrix-comment','matrix-edit','matrix-delete','matrix-like','matrix-template-comments-delete'].includes(message.action))) update();
      });
      current.addEventListener('close', () => { if (socket === current) { socket = null;if(!session?.blocked)retry(); } });
      current.addEventListener('error', () => current.close());
    }
    function publishPresence(type='presence'){
      if(socket?.readyState!==WebSocket.OPEN)return;let identity={};
      if(window.JijinDeviceSessionOwner||parent===window)try{const profile=JSON.parse(localStorage.getItem('trpgMarkerProfile')||'null');if(profile?.id&&profile.plName)identity={authorId:profile.id,plName:profile.plName,plTextColor:profile.plTextColor||'',plIcon:profile.plIcon||''}}catch{}
      socket.send(JSON.stringify({type,clientId,...identity}));
    }
    window.addEventListener('jijinboard-player-master-updated',()=>publishPresence());
    window.addEventListener('jijinboard-player-master-saved',()=>publishPresence());
    function setActive(next) {
      active = !!next; clearTimeout(timer);
      if (!active) { const old = socket; socket = null; old?.close(); }
      else { connect(); update(); }
    }
    function typing(address, person, on) {
      if (socket?.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({type:'change', action:'comment:typing', data:{clientId, target:address, name:person?.name || 'PL', icon:String(person?.icon || '').slice(0,3000), typing:!!on}}));
    }
    window.addEventListener('jijinboard-device-session-changed',()=>{if(parent!==window&&!window.JijinDeviceSessionOwner)return;const old=socket;socket=null;old?.close();if(active)connect()});
    window.addEventListener('online', () => { if (active) { connect(); update(); } });
    document.addEventListener('visibilitychange', () => { if (active && !document.hidden) { connect(); update(); } });
    window.addEventListener('pagehide', () => { resume=active;setActive(false); });
    window.addEventListener('pageshow', () => { if(resume){resume=false;setActive(true);} });
    return {setActive, typing, refresh:update};
  }
  globalThis.JijinComments = Object.freeze({target, request, adapter, loader, serialize, live, clientId});
})();

// Desktop composer behavior shared by LOG, MATRIX and Sheets.
(()=>{
 if(typeof document==='undefined'||globalThis.JijinCommentComposer)return;
 const selector='#commentDialog,#matrixIconCommentDialog,#sheetCommentDialog';
 const desktop=()=>innerWidth>800;
 const hasText=d=>!!d?.querySelector('textarea')?.value.trim();
 const keep=(d,extra=false)=>desktop()&&!!d?.open&&(hasText(d)||extra);
 function outside(d,extra=false){
  if(!desktop())return false;
  if(d?.open&&!hasText(d)&&!extra&&d.dataset.submitting!=='1'&&d.querySelector('form')?.dataset.submitting!=='1')d.close();
  return true;
 }
 document.addEventListener('keydown',event=>{
  const field=event.target,dialog=field?.closest?.(selector);
  if(!desktop()||!dialog?.open||field.tagName!=='TEXTAREA'||event.key!=='Enter')return;
  // Japanese conversion confirmation is never a send action.
  if(event.isComposing||event.keyCode===229||event.shiftKey)return;
  event.preventDefault();event.stopImmediatePropagation();
  if(event.repeat||dialog.dataset.submitting==='1'||dialog.querySelector('form')?.dataset.submitting==='1')return;
  dialog.querySelector('form')?.requestSubmit();
 },true);
 const parentOutside=()=>{
  for(const d of document.querySelectorAll(selector)){
   const image=d.id==='commentDialog'&&typeof state!=='undefined'&&!!state.commentImage;
   outside(d,image);
  }
 };
 try{if(parent!==window){parent.document.addEventListener('pointerdown',parentOutside,true);window.addEventListener('pagehide',()=>parent.document.removeEventListener('pointerdown',parentOutside,true),{once:true})}}catch{}
 globalThis.JijinCommentComposer={desktop,keep,outside};
})();
