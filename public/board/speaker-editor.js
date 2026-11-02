'use strict';
// A data-only room editor. It never creates a LOG iframe or reads a log body.
window.JijinSpeakerEditor=function(container){
 const service=()=>window.JIJINPlayerMaster;
 const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let draft=null,timer=0,version=0,savedVersion=0,running=null,showDeletes=false,imageJobs=0;
 container.innerHTML=`<style>
 .speaker-editor{height:100%;overflow:auto;box-sizing:border-box;align-content:start;padding:10px;display:grid;gap:10px;font:12px sans-serif;color:#303641}[data-speaker-rows]{display:grid;gap:8px}.speaker-row{display:flex;align-items:center;gap:7px}.speaker-name{min-width:0;flex:1;height:32px;border:1px solid #dce1e9;border-radius:9px;padding:5px 9px;background:#fff;color:inherit}.speaker-image{width:30px;height:30px;flex:0 0 30px;display:grid;place-items:center;cursor:pointer;overflow:hidden;color:#9199a5}.speaker-image img{width:100%;height:100%;object-fit:cover;border-radius:7px}.speaker-image input{display:none}.speaker-color{border:0;padding:0;background:none;width:27px;height:29px;cursor:pointer}.speaker-color::-webkit-color-swatch-wrapper{padding:1px}.speaker-color::-webkit-color-swatch{border:0;border-radius:8px}.speaker-dark{outline:2px solid #272a32;border-radius:9px}.speaker-add{justify-self:center;width:30px;height:30px;border:1px solid #dce1e9;border-radius:50%;background:white;color:inherit;font-size:22px;cursor:pointer}.speaker-link{border:0;background:none;text-align:left;padding:4px 0;color:#838b99;font-size:11px;cursor:pointer}.speaker-delete{border:0;background:none;color:#9d4150;font-size:20px;cursor:pointer}.speaker-transfer{display:flex;flex-wrap:wrap;gap:7px}.speaker-transfer[hidden]{display:none}.speaker-transfer input{width:95px}.speaker-status{font-size:10px;color:#838b99;min-height:14px}.speaker-status.error{color:#a33344}
 </style><div class="speaker-editor"><div data-speaker-rows></div><button type="button" class="speaker-add" aria-label="PCを追加">＋</button><button type="button" class="speaker-link" data-transfer-toggle>引き継ぎ設定</button><div class="speaker-transfer" hidden><button type="button" data-issue>スマホ・別端末を追加</button><input id="transferCodeInput" inputmode="numeric" maxlength="4" aria-label="端末追加コード" placeholder="4桁のコード"><button type="button" data-redeem>引き継ぐ</button></div><button type="button" class="speaker-link" data-delete-toggle>PC削除を表示</button><div class="speaker-status" role="status" aria-live="polite"></div></div>`;
 const rows=container.querySelector('[data-speaker-rows]'),status=container.querySelector('[role=status]');
 function message(text,error=false){status.textContent=text;status.classList.toggle('error',error)}
 function fromMaster(master){return {plName:master.plName,plIcon:master.plIcon||'',plColor:master.plColor||'#ffe66b',plColorDark:master.plColorDark||master.plColor||'#ffe66b',characters:(master.characters||[]).map(c=>({...c}))}}
 function readMaster(){const m=service()?.master;if(draft&&(container.contains(document.activeElement)||draft.characters.some(c=>!String(c.name||'').trim())))return;if(m&&version===savedVersion&&!imageJobs){draft=fromMaster(m);render()}}
 function row(person,id){
  const isPl=id==='PL',prefix=isPl?'PL':'PC',name=isPl?person.plName:person.name,icon=isPl?person.plIcon:person.icon,light=(isPl?person.plColor:person.color)||'#ffe66b',dark=(isPl?person.plColorDark:person.colorDark)||light;
  return `<div class="speaker-row" data-person="${esc(id)}"><label class="speaker-image" title="${prefix}画像">${icon?`<img src="${esc(icon)}" alt="">`:'▧'}<input type="file" accept="image/*" data-field="${isPl?'plIcon':'icon'}" aria-label="${prefix}画像"></label><input class="speaker-name" data-field="${isPl?'plName':'name'}" value="${esc(name)}" maxlength="80" placeholder="${prefix}名" aria-label="${prefix}名" ${isPl?'required':''}>${isPl?'':`<label class="speaker-image" title="MAGIA MATRIX用画像">${person.matrixIcon?`<img src="${esc(person.matrixIcon)}" alt="">`:'M'}<input type="file" accept="image/*" data-field="matrixIcon" aria-label="MATRIX画像"></label>`}<input class="speaker-color" type="color" data-field="${isPl?'plColor':'color'}" value="${esc(light)}" title="白背景用マーカー色" aria-label="${prefix}の白背景用マーカー色"><input class="speaker-color speaker-dark" type="color" data-field="${isPl?'plColorDark':'colorDark'}" value="${esc(dark)}" title="黒背景用マーカー色" aria-label="${prefix}の黒背景用マーカー色">${!isPl&&showDeletes?'<button type="button" class="speaker-delete" aria-label="PCを削除">×</button>':''}</div>`;
 }
 function render(){if(!draft)return;rows.innerHTML=row(draft,'PL')+draft.characters.filter(c=>c.type==='PC').map(c=>row(c,c.id)).join('')}
 function schedule(){version++;clearTimeout(timer);message('保存中…');timer=setTimeout(()=>{timer=0;flush()},220)}
 async function flush(){
  clearTimeout(timer);timer=0;
  if(running)return running;
  if(!draft||version===savedVersion||imageJobs)return;
  if(!draft.plName.trim()){message('PL名を入力してください',true);return}
  running=(async()=>{
   while(savedVersion<version&&!imageJobs){
    const stamp=version,body=structuredClone(draft);
    body.characters=body.characters.filter(c=>String(c.name||'').trim());
    const master=await service().updateProfile(body);savedVersion=stamp;
    if(stamp===version){
     // Keep unnamed PC drafts on screen; they are never uploaded as saved PCs.
     const unnamed=draft.characters.filter(c=>!String(c.name||'').trim());
     draft=fromMaster(master);draft.characters.push(...unnamed);
     if(!container.contains(document.activeElement))render();
     message('');
    }
   }
  })().catch(error=>{message(error.message||'保存できませんでした。再試行してください',true);throw error}).finally(()=>{running=null});
  running.catch(()=>{});return running;
 }
 container.addEventListener('input',event=>{
  const input=event.target,holder=input.closest('[data-person]');if(!holder||!input.dataset.field||input.type==='file'||event.isComposing)return;
  const person=holder.dataset.person==='PL'?draft:draft.characters.find(c=>c.id===holder.dataset.person);if(!person)return;
  person[input.dataset.field]=input.value;schedule();
 });
 container.addEventListener('compositionend',event=>{event.target.dispatchEvent(new Event('input',{bubbles:true}))});
 async function imageData(file){
  const bitmap=await createImageBitmap(file),scale=Math.min(1,512/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();return canvas.toDataURL('image/webp',.84);
 }
 container.addEventListener('change',async event=>{
  const input=event.target;if(input.type!=='file'||!input.files?.[0])return;
  const holder=input.closest('[data-person]'),person=holder.dataset.person==='PL'?draft:draft.characters.find(c=>c.id===holder.dataset.person);if(!person)return;
  imageJobs++;message('画像を保存中…');
  try{person[input.dataset.field]=await imageData(input.files[0]);version++;render()}catch(error){message(error.message,true)}finally{imageJobs--;if(!imageJobs)flush()}
 });
 container.querySelector('.speaker-add').onclick=()=>{
  if(!draft)return;draft.characters.push({id:crypto.randomUUID(),type:'PC',name:'',icon:'',matrixIcon:'',color:'#ffe66b',colorDark:'#ffe66b'});render();rows.querySelector('[data-person]:last-child .speaker-name')?.focus();
 };
 container.querySelector('[data-delete-toggle]').onclick=event=>{showDeletes=!showDeletes;event.target.textContent=showDeletes?'PC削除を隠す':'PC削除を表示';render()};
 container.addEventListener('click',async event=>{
  const button=event.target.closest('.speaker-delete');if(!button)return;button.disabled=true;
  const id=button.closest('[data-person]').dataset.person;
  // A tombstone is written even for a draft that is still being saved.
  try{await service().deleteCharacter(id);draft.characters=draft.characters.filter(c=>c.id!==id);version++;render();await flush()}catch(error){message(error.message,true);button.disabled=false}
 });
 container.querySelector('[data-transfer-toggle]').onclick=()=>{const panel=container.querySelector('.speaker-transfer');panel.hidden=!panel.hidden};
 container.querySelector('[data-issue]').onclick=()=>service().issueDeviceCode();
 container.querySelector('[data-redeem]').onclick=async()=>{await service().redeemDeviceCode();readMaster()};
 addEventListener('jijinboard-player-master-updated',readMaster);
 container.addEventListener('focusout',()=>setTimeout(readMaster,0));
 return {async open(){
  readMaster();
  try{if(!service()?.master)await service().bootstrap();else await service().refresh();readMaster()}
  catch(error){message(error.message,true)}
 },flush};
};
