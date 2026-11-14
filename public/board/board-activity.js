'use strict';
(()=>{
  const button=document.getElementById('boardActivityButton');
  const panel=document.getElementById('boardActivity');
  if(!button||!panel||!boardId)return;
  const list=panel.querySelector('ol'),status=panel.querySelector('[role="status"]');
  const key='jijinboardActivity:'+encodeURIComponent(boardId);
  const generation=()=>localStorage.getItem('jijin.dataset.generation.v1');
  function read(){
    try{
      const saved=JSON.parse(localStorage.getItem(key));
      if(saved?.generation===generation()&&Array.isArray(saved.rows))return saved.rows;
    }catch{}
    return [];
  }
  const activityDate=new Intl.DateTimeFormat('ja-JP',{
    month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  });
  let rows=read(),navigation=0;
  function save(){
    try{localStorage.setItem(key,JSON.stringify({generation:generation(),rows}))}catch{}
    button.classList.toggle('unread',rows.some(row=>row.unread));
  }
  function setOpen(open){
    panel.hidden=!open;
    button.setAttribute('aria-expanded',String(open));
  }
  function parseEntry(data){
    if(!data||!['comment','placement'].includes(data.kind)||typeof data.id!=='string'||!data.id)return null;
    try{
      const target=JijinCommentTarget.parse(data.kind==='placement'?
        JijinCommentTarget.matrix(boardId,data.templateId,data.itemId):data.target,boardId);
      if(target.kind==='matrix'&&!target.templateId)return null;
      const at=Number.isFinite(data.at)&&data.at>0&&data.at<=8640000000000000?data.at:Date.now();
      return {kind:data.kind,id:data.id,target,
        tokenName:String(data.tokenName||'').slice(0,120),icon:String(data.icon||'').slice(0,500),
        authorId:String(data.authorId||''),author:String(data.authorName||'').slice(0,80),reply:!!data.reply,at,unread:panel.hidden};
    }catch{return null}
  }
  function receive(event){
    const saved=new Map([...rows,...read()].map(row=>[row.id,row]));
    const incoming=Array.isArray(event.detail)?event.detail:[event.detail];
    let changed=false;
    const additions=[];
    for(const data of incoming){
      const entry=parseEntry(data);
      if(!entry||saved.has(entry.id))continue;
      saved.set(entry.id,entry);
      additions.push(entry);
      changed=true;
    }
    if(!changed)return;
    const addedIds=new Set(additions.map(entry=>entry.id));
    rows=[...additions,...[...saved.values()].filter(entry=>!addedIds.has(entry.id))].sort((a,b)=>b.at-a.at).slice(0,50);
    save();
    if(!panel.hidden)render();
  }

  function localJson(key,fallback){
    try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}
  }
  function avatarUrl(value){
    if(typeof value!=='string')return '';
    const prefix=`/api/boards/${encodeURIComponent(boardId)}/player-icons/`;
    if(value.startsWith(prefix)&&/^(?:matrix-icons|character-icons|pl-icons)\/[A-Za-z0-9_-]{20,80}$/.test(value.slice(prefix.length)))return value;
    return /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(value)?value:'';
  }
  function savedPeople(){
    const profile=localJson('trpgMarkerProfile',null);
    const presence=localJson(`board:${encodeURIComponent(boardId)}:presence`,null);
    const matrixCache=localJson(`board:${encodeURIComponent(boardId)}:matrix-pcs:${encodeURIComponent(state.activeRoom||boardId)}`,null);
    return {
      participants:[...(matrixCache?.generation===generation()?matrixCache.participants||[]:[]),...(state.board?.participants||[])],
      people:localJson('trpgProjectPeople.v1',[]),
      players:[...(presence?.generation===generation()?presence.people||[]:[]),
        ...(profile?[{author_id:profile.id,pl_name:profile.plName,pl_icon:profile.plIcon}]:[])]
    };
  }
  function details(row,{participants,people,players}){
    if(row.kind==='placement'){
      const pointId=row.target.pointId;
      const person=participants.find(p=>`participant:${p.authorId}:${p.personaId}`===pointId);
      const local=people.find(p=>`participant:${p.plId}:${p.id}`===pointId);
      return {name:row.tokenName||person?.name||local?.name,
        icon:avatarUrl(row.icon)||avatarUrl(person?.matrixIcon||person?.icon||local?.matrixIcon||local?.icon)};
    }
    const characters=new Map(participants.filter(p=>p.name===row.author&&(!row.authorId||p.authorId===row.authorId)).map(p=>[JSON.stringify([p.authorId,p.personaId]),p]));
    const local=people.filter(p=>p.name===row.author&&(!row.authorId||(p.plId||p.id)===row.authorId));
    const player=players.find(p=>p.pl_name===row.author&&(!row.authorId||p.author_id===row.authorId));
    return {icon:avatarUrl(row.icon)||avatarUrl(characters.size===1?characters.values().next().value.baseIcon:'')||
      avatarUrl(local.length===1?local[0].icon:'')||avatarUrl(player?.pl_icon)};
  }

  function render(){
    list.replaceChildren();
    const people=savedPeople();
    for(const row of rows){
      const item=document.createElement('li'),open=document.createElement('button'),time=document.createElement('time');
      const log=row.target.kind==='log'&&state.board?.logs?.find(item=>item.roomId===row.target.logId);
      const unopened=log?.spoiler&&!state.opened[row.target.logId];
      const area=row.target.kind==='log'?(unopened?'LOG':log?.scenarioTitle||log?.title||'LOG'):
        row.target.kind==='matrix'?'MM':'Sheets';
      const {name,icon}=unopened?{}:details(row,people);
      const action=row.kind==='placement'?(name?name+'の':'')+'コマを配置':row.reply?'返信':'コメント';
      open.type='button';
      const label=document.createElement('span');
      label.textContent=area+' · '+(!unopened&&row.author?row.author+'が':'')+action;
      const date=new Date(row.at);
      time.dateTime=date.toISOString();
      time.textContent=activityDate.format(date);
      open.title=label.textContent+' · '+date.toLocaleString('ja-JP');
      open.addEventListener('click',()=>navigate(row));
      const avatar=document.createElement('span');
      avatar.className='board-activity-avatar';
      avatar.setAttribute('aria-hidden','true');
      if(icon){
        const image=document.createElement('img');
        image.alt='';
        image.loading='lazy';
        image.addEventListener('error',()=>image.remove(),{once:true});
        image.src=icon;
        avatar.append(image);
      }
      open.append(avatar,label,time);
      item.append(open);
      list.append(item);
    }
    status.textContent=rows.length?'':'まだ更新はありません。';
  }
  async function navigate(row){
    const token=++navigation,target=row.target;
    const tool=target.kind==='sheet'?'spreadsheet':target.kind;
    const frame=document.getElementById(tool+'Frame');
    if(tool==='log'){
      const log=state.board?.logs?.find(item=>item.roomId===target.logId);
      if(!log){status.textContent='このログは見つかりませんでした。';return}
      if(log.spoiler&&!state.opened[target.logId]){
        setOpen(false);
        requestOpen(target.logId);
        const spoiler=document.getElementById('spoilerDialog');
        await new Promise(resolve=>spoiler.addEventListener('close',resolve,{once:true}));
        if(state.activeRoom!==target.logId||token!==navigation)return;
      }else await openLog(target.logId);
    }else selectTool(tool);
    if(!panel.hidden)setOpen(false);
    // Wait for the existing iframe and its data to finish loading.
    for(let attempt=0;attempt<40&&token===navigation&&state.tool===tool;attempt++){
      if(tool==='log'&&state.activeRoom!==target.logId)return;
      if(frame.dataset.ready==='1'){
        try{if(await frame.contentWindow?.jijinOpenActivity?.(row))return}catch{}
      }
      await new Promise(resolve=>setTimeout(resolve,200));
    }
    if(token===navigation&&state.tool===tool){
      render();
      if(panel.hidden)setOpen(true);
      status.textContent='更新先が見つかりませんでした。';
    }
  }
  button.addEventListener('click',()=>{
    navigation++;
    if(!panel.hidden){setOpen(false);return}
    rows=rows.map(row=>({...row,unread:false}));
    save();
    render();
    setOpen(true);
  });
  document.addEventListener('pointerdown',event=>{
    if(!button.contains(event.target)&&!panel.contains(event.target))setOpen(false);
  });
  document.addEventListener('keydown',event=>{
    if(event.key!=='Escape'||panel.hidden)return;
    if(panel.contains(document.activeElement))button.focus();
    setOpen(false);
  });
  addEventListener('blur',()=>{
    if(document.activeElement?.tagName==='IFRAME')setOpen(false);
  });
  addEventListener('jijinboard-activity',receive);
  addEventListener('storage',event=>{if(event.key===key){rows=read();button.classList.toggle('unread',rows.some(row=>row.unread));if(!panel.hidden)render()}});
  button.classList.toggle('unread',rows.some(row=>row.unread));
})();
