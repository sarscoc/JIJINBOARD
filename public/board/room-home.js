"use strict";
(()=>{
  if(typeof state==='undefined'||typeof selectTool!=='function'||typeof requestOpen!=='function'||!boardId)return;

  const startParams=new URL(location.href).searchParams;
  const directLog=!!startParams.get('room');
  let bootGuard=!directLog;
  const originalRequestOpen=requestOpen;
  const originalSelectTool=selectTool;
  const homeImageEndpoint=()=>`/api/boards/${encodeURIComponent(boardId)}/theme?asset=home-image`;
  let homeImageUrl='';

  if(bootGuard){
    requestOpen=function(roomId){if(bootGuard)return;return originalRequestOpen(roomId)};
  }

  const style=document.createElement('style');
  style.textContent=`
    .board-layout.home-open{grid-template-columns:1fr!important}.board-layout.home-open .log-sidebar{display:none!important}
    .room-home{position:absolute;inset:0;overflow:auto;background:#fff;color:var(--jijin-pre-color1,#171a20);padding:clamp(28px,5vw,72px)}
    .room-home.hidden{display:none!important}.room-home-inner{min-height:100%;display:grid;grid-template-rows:auto minmax(0,1fr) auto;gap:20px;max-width:1320px;margin:0 auto}
    .room-home-title{justify-self:end;max-width:min(72vw,760px);margin:0;text-align:right;font-size:clamp(22px,3.2vw,48px);line-height:1.05;letter-spacing:-.035em;color:rgb(75,75,75);font-weight:800}
    .room-home-visual{align-self:center;justify-self:center;width:min(78vw,980px);display:grid;place-items:center;position:relative;min-height:240px}
    .room-home-picture{display:block;max-width:100%;max-height:min(62vh,680px);width:auto;height:auto;object-fit:contain;border-radius:4px;box-shadow:0 10px 36px rgba(0,0,0,.08)}
    .room-home-placeholder{display:grid;place-items:center;width:min(70vw,760px);aspect-ratio:16/9;border:1px dashed #d9dde2;border-radius:6px;color:#9aa0a8;background:#fafafa;font-size:12px}
    .room-home-image-input{display:none}.room-home-image-action{position:absolute;right:8px;bottom:8px;border:0;border-radius:999px;background:rgba(255,255,255,.92);color:#5a6068;padding:7px 11px;font:700 10px/1 system-ui;box-shadow:0 2px 12px rgba(0,0,0,.12);cursor:pointer}
    .room-home-image-action[disabled]{opacity:.55;cursor:wait}.room-home-people{display:flex;justify-content:center;align-items:center;flex-wrap:wrap;gap:10px;min-height:52px}
    .room-home-person{width:48px;height:48px;border-radius:50%;overflow:hidden;background:#f1f2f4;border:1px solid #e2e4e8;display:grid;place-items:center;color:#777;font-size:13px;font-weight:800}
    .room-home-person img{width:100%;height:100%;object-fit:cover;display:block}.room-home-person span{line-height:1}.room-home-status{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);font-size:9px;color:#777;background:#fff;padding:3px 7px;border-radius:999px;box-shadow:0 1px 7px rgba(0,0,0,.08)}
    @media(max-width:820px){.room-home{padding:24px 18px}.room-home-title{max-width:90vw;font-size:clamp(20px,7vw,34px)}.room-home-visual{width:94vw}.room-home-picture{max-height:56vh}.room-home-person{width:42px;height:42px}.room-home-inner{gap:14px}}
  `;
  document.head.appendChild(style);

  const nav=document.querySelector('.app-tabs');
  let homeButton=nav?.querySelector('[data-tool="home"]');
  if(nav&&!homeButton){homeButton=document.createElement('button');homeButton.type='button';homeButton.dataset.tool='home';homeButton.textContent='HOME';nav.insertBefore(homeButton,nav.firstChild)}

  const stage=document.querySelector('.tool-stage');
  let home=document.getElementById('roomHome');
  if(stage&&!home){
    home=document.createElement('section');home.id='roomHome';home.className='room-home hidden';
    home.innerHTML='<div class="room-home-inner"><h1 id="roomHomeTitle" class="room-home-title"></h1><div id="roomHomeVisual" class="room-home-visual"><div id="roomHomePlaceholder" class="room-home-placeholder">ROOM IMAGE</div><img id="roomHomePicture" class="room-home-picture" alt="卓のスクリーンショット" hidden><input id="roomHomeImageInput" class="room-home-image-input" type="file" accept="image/*"><button id="roomHomeImageAction" class="room-home-image-action" type="button">画像を追加</button><span id="roomHomeStatus" class="room-home-status" hidden></span></div><div id="roomHomePeople" class="room-home-people"></div></div>';
    stage.insertBefore(home,stage.firstChild);
  }

  function owner(){return !!adminToken()}
  function participants(){
    const seen=new Set();
    return (state.board?.participants||[]).filter(person=>{const key=String(person.personaId||person.name||'');if(!key||seen.has(key))return false;seen.add(key);return true});
  }
  function renderPeople(){
    const box=document.getElementById('roomHomePeople');if(!box)return;
    box.innerHTML=participants().map(person=>`<span class="room-home-person" title="${esc(person.name||'')}">${person.icon?`<img src="${esc(person.icon)}" alt="${esc(person.name||'')}">`:`<span>${esc(String(person.name||'?').slice(0,1))}</span>`}</span>`).join('');
  }
  function status(text=''){const el=document.getElementById('roomHomeStatus');if(!el)return;el.textContent=text;el.hidden=!text}
  function showImageBlob(blob){
    const picture=document.getElementById('roomHomePicture'),placeholder=document.getElementById('roomHomePlaceholder'),action=document.getElementById('roomHomeImageAction');if(!picture)return;
    if(homeImageUrl)URL.revokeObjectURL(homeImageUrl);homeImageUrl=URL.createObjectURL(blob);picture.src=homeImageUrl;picture.hidden=false;if(placeholder)placeholder.hidden=true;if(action)action.textContent='画像を変更';
  }
  async function loadHomeImage(){
    const picture=document.getElementById('roomHomePicture'),placeholder=document.getElementById('roomHomePlaceholder'),action=document.getElementById('roomHomeImageAction');if(action)action.hidden=!owner();
    try{const response=await fetch(homeImageEndpoint(),{cache:'no-store'});if(!response.ok)throw new Error(String(response.status));showImageBlob(await response.blob())}catch{if(picture)picture.hidden=true;if(placeholder){placeholder.hidden=false;placeholder.textContent=owner()?'卓スクショを追加できます':''}if(action&&owner())action.textContent='画像を追加'}
  }
  function renderHome(){
    const title=document.getElementById('roomHomeTitle');if(title)title.textContent=state.board?.name||'';
    renderPeople();loadHomeImage().catch(()=>{});
  }

  async function canvasBlob(canvas,quality){return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('画像を変換できませんでした')),'image/webp',quality))}
  async function compactImage(file){
    const bitmap=await createImageBitmap(file);let maxSide=1400,scale=Math.min(1,maxSide/Math.max(bitmap.width,bitmap.height)),width=Math.max(1,Math.round(bitmap.width*scale)),height=Math.max(1,Math.round(bitmap.height*scale));
    let canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;let ctx=canvas.getContext('2d',{alpha:false});ctx.drawImage(bitmap,0,0,width,height);bitmap.close?.();
    let blob=null;for(const quality of [.84,.76,.68,.60]){blob=await canvasBlob(canvas,quality);if(blob.size<=600000)break}
    if(blob&&blob.size>900000&&Math.max(width,height)>1100){scale=1100/Math.max(width,height);width=Math.max(1,Math.round(width*scale));height=Math.max(1,Math.round(height*scale));const smaller=document.createElement('canvas');smaller.width=width;smaller.height=height;smaller.getContext('2d',{alpha:false}).drawImage(canvas,0,0,width,height);canvas=smaller;blob=await canvasBlob(canvas,.68)}
    if(!blob||blob.size>1500000)throw new Error('画像を十分に小さくできませんでした');return blob;
  }
  async function uploadImage(file){
    const action=document.getElementById('roomHomeImageAction');if(action)action.disabled=true;status('画像を軽くしています…');
    try{
      const blob=await compactImage(file);status('保存しています…');
      const response=await fetch(homeImageEndpoint(),{method:'PUT',headers:{'content-type':'image/webp','x-board-admin-token':adminToken()},body:blob});
      if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||'画像を保存できませんでした')}
      showImageBlob(blob);status(`保存しました ${Math.max(1,Math.round(blob.size/1024))}KB`);setTimeout(()=>status(''),1400);
    }catch(error){status(error.message||'画像を保存できませんでした');setTimeout(()=>status(''),2600)}finally{if(action)action.disabled=false}
  }

  document.getElementById('roomHomeImageAction')?.addEventListener('click',()=>{if(owner())document.getElementById('roomHomeImageInput')?.click()});
  document.getElementById('roomHomeImageInput')?.addEventListener('change',event=>{const file=event.target.files?.[0];event.target.value='';if(file)uploadImage(file)});

  selectTool=function(tool){
    if(tool!=='home'){
      home?.classList.add('hidden');document.querySelector('.board-layout')?.classList.remove('home-open');
      return originalSelectTool(tool);
    }
    state.tool='home';closeSpoiler();
    document.querySelectorAll('[data-tool]').forEach(button=>button.classList.toggle('active',button.dataset.tool==='home'));
    ['logFrame','matrixFrame','spreadsheetFrame'].forEach(id=>document.getElementById(id)?.classList.add('hidden'));
    document.getElementById('welcome')?.classList.add('hidden');document.getElementById('logSidebar')?.classList.add('tool-hidden');document.querySelector('.board-layout')?.classList.add('home-open');home?.classList.remove('hidden');
    setLogActive(document.getElementById('logFrame'),false);
    document.getElementById('matrixFrame')?.contentWindow?.postMessage({type:'jijinboard-matrix-active',active:false},location.origin);
    document.getElementById('spreadsheetFrame')?.contentWindow?.postMessage({type:'jijinboard-spreadsheet-active',active:false},location.origin);
    const url=new URL(location.href);url.searchParams.delete('room');history.replaceState(null,'',url.pathname+url.search);
    renderHome();
  };

  homeButton?.addEventListener('click',()=>selectTool('home'));
  document.querySelectorAll('[data-tool]').forEach(button=>{if(button===homeButton)return;const old=button.onclick;button.onclick=()=>selectTool(button.dataset.tool)});

  const waitForBoard=()=>{
    if(!state.board){requestAnimationFrame(waitForBoard);return}
    if(!directLog){
      if(!state.activeRoom)state.activeRoom=state.board.logs?.[0]?.roomId||'';
      bootGuard=false;
      selectTool('home');
    }else bootGuard=false;
  };
  requestAnimationFrame(waitForBoard);
})();
