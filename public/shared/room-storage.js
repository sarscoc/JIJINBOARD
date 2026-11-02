(()=>{
 'use strict';if(window.JijinRoomStorage)return;
 const p=new URL(location.href).searchParams,board=p.get('board')||(/\/(?:board)(?:\/|$)/.test(location.pathname)?p.get('id'):'');
 const prefix=board?`board:${encodeURIComponent(board)}:players:`:'';
 const isShared=k=>/^(?:trpgMarkerProfile|trpgProjectPeople\.|jijinboardPlayerMaster|jijinboardPersona|jijinboardParticipantSync:|jijinboardDeletedPeople\.|personas:|lastPersona:)/.test(String(k));
 for(const method of ['getItem','setItem','removeItem']){
  const raw=Storage.prototype[method];Storage.prototype[method]=function(key,...args){return raw.call(this,prefix&&this===localStorage&&isShared(key)?prefix+key:key,...args)};
 }
 const keys=()=>{const out=[];for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(prefix&&key?.startsWith(prefix))out.push(key.slice(prefix.length))}return out};
 window.JijinRoomStorage={boardId:board||'',isShared,keys};
})();
