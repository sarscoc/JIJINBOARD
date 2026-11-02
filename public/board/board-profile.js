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
 const share=document.createElement("button");share.id="shareBoard";share.type="button";
 if(!actions||document.querySelector("#boardSettingsButton"))return;
 const gearPng="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAEaUlEQVR4AeSYa3LaMBSFibOQkpUU/mWS7KGwEshKoHtIMvkHXQl0H0no+VRf16Anttsw04wvkqX7OMe6ekTVaOC/+/v7neQQkd3A4UaDEri7u5sJ4FgSe8a1Tqz/7PZBCZwdfQCD/4PA7e1t0dBXVZVKH/e9S3QeHh6WkokzyPxUmf4ROXt9fb27urpaaWKucvp9+xVjczgcFofDYSMSy5y/JAHAA7zlZEaA1vtRVUG/HjUEXqTzJdDsmmrfzZeX7iJHIkogAN4F0c9EgXakleruoV4HaoK7jvDPrNZterGXz40aPPsciSCBBHjFcM9YabVR0BVgVN8RyPUU/KArW/YLsw+CN1foE8fe26VHQIqTk7Rp67frTNgZztuNZ9Tb9tSTpsQB26mSR+BU4ZLePz4+PKIegaenp61G4PGSgNdYti8vL+u63hQeAXre3t5Q3FK/ENk+Pz9PQ1iCBF5fX/fv7+9zGVwCiSh44Ysf5lok9ih+kuxjX97wBEfAOiGh+fDd3j+hzGZAkgCAtXxFd076I7IW8UfJFJEP0pF5FVHv3pwlINec8VUUPVvNnRsN+1yr2VKyRVg9aKNPXrJfVTr2eDuzdViZJMCObIoF5Vogp6RdTJc+dDQqpcv0WJtX8kBXcQ4BqAkGJgpUevpkpSBNYtiP2jUqgCoaCaXfQscOd+QAl+GkxGmlc8wGoCYYmKBQIkqNYvDm70wbd2QBl+GkFLEdKeRtzxbkuIy+rUmNaG+ko7YpGoWIC5rHEKDSWfRVfnQ11lfsbGsxexMwRx3LviMQ34lLAel/3M47deh0WRrX9IYYgexabcH+RtmbgOZA9v/gGHDNgc625hMCffNwzF5iDkvL2uacXT7keluxHusrzk30VTjDsFOWnl34/7h0w2tAaP85x8bOVg6bYWVXr1iPOauYsEsi6nSkmojpyoRdMq3yp1cbEOCL5g5gwQImE8OKR1KIMihaJYrTS4HY8o+uW06dkjYCzw1EceoA9tRP+z1JgNGRcmkqSXVEOrnrFs4qGhVGBlkK+Eppw/V60ZfHmSQbO0lADro8HE1mmksrjcqmloUcFX916bpHPn66SuInSYAhly2AVPz7R+S/1RiiwZMENOTFky0aoV+HS8mUiygB5SyT7Zx8TcXp0zeusQR9BAnUBpcA3kBzoUw22HtTegRYPdR7SeAFxz3canu4PAJ9TpcuzD/+8Qhotyu9G91rmXNbe0fMzl62rPXZI7lWJG46vI3VIyCHI5FYAo56RPgn/gY9ROepm4z+kRt0dTxw9irnsufe0wNnRoCP7chBAhgCjEDUTwTwBGya2bHRVwNfU0XyWde6jRL2IjEPxUuBx0GUAJ0EOnHqgUfPRLq/d05rCJQxHUhwK65+TsLOMgcepSQBFGoSXBE+ariPvjz9QwokiAdwEZnG0qYdM0sAZTnlipDLKF6jotNrdjKW6ACcmNFArY4iAi39i6sOSuAz9pBBCWgSkkLR5VDDtyc9VA72/AIAAP//tXkCUwAAAAZJREFUAwCaCTEXLsDTVAAAAABJRU5ErkJggg==";
 const st=document.createElement("style");st.id="boardSettingsStyle";st.textContent=`
 .board-settings-overlay{position:fixed;inset:0;z-index:2300}.board-settings-overlay[hidden]{display:none!important}.board-settings-panel{display:grid;grid-template-columns:58px minmax(0,1fr);overflow:hidden;border:1px solid #dfe3e8;background:#fff}.board-settings-tabs{display:flex;flex-direction:column;gap:2px;border-right:1px solid #e4e7ec;background:#f7f8fa}.board-settings-tab{border:0;background:transparent;color:#8a929d;font-weight:800;cursor:pointer}.board-settings-tab.active{background:#fff;color:#252b34}.board-settings-main,.board-settings-pages{position:relative;min-width:0;min-height:0}.board-settings-page{position:absolute;inset:0;display:grid;min-width:0;min-height:0;background:#fff}.board-settings-page[hidden]{display:none!important}.board-settings-general{grid-template-rows:auto minmax(0,1fr)}.board-settings-section{min-width:0;border:1px solid #e4e7ec;border-radius:10px;background:#fff;overflow:hidden}.board-settings-section-head{display:flex;align-items:baseline;gap:8px;border-bottom:1px solid #eceef2}.board-settings-section-head b{font-size:9px}.board-settings-section-head span{font-size:7px;color:#9299a4}.board-share-body{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px}.board-share-url{width:100%;min-width:0;height:30px;padding:5px 8px;border:1px solid #e1e5ea;border-radius:7px;background:#fafbfc;color:#59616d;font-size:9px}.board-settings-copy{height:30px!important}.board-speaker-section{display:grid;grid-template-rows:auto minmax(0,1fr);min-height:0}.board-settings-frame-slot{position:relative;min-width:0;min-height:0;overflow:hidden;background:#fff}.board-settings-loading{position:absolute;inset:0;display:grid;place-items:center;color:#959ca6;font-size:9px;z-index:1}.board-settings-loading[hidden]{display:none!important}.board-settings-design{padding:0}.board-settings-design .board-settings-frame-slot{height:100%}
 #boardSettingsButton.board-settings-trigger>img{display:block!important;width:16px!important;height:16px!important;object-fit:contain!important;pointer-events:none!important}
 `;document.head.append(st);
 const gear=document.createElement("button");gear.id="boardSettingsButton";gear.type="button";gear.className="quiet board-settings-trigger";gear.title="設定";gear.setAttribute("aria-label","設定");gear.setAttribute("aria-expanded","false");gear.innerHTML=`<img src="${gearPng}" alt="">`;
 const overlay=document.createElement("div");overlay.id="boardSettingsOverlay";overlay.className="board-settings-overlay";overlay.hidden=true;overlay.innerHTML=`<div class="board-settings-panel" role="dialog" aria-label="設定"><nav class="board-settings-tabs"><button type="button" class="board-settings-tab active" data-board-settings-tab="general">基本</button><button type="button" class="board-settings-tab" data-board-settings-tab="design">デザイン</button></nav><div class="board-settings-main"><div class="board-settings-pages"><section class="board-settings-page board-settings-general" data-board-settings-page="general"><div class="board-settings-section"><div class="board-settings-section-head"><b>共有URL</b><span>この部屋へのリンク</span></div><div class="board-share-body"><input class="board-share-url" id="boardShareUrl" readonly></div></div><div class="board-settings-section board-speaker-section"><div class="board-settings-section-head"><b>発言者設定</b><span>PL・PC・マーカー色・画像・引き継ぎ</span></div><div class="board-settings-frame-slot" id="boardSpeakerSlot"><div class="board-settings-loading" id="boardSpeakerLoading">読み込み中…</div></div></div></section><section class="board-settings-page board-settings-design" data-board-settings-page="design" hidden><div class="board-settings-frame-slot" id="boardDesignSlot"></div></section></div></div></div>`;document.body.append(overlay);
 const shareBody=overlay.querySelector(".board-share-body");share.className="board-settings-copy";share.textContent="コピー";shareBody.append(share);actions.replaceChildren(gear);
 share.addEventListener("click",async()=>{await navigator.clipboard.writeText(shareUrl.value);share.textContent="コピー済";setTimeout(()=>share.textContent="コピー",1400)});
 const shareUrl=overlay.querySelector("#boardShareUrl"),speakerSlot=overlay.querySelector("#boardSpeakerSlot"),speakerLoading=overlay.querySelector("#boardSpeakerLoading");
 let token=0,isOpen=false;
 const boardId=()=>new URL(location.href).searchParams.get("id")||"";
 let speakerEditor=null;
 function ensureSpeaker(){
  if(!speakerEditor){speakerLoading.hidden=true;speakerEditor=window.JijinSpeakerEditor(speakerSlot)}
  return speakerEditor;
 }
 function disposeSpeaker(){speakerEditor?.flush()?.catch(()=>{})}
 function showTab(name){
  const current=++token;
  if(name==="design")disposeSpeaker();
  overlay.querySelectorAll("[data-board-settings-tab]").forEach(b=>b.classList.toggle("active",b.dataset.boardSettingsTab===name));
  overlay.querySelectorAll("[data-board-settings-page]").forEach(p=>p.hidden=p.dataset.boardSettingsPage!==name);
  requestAnimationFrame(()=>{if(current!==token||!isOpen)return;if(name==="design")window.JijinBoardTheme?.open();else ensureSpeaker().open()});
 }
 function open(){isOpen=true;overlay.hidden=false;gear.setAttribute("aria-expanded","true");shareUrl.value=`${location.origin}/board/?id=${encodeURIComponent(boardId())}`;showTab("general")}
 function close(){if(!isOpen)return;isOpen=false;token++;disposeSpeaker();overlay.hidden=true;gear.setAttribute("aria-expanded","false")}
 gear.addEventListener("click",()=>isOpen?close():open());
 overlay.querySelectorAll("[data-board-settings-tab]").forEach(b=>b.addEventListener("click",()=>showTab(b.dataset.boardSettingsTab)));
 document.addEventListener("keydown",e=>{if(e.key==="Escape"&&isOpen)close()});
}
installBoardSettingsWorkspace();
