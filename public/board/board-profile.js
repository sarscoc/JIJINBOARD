"use strict";
const profileDialog=document.querySelector("#boardProfileDialog"),profileForm=document.querySelector("#boardProfileForm");
function savedProfile(){try{return JSON.parse(localStorage.getItem("trpgMarkerProfile")||"null")}catch{return null}}
function openBoardProfile(){if(savedProfile()?.plName)return;profileDialog?.showModal()}
profileForm?.addEventListener("submit",async e=>{
 e.preventDefault();const cur=savedProfile(),name=document.querySelector("#boardPlName")?.value.trim();if(!name)return;
 const button=e.submitter;if(button)button.disabled=true;
 try{
  localStorage.setItem("trpgMarkerProfile",JSON.stringify({id:cur?.id||crypto.randomUUID(),plName:name,plIcon:cur?.plIcon||"",plColor:cur?.plColor||"#ffe66b"}));
  await window.JIJINPlayerMaster.bootstrap();
  profileDialog?.close();const frame=document.querySelector("#logFrame");if(frame?.src)frame.src=frame.src;
 }catch(error){
  if(cur)localStorage.setItem("trpgMarkerProfile",JSON.stringify(cur));else localStorage.removeItem("trpgMarkerProfile");
  alert(error.message||"PL情報を保存できませんでした");
 }finally{if(button)button.disabled=false}
});
(window.JijinBoardReady?.image||Promise.resolve()).then(openBoardProfile);

function installBoardSettingsWorkspace(){
 const actions=document.querySelector(".top-actions");
 if(!actions||document.querySelector("#boardSettingsButton"))return;
 const gearPng="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAEaUlEQVR4AeSYa3LaMBSFibOQkpUU/mWS7KGwEshKoHtIMvkHXQl0H0no+VRf16Anttsw04wvkqX7OMe6ekTVaOC/+/v7neQQkd3A4UaDEri7u5sJ4FgSe8a1Tqz/7PZBCZwdfQCD/4PA7e1t0dBXVZVKH/e9S3QeHh6WkokzyPxUmf4ROXt9fb27urpaaWKucvp9+xVjczgcFofDYSMSy5y/JAHAA7zlZEaA1vtRVUG/HjUEXqTzJdDsmmrfzZeX7iJHIkogAN4F0c9EgXakleruoV4HaoK7jvDPrNZterGXz40aPPsciSCBBHjFcM9YabVR0BVgVN8RyPUU/KArW/YLsw+CN1foE8fe26VHQIqTk7Rp67frTNgZztuNZ9Tb9tSTpsQB26mSR+BU4ZLePz4+PKIegaenp61G4PGSgNdYti8vL+u63hQeAXre3t5Q3FK/ENk+Pz9PQ1iCBF5fX/fv7+9zGVwCiSh44Ysf5lok9ih+kuxjX97wBEfAOiGh+fDd3j+hzGZAkgCAtXxFd076I7IW8UfJFJEP0pF5FVHv3pwlINec8VUUPVvNnRsN+1yr2VKyRVg9aKNPXrJfVTr2eDuzdViZJMCObIoF5Vogp6RdTJc+dDQqpcv0WJtX8kBXcQ4BqAkGJgpUevpkpSBNYtiP2jUqgCoaCaXfQscOd+QAl+GkxGmlc8wGoCYYmKBQIkqNYvDm70wbd2QBl+GkFLEdKeRtzxbkuIy+rUmNaG+ko7YpGoWIC5rHEKDSWfRVfnQ11lfsbGsxexMwRx3LviMQ34lLAel/3M47deh0WRrX9IYYgexabcH+RtmbgOZA9v/gGHDNgc625hMCffNwzF5iDkvL2uacXT7keluxHusrzk30VTjDsFOWnl34/7h0w2tAaP85x8bOVg6bYWVXr1iPOauYsEsi6nSkmojpyoRdMq3yp1cbEOCL5g5gwQImE8OKR1KIMihaJYrTS4HY8o+uW06dkjYCzw1EceoA9tRP+z1JgNGRcmkqSXVEOrnrFs4qGhVGBlkK+Eppw/V60ZfHmSQbO0lADro8HE1mmksrjcqmloUcFX916bpHPn66SuInSYAhly2AVPz7R+S/1RiiwZMENOTFky0aoV+HS8mUiygB5SyT7Zx8TcXp0zeusQR9BAnUBpcA3kBzoUw22HtTegRYPdR7SeAFxz3canu4PAJ9TpcuzD/+8Qhotyu9G91rmXNbe0fMzl62rPXZI7lWJG46vI3VIyCHI5FYAo56RPgn/gY9ROepm4z+kRt0dTxw9irnsufe0wNnRoCP7chBAhgCjEDUTwTwBGya2bHRVwNfU0XyWde6jRL2IjEPxUuBx0GUAJ0EOnHqgUfPRLq/d05rCJQxHUhwK65+TsLOMgcepSQBFGoSXBE+ariPvjz9QwokiAdwEZnG0qYdM0sAZTnlipDLKF6jotNrdjKW6ACcmNFArY4iAi39i6sOSuAz9pBBCWgSkkLR5VDDtyc9VA72/AIAAP//tXkCUwAAAAZJREFUAwCaCTEXLsDTVAAAAABJRU5ErkJggg==";
 const gear=document.createElement("button");gear.id="boardSettingsButton";gear.type="button";gear.className="quiet board-settings-trigger";gear.title="設定";gear.setAttribute("aria-label","設定");gear.setAttribute("aria-expanded","false");gear.innerHTML=`<img src="${gearPng}" alt="">`;
 const overlay=document.createElement("div");overlay.id="boardSettingsOverlay";overlay.className="board-settings-overlay";overlay.hidden=true;overlay.innerHTML=`<div class="board-settings-panel" role="dialog" aria-label="設定"><header class="board-settings-header"><button type="button" class="board-settings-back" data-board-settings-tab="general" hidden aria-label="設定に戻る">‹</button><strong data-settings-title>設定</strong><button type="button" class="board-settings-close" aria-label="設定を閉じる">×</button></header><div class="board-settings-main"><div class="board-settings-pages"><section class="board-settings-page board-settings-general" data-board-settings-page="general"><div class="board-settings-frame-slot" id="boardSpeakerSlot"><div class="board-settings-loading" id="boardSpeakerLoading">読み込み中…</div></div><button type="button" class="board-common-settings-link" data-board-settings-tab="design"><span><b>共通設定</b><small>テーマカラー・Sheetsの表示</small></span><span>›</span></button></section><section class="board-settings-page board-settings-design" data-board-settings-page="design" hidden><div class="board-settings-frame-slot" id="boardDesignSlot"></div></section></div></div></div>`;document.body.append(overlay);actions.replaceChildren(gear);
 const speakerSlot=overlay.querySelector("#boardSpeakerSlot"),speakerLoading=overlay.querySelector("#boardSpeakerLoading");
 let token=0,isOpen=false;
 let speakerEditor=null;
 function ensureSpeaker(){
  if(!speakerEditor){speakerLoading.hidden=true;speakerEditor=window.JijinSpeakerEditor(speakerSlot)}
  return speakerEditor;
 }
 function disposeSpeaker(){speakerEditor?.flush()?.catch(()=>{})}
 function showTab(name){
  const current=++token;
  if(name==="design")disposeSpeaker();
  overlay.querySelector('[data-settings-title]').textContent=name==='design'?'共通設定':'設定';overlay.querySelector('.board-settings-back').hidden=name!=='design';
  overlay.querySelectorAll("[data-board-settings-page]").forEach(p=>p.hidden=p.dataset.boardSettingsPage!==name);
  requestAnimationFrame(()=>{if(current!==token||!isOpen)return;if(name==="design")window.JijinBoardTheme?.open();else ensureSpeaker().open()});
 }
 function open(){isOpen=true;overlay.hidden=false;gear.setAttribute("aria-expanded","true");showTab("general")}
 function close(){if(!isOpen)return;isOpen=false;token++;disposeSpeaker();overlay.hidden=true;gear.setAttribute("aria-expanded","false")}
 window.JijinBoardSettings={open};
 window.addEventListener("message",event=>{if(event.origin===location.origin&&event.source===document.getElementById("logFrame")?.contentWindow&&event.data?.type==="jijinboard-open-settings")open()});
 gear.addEventListener("click",()=>isOpen?close():open());
 overlay.addEventListener("click",event=>{const button=event.target.closest("[data-board-settings-tab]");if(button)showTab(button.dataset.boardSettingsTab)});
 overlay.querySelector(".board-settings-close").onclick=close;
 document.addEventListener("keydown",e=>{if(e.key==="Escape"&&isOpen)close()});
}
installBoardSettingsWorkspace();
