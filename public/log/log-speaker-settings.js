'use strict';
// LOGCOMMENTS uses the same PL/PC editor as the room settings.
(()=>{
 const embedded=new URL(location.href).searchParams.get('embedded')==='1'&&parent!==window;
 const dialog=document.getElementById('profileDialog');
 let editor=null;
 window.JijinLogSettings={async open(){
  if(embedded){parent.postMessage({type:'jijinboard-open-settings'},location.origin);return}
  const slot=document.getElementById('logSpeakerSlot');
  if(typeof state!=="undefined"&&!String(state.profile?.plName||'').trim()){
   slot.innerHTML='<form data-log-pl-setup><label>あなたのPL名（必須）<input name="plName" maxlength="80" required autocomplete="nickname"></label><button type="submit">この部屋に入る</button><p role="status"></p></form>';
   slot.querySelector('form').onsubmit=async event=>{
    event.preventDefault();const button=event.submitter,input=slot.querySelector('input');if(!input.value.trim())return;
    const previous={...state.profile};if(button)button.disabled=true;
    try{state.profile.plName=input.value.trim();saveProfile();await window.JIJINPlayerMaster.bootstrap();editor=null;await window.JijinLogSettings.open()}
    catch(error){state.profile=previous;saveProfile();slot.querySelector('[role=status]').textContent=error.message;if(button)button.disabled=false}
   };
   if(!dialog.open)dialog.showModal();return;
  }
  editor||=window.JijinSpeakerEditor(slot);
  if(!dialog.open)dialog.showModal();await editor.open();
 }};
 dialog.addEventListener('close',()=>editor?.flush()?.catch(()=>{}));
 // The shared master updates the current comment speaker after any room edit.
 window.addEventListener('jijinboard-player-master-updated',()=>{
  try{fillPersonaSelect();heartbeatPresence()}catch{}
 });
})();
