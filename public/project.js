"use strict";
const data=window.TRPGProjectData,$=selector=>document.querySelector(selector);let pendingIcon="";
const startupUrl=new URL(location.href);if(startupUrl.searchParams.get("room"))location.replace(`/log/${startupUrl.search}`);
function escapeHtml(value=""){return String(value).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]))}
function initials(name){return [...String(name||"?")].slice(0,2).join("")}
function iconMarkup(person){return person.icon?`<img class="person-icon" src="${escapeHtml(person.icon)}" alt="">`:`<span class="person-icon">${escapeHtml(initials(person.name))}</span>`}
function ownedRoomIds(){const ids=[];for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key?.startsWith("admin:"))ids.push(key.slice(6))}return ids}
async function renderSessions(){
  const ids=ownedRoomIds(),saved=data.read("trpgMarkerOwnedRooms",{}),meta=data.sessions(),list=$("#sessionList");
  const rooms=await Promise.all(ids.map(async id=>{try{const response=await fetch(`/api/rooms/${encodeURIComponent(id)}?summary=1`,{cache:"no-store"});if(!response.ok)throw new Error();return{...(await response.json()),available:true}}catch{return{id,title:saved[id]?.title||"",available:false}}}));
  rooms.sort((a,b)=>String(a.createdAt||"").localeCompare(String(b.createdAt||"")));
  list.innerHTML=rooms.map((room,index)=>{const label=`SESSION ${String(index+1).padStart(2,"0")}`,session=meta[room.id]||{};return `<button class="session-card" data-room-id="${escapeHtml(room.id)}" data-label="${label}" data-title="${escapeHtml(session.scenarioName||room.title||"シナリオ名未設定")}" ${room.available?"":"disabled"}><span>${label}</span><strong>${room.available?"LOG":"読み込めません"}</strong><i>開く ›</i></button>`}).join("");
  $("#sessionEmpty").hidden=rooms.length>0;list.querySelectorAll("[data-room-id]").forEach(button=>button.onclick=()=>openSpoiler(button.dataset.roomId,button.dataset.label,button.dataset.title));
}
function openSpoiler(roomId,label,title){
  const session=data.sessions()[roomId]||{},people=data.people(),roomPersonas=data.read(`personas:${roomId}`,[]),participantIds=session.participantIds?.length?session.participantIds:roomPersonas.filter(item=>item.type==="PC").map(item=>item.projectPersonId).filter(Boolean),participants=participantIds.map(id=>people.find(item=>item.id===id)).filter(Boolean);
  $("#spoilerSessionLabel").textContent=label;$("#spoilerTitle").textContent=title;$("#spoilerParticipants").innerHTML=participants.length?`<span>参加PC</span><strong>${participants.map(item=>escapeHtml(item.name)).join(" / ")}</strong>`:"";$("#openSessionLink").href=`/log/?room=${encodeURIComponent(roomId)}`;$("#spoilerDialog").showModal();
}
function renderPeople(){
  const people=data.importLogPeople(),root=$("#peopleGroups"),plById=new Map(people.filter(item=>item.type==="PL").map(item=>[item.id,item]));
  root.innerHTML=["PL","PC","NPC"].map(type=>{const group=people.filter(item=>item.type===type);if(!group.length)return"";return `<section class="people-group"><h3>${type}</h3><div>${group.map(person=>`<button class="person-row" data-person-id="${escapeHtml(person.id)}">${iconMarkup(person)}<span><strong>${escapeHtml(person.name)}</strong>${person.plId&&plById.get(person.plId)?`<small>${escapeHtml(plById.get(person.plId).name)}</small>`:""}</span><i style="--person-color:${escapeHtml(person.color)}"></i></button>`).join("")}</div></section>`}).join("");
  $("#peopleEmpty").hidden=people.length>0;root.querySelectorAll("[data-person-id]").forEach(button=>button.onclick=()=>openPersonDialog(button.dataset.personId));
}
function openPersonDialog(id=""){
  const person=data.people().find(item=>item.id===id),pls=data.people().filter(item=>item.type==="PL"&&item.id!==id);
  $("#personId").value=person?.id||"";$("#personType").value=person?.type||"PC";$("#personName").value=person?.name||"";$("#personColor").value=person?.color||"#ffe66b";pendingIcon=person?.icon||"";$("#personOwner").innerHTML='<option value="">なし</option>'+pls.map(item=>`<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("");$("#personOwner").value=person?.plId||"";$("#personIconPreview").innerHTML=pendingIcon?`<img src="${escapeHtml(pendingIcon)}" alt="">`:"";$("#personDialogTitle").textContent=person?"人物を編集":"人物を追加";$("#deletePersonButton").classList.toggle("hidden",!person);syncPersonFields();$("#personDialog").showModal();
}
function syncPersonFields(){$("#personOwnerRow").hidden=$("#personType").value==="PL"}
$("#addPersonButton").onclick=()=>openPersonDialog();$("#closePersonDialog").onclick=()=>$("#personDialog").close();$("#closeSpoilerDialog").onclick=()=>$("#spoilerDialog").close();$("#personType").onchange=syncPersonFields;
$("#personIcon").onchange=async event=>{const file=event.target.files?.[0];if(!file)return;pendingIcon=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file)});$("#personIconPreview").innerHTML=`<img src="${escapeHtml(pendingIcon)}" alt="">`};
$("#personForm").onsubmit=event=>{event.preventDefault();const name=$("#personName").value.trim();if(!name)return;data.upsertPerson({id:$("#personId").value,type:$("#personType").value,name,icon:pendingIcon,color:$("#personColor").value,plId:$("#personType").value==="PL"?"":$("#personOwner").value});$("#personDialog").close();renderPeople()};
$("#deletePersonButton").onclick=()=>{const id=$("#personId").value;if(!id||!confirm("この人物を共通マスターから削除しますか？"))return;data.removePerson(id);$("#personDialog").close();renderPeople()};
renderPeople();renderSessions();
