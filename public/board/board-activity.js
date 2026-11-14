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
  let rows=read(),navigation=0;
  function save(){
    try{localStorage.setItem(key,JSON.stringify({generation:generation(),rows}))}catch{}
    button.classList.toggle('unread',rows.some(row=>row.unread));
  }
  function setOpen(open){
    panel.hidden=!open;
    button.setAttribute('aria-expanded',String(open));
  }
  function receive(event){
    const data=event.detail;
    if(!data||!['comment','placement'].includes(data.kind))return;
    let target,entry;
    try{
      target=JijinCommentTarget.parse(data.kind==='placement'?
        JijinCommentTarget.matrix(boardId,data.templateId,data.itemId):data.target,boardId);
      if(target.kind==='matrix'&&!target.templateId)return;
      if(typeof data.id!=='string'||!data.id)return;
      entry={kind:data.kind,id:data.id,target,
        author:String(data.authorName||'').slice(0,80),reply:!!data.reply,at:Date.now(),unread:panel.hidden};
    }catch{return}
    const saved=new Map([...rows,...read()].map(row=>[row.id,row]));
    if(saved.has(entry.id))return;
    rows=[entry,...[...saved.values()].sort((a,b)=>b.at-a.at)].slice(0,50);
    save();
    if(!panel.hidden)render();
  }

  function render(){
    list.replaceChildren();
    for(const row of rows){
      const item=document.createElement('li'),open=document.createElement('button'),time=document.createElement('time');
      const log=row.target.kind==='log'&&state.board?.logs?.find(item=>item.roomId===row.target.logId);
      const unopened=log?.spoiler&&!state.opened[row.target.logId];
      const area=row.target.kind==='log'?(unopened?'LOG':log?.scenarioTitle||log?.title||'LOG'):
        row.target.kind==='matrix'?'MAGIA MATRIX':'SPREADSHEET';
      const action=row.kind==='placement'?'コマを置きました':row.reply?'返信しました':'コメントしました';
      open.type='button';
      const label=document.createElement('span');
      label.textContent=area+' · '+(!unopened&&row.author?row.author+'が':'')+action;
      time.textContent=new Date(row.at).toLocaleString('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
      open.addEventListener('click',()=>navigate(row));
      open.append(label,time);
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
