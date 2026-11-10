const $ = s => document.querySelector(s);
const state = { roomId: null, room: null, annotations: [], annotationVersion: -1, presence: [], parsed: null, selection: null, pendingSelection: null, replyTo: null, editingCommentId: null, editingOriginalPersona: null, commentImage: "", activeTabIndex: 0, carouselPosition: 1, isSliding: false, slideQueue: 0, readingAnchor: "", syncingScrollUntil: 0, viewMode: localStorage.getItem("trpgMarkerViewMode") || "compact", hiddenTabs: new Set(), timelineSlots: [], glimpseFrame: 0, glimpseTimer: 0, suggestionTimer: null, profile: null, lastPersona: "PL", realtime: null, realtimeReconnectTimer: null, realtimeAttempts: 0, fallbackPoller: null, realtimeWanted: false, isTyping: false, typingTimer: null };
const uid = () => crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now();
const integrationParams=new URL(location.href).searchParams,integrationBoardId=integrationParams.get("board")||"",integrationEmbedded=integrationParams.get("embedded")==="1";
state.realtimeClientId=uid();
const esc = value => String(value ?? "").replace(/[&<>\"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function isImageUrl(url){return /\.(?:png|jpe?g|gif|webp|avif)(?:[?#]|$)/i.test(url)||/[?&]format=(?:png|jpe?g|gif|webp|avif)(?:&|$)/i.test(url)||/(?:i\.imgur\.com|cdn\.discordapp\.com|media\.discordapp\.net|pbs\.twimg\.com|files\.catbox\.moe|oaiusercontent\.com)/i.test(url)}
function commentBodyHtml(value){const urlPattern=/(https:\/\/[^\s<>"']+)/g;return String(value||"").replace(/\r\n?/g,"\n").replace(/\n[ \t]*\n(?:[ \t]*\n)+/g,"\n\n").split(urlPattern).map(part=>{if(!/^https:\/\//.test(part))return JijinLogFormat.render(part);const safe=esc(part),embedded=state.archiveImages?.[part];return isImageUrl(part)?`<img class="comment-image url-image" data-expand-image src="${esc(embedded||part)}" alt="引用画像" loading="lazy" referrerpolicy="no-referrer">`:`<a class="comment-link" href="${safe}" target="_blank" rel="noopener noreferrer">${safe}</a>`}).join("")}
state.archiveMode=false;state.deleteTarget=null;state.archiveImages={};
const safeFilename=value=>(String(value||"TRPGログ").replace(/[\\/:*?"<>|]/g,"_").trim()||"TRPGログ").slice(0,80);
function archiveData(room,annotations,personas=[]){return{format:"trpg-log-marker",version:2,exportedAt:new Date().toISOString(),theme:document.documentElement.classList.contains("dark")?"dark":"light",room:{title:room.title||"TRPG LOG",createdAt:room.createdAt||"",tabs:room.tabs||[],messages:room.messages||[]},annotations:(annotations||[]).map(({liked_by_me,...item})=>item),personas}}
function standaloneArchiveHtml(data){const tabs=data.room.tabs||[],messages=data.room.messages||[],annotations=data.annotations||[],byMessage=new Map();annotations.forEach(a=>{if(!a.parent_id){const list=byMessage.get(a.message_id)||[];list.push(a);byMessage.set(a.message_id,list)}});const tabButtons=tabs.map((tab,i)=>`<button data-tab="${i}">${esc(tab)}</button>`).join("");const pages=tabs.map((tab,i)=>`<section class="page" data-page="${i}"${i?' hidden':''}>${messages.filter(m=>m.tab===tab).map(m=>`<p style="color:${esc(m.color||'inherit')}"><time>${esc(m.time||'')}</time><b>${esc(m.speaker||'')}${m.speaker?'：':''}</b>${JijinLogFormat.render(m.text||'')}${(byMessage.get(m.id)||[]).map(a=>`<mark title="${esc(a.persona_name)}：${esc(a.body)}" style="--c:${esc(markerColor(a.color))}"></mark>`).join('')}</p>`).join('')}</section>`).join('');const comments=annotations.map(a=>`<article><header>${esc(a.persona_name)}［${esc(a.persona_type)}］ <small>${esc(a.created_at||'')} ${Number(a.like_count)||''}♥</small></header><div>${commentBodyHtml(a.body||'')}</div></article>`).join('');return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(data.room.title)}</title><style>:root{color-scheme:light dark}*{box-sizing:border-box}body{margin:0;font:14px/1.7 system-ui;background:#f4f6fa;color:#171a20}nav{position:sticky;top:0;padding:10px;text-align:center;background:#ffffffdd;backdrop-filter:blur(10px)}button{border:0;border-radius:999px;padding:5px 12px;margin:2px}main{display:grid;grid-template-columns:1fr 320px;gap:12px;padding:12px}.log,.comments{background:#fff;border-radius:14px;padding:14px}.page p{position:relative;margin:3px 0;white-space:pre-wrap}.page time{float:right;color:#999;font-size:10px}.page b{margin-right:4px}.page mark{display:inline-block;width:7px;height:7px;margin-left:4px;border-radius:50%;background:var(--c)}article{border-left:3px solid #9ebcff;padding:8px;margin:8px 0;background:#f7f8fb;border-radius:8px}article header{font-weight:700}article small{float:right;color:#888;font-weight:400}article img{max-width:100%;max-height:360px}@media(max-width:760px){main{grid-template-columns:1fr}.comments{order:-1}}@media(prefers-color-scheme:dark){body{background:#303030;color:#eee}.log,.comments,nav{background:#424242}article{background:#383838}}</style></head><body><nav>${tabButtons}</nav><main><div class="log">${pages}</div><aside class="comments">${comments||'<p>コメントはありません。</p>'}</aside></main><script>document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-page]').forEach(p=>p.hidden=p.dataset.page!==b.dataset.tab)})<\/script></body></html>`}
const blobDataUrl=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob)});
async function collectArchiveImages(data){const images={};const urls=[...new Set((data.annotations||[]).flatMap(a=>(String(a.body||"").match(/https:\/\/[^\s<>"']+/g)||[]).filter(isImageUrl)))];await Promise.all(urls.map(async url=>{try{const response=await fetch(url);if(response.ok&&response.headers.get("content-type")?.startsWith("image/"))images[url]=await blobDataUrl(await response.blob())}catch{}}));await Promise.all((data.annotations||[]).map(async a=>{if(a.persona_icon&&!String(a.persona_icon).startsWith("data:image/")){try{const response=await fetch(a.persona_icon);if(response.ok)a.persona_icon=await blobDataUrl(await response.blob())}catch{}}if(a.has_image){try{const response=await fetch(`/api/rooms/${encodeURIComponent(state.roomId)}/annotations/${encodeURIComponent(a.id)}/image`);if(response.ok)images[`annotation:${a.id}`]=await blobDataUrl(await response.blob())}catch{}}}));data.archiveImages=images;return data}
async function fullArchiveHtml(data){const [markup,css,script]=await Promise.all(["index.html","style.css","app.js"].map(async path=>{const response=await fetch(path);if(!response.ok)throw new Error(`保存用ファイルを取得できません（${path}）`);return response.text()}));const payload=JSON.stringify(data).replace(/</g,"\\u003c"),safeCss=css.replace(/<\/style/gi,"<\\/style"),safeScript=script.replace(/<\/script/gi,"<\\/script");return markup.replace('<link rel="stylesheet" href="style.css">',`<style>${safeCss}</style>`).replace('<script src="app.js"></script>',`<script>window.__TRPG_ARCHIVE__=${payload};<\/script><script>${safeScript}<\/script>`)}
function crc32(bytes){let crc=-1;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}return(crc^-1)>>>0}
function makeZip(files){const enc=new TextEncoder(),locals=[],centrals=[];let offset=0;for(const file of files){const name=enc.encode(file.name),data=typeof file.data==="string"?enc.encode(file.data):file.data,crc=crc32(data),local=new Uint8Array(30+name.length+data.length),lv=new DataView(local.buffer);lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0x800,true);lv.setUint32(14,crc,true);lv.setUint32(18,data.length,true);lv.setUint32(22,data.length,true);lv.setUint16(26,name.length,true);local.set(name,30);local.set(data,30+name.length);locals.push(local);const central=new Uint8Array(46+name.length),cv=new DataView(central.buffer);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x800,true);cv.setUint32(16,crc,true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);cv.setUint16(28,name.length,true);cv.setUint32(42,offset,true);central.set(name,46);centrals.push(central);offset+=local.length}const centralSize=centrals.reduce((n,a)=>n+a.length,0),end=new Uint8Array(22),ev=new DataView(end.buffer);ev.setUint32(0,0x06054b50,true);ev.setUint16(8,files.length,true);ev.setUint16(10,files.length,true);ev.setUint32(12,centralSize,true);ev.setUint32(16,offset,true);return new Blob([...locals,...centrals,end],{type:"application/zip"})}
async function downloadArchive(room,annotations,personas=[]){const data=await collectArchiveImages(archiveData(room,annotations,personas)),json=JSON.stringify(data),html=await fullArchiveHtml(data),blob=makeZip([{name:"room.trpglog",data:json},{name:"index.html",data:html}]),link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download=`${safeFilename(room.title)}.zip`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1500)}
async function readArchiveFile(file){if(file.name.toLowerCase().endsWith(".zip")){const bytes=new Uint8Array(await file.arrayBuffer()),dec=new TextDecoder();let pos=0;while(pos+30<=bytes.length&&new DataView(bytes.buffer,bytes.byteOffset+pos).getUint32(0,true)===0x04034b50){const view=new DataView(bytes.buffer,bytes.byteOffset+pos),method=view.getUint16(8,true),size=view.getUint32(18,true),nameLen=view.getUint16(26,true),extraLen=view.getUint16(28,true),name=dec.decode(bytes.slice(pos+30,pos+30+nameLen)),start=pos+30+nameLen+extraLen;if(name.endsWith(".trpglog")){if(method!==0)throw new Error("この保存ZIPは読み込めません");return JSON.parse(dec.decode(bytes.slice(start,start+size)))}pos=start+size}throw new Error("保存データがZIP内にありません")}return JSON.parse(await file.text())}

function loadProfile() {
  const saved = JSON.parse(localStorage.getItem("trpgMarkerProfile") || "null");
  state.profile = saved ? {id:saved.id,plName:saved.plName||"",plTextColor:saved.plTextColor||'',plIcon:saved.plIcon||"",plColor:saved.plColor||"#ffe66b",plColorDark:saved.plColorDark||saved.plColor||"#ffe66b",personas:[]} : { id: uid(), plName: "", personas: [] };
  if (!state.profile.id) state.profile.id = uid();
  if (!Array.isArray(state.profile.personas)) state.profile.personas = [];
  if (!state.profile.plIcon) state.profile.plIcon = "";
  if (!state.profile.plColor) state.profile.plColor = "#ffe66b";
  state.profile.personas.forEach(persona=>{if(!persona.color)persona.color="#ffe66b"});
  saveProfile();
}
function saveProfile() { localStorage.setItem("trpgMarkerProfile", JSON.stringify({id:state.profile.id,plName:state.profile.plName,plTextColor:state.profile.plTextColor||'',plIcon:state.profile.plIcon||"",plColor:state.profile.plColor||"#ffe66b",plColorDark:state.profile.plColorDark||state.profile.plColor||"#ffe66b"}));if(state.roomId)localStorage.setItem(`personas:${state.roomId}`,JSON.stringify(state.profile.personas)) }
function loadRoomPersonas(roomId){const key=`personas:${roomId}`,saved=localStorage.getItem(key);if(saved!==null)state.profile.personas=JSON.parse(saved)||[];else state.profile.personas=[];let changed=false;state.profile.personas.forEach(persona=>{if(!persona.id){persona.id=uid();changed=true}if(!persona.color)persona.color="#ffe66b"});if(changed)saveProfile();state.lastPersona=localStorage.getItem(`lastPersona:${roomId}`)||"PL"}
function emitIntegratedProfile(){if(integrationEmbedded&&parent!==window)parent.postMessage({type:"jijinboard-profile",roomId:state.roomId,profile:{id:state.profile.id,plName:state.profile.plName,plTextColor:state.profile.plTextColor||'',plIcon:state.profile.plIcon||"",personas:state.profile.personas.map(persona=>({id:persona.id||"",name:persona.name,type:persona.type,icon:persona.icon||"",textColor:persona.textColor||"",color:persona.color,colorDark:persona.colorDark}))}},location.origin)}
function selectedPersona() {
  const value = $("#personaSelect").value;
  if (value === "PL") return { name: state.profile.plName, type: "PL", icon: state.profile.plIcon || "", color: state.profile.plColor || "#ffe66b" };
  if (value === "ORIGINAL" && state.editingOriginalPersona) return state.editingOriginalPersona;
  return state.profile.personas[Number(value)] || { name: state.profile.plName, type: "PL", icon: state.profile.plIcon || "", color: state.profile.plColor || "#ffe66b" };
}
function currentPersona(){
 const persona=selectedPersona();
 const light=persona.color||"#ffe66b",dark=persona.type==="PL"?state.profile.plColorDark:persona.colorDark;
 return {...persona,color:light.includes("|")?light:`${light}|${dark||light}`};
}


function parseTekey(html, filename) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const title = doc.querySelector("title")?.textContent.trim() || filename.replace(/\.html?$/i, "");
  const tabLabels = {}, tabOrder = [];
  doc.querySelectorAll(".tab-checkbox").forEach(label => { const input = label.querySelector("input"),name=label.textContent.trim(); if (input&&name) { tabLabels[input.id] = name; tabOrder.push(name); } });
  const rows = [...doc.querySelectorAll(".chatlog > div")];
  if (!rows.length) throw new Error("Tekeyのチャットログが見つかりませんでした");
  const messages = rows.map((row, i) => {
    const speakerNode = row.querySelector(":scope > b");
    const timeNode = row.querySelector(":scope > span");
    const speaker = (speakerNode?.textContent || "").replace(/：$/, "").trim();
    const clone = row.cloneNode(true);
    clone.querySelector(":scope > b")?.remove(); clone.querySelector(":scope > span")?.remove();
    const text = JijinLogFormat.fromNode(clone).replace(/\u00a0/g, " ").trimEnd();
    const tabClass = [...row.classList].find(c => /^tab\d+$/.test(c)) || "";
    const inlineColor = row.style.color || row.getAttribute("style")?.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i)?.[1]?.trim() || "";
    return { id: `m${i}`, speaker, text, color: inlineColor, time: (timeNode?.textContent || "").replace(/[\[\]]/g, ""), tab: tabLabels[tabClass] || tabClass, diceroll: row.classList.contains("diceroll"), system: speaker === "Tekey" };
  }).filter(m => m.speaker || m.text);
  const encountered=[...new Set(messages.map(m=>m.tab).filter(Boolean))],ordered=[...new Set(tabOrder)].filter(tab=>encountered.includes(tab));
  encountered.forEach(tab=>{if(!ordered.includes(tab))ordered.push(tab)});
  return { title, tabs: ordered, messages };
}

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { "content-type": "application/json", "x-realtime-client":state.realtimeClientId, ...(options.headers || {}) }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `通信エラー (${response.status})`);
  return data;
}

async function handleFile(file) {
  $("#homeStatus").textContent = "ログを読み取っています…";
  try {
    state.parsed = parseTekey(await file.text(), file.name);
    $("#importTitle").textContent = state.parsed.title;
    $("#importCount").textContent = `${state.parsed.messages.length.toLocaleString()}件の発言 / ${state.parsed.tabs.length}タブ`;
    $("#importPreview").classList.remove("hidden"); $("#homeStatus").textContent = "";
  } catch (e) { $("#homeStatus").textContent = e.message; }
}

async function createRoom() {
  if (!state.parsed) return;
  const btn=$("#createRoomBtn"),preview=$("#importPreview"),status=$("#homeStatus");
  const boardId=integrationBoardId||new URL(location.href).searchParams.get("board")||"";
  const adminToken=localStorage.getItem(`boardAdmin:${boardId}`)||JSON.parse(localStorage.getItem("jijinboardOwnedBoards.v1")||"{}")[boardId]?.adminToken||"";
  btn.disabled=true;
  const progress=document.createElement("section");
  progress.id="logUploadProgress";
  progress.setAttribute("role","status");
  progress.className="jijin-upload-progress";
  const uploadStyle=document.createElement("style");
  uploadStyle.textContent=`
    .jijin-upload-progress{--upload-accent:var(--jijin-pre-color1,var(--theme-color,var(--accent-color,#8a92a2)));margin:10px auto;padding:12px 14px;max-width:440px;max-height:min(52vh,360px);overflow:auto;border:1px solid color-mix(in srgb,var(--upload-accent) 20%,#ddd);border-radius:9px;background:var(--surface,#fff);color:inherit;font-size:11px;line-height:1.5}
    .jijin-upload-progress .upload-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
    .jijin-upload-progress .upload-head strong{font-size:12px;font-weight:600}
    .jijin-upload-progress .upload-total{font-size:10px;opacity:.65;white-space:nowrap;font-variant-numeric:tabular-nums}
    .jijin-upload-progress progress{display:block;width:100%;height:4px;appearance:none;border:0;border-radius:4px;overflow:hidden;background:color-mix(in srgb,var(--upload-accent) 12%,transparent);margin:0 0 10px}
    .jijin-upload-progress progress::-webkit-progress-bar{background:color-mix(in srgb,var(--upload-accent) 12%,transparent)}
    .jijin-upload-progress progress::-webkit-progress-value{background:var(--upload-accent);border-radius:4px}
    .jijin-upload-progress progress::-moz-progress-bar{background:var(--upload-accent)}
    .jijin-upload-progress .upload-tab{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:9px;align-items:center;min-height:25px;border-top:1px solid color-mix(in srgb,currentColor 7%,transparent)}
    .jijin-upload-progress .upload-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .jijin-upload-progress .upload-count{font-variant-numeric:tabular-nums;opacity:.62;white-space:nowrap}
    .jijin-upload-progress .upload-state{min-width:40px;text-align:right;font-size:10px;opacity:.5;white-space:nowrap}
    .jijin-upload-progress .upload-tab[data-state="active"] .upload-state{color:var(--upload-accent);opacity:1}
    .jijin-upload-progress .upload-tab[data-state="done"] .upload-state{color:var(--upload-accent);opacity:.85}
    .jijin-upload-progress .upload-error{margin:8px 0 0;color:#b3261e;font-size:10px;overflow-wrap:anywhere}
  `;
  progress.append(uploadStyle);
  preview.after(progress);
  const grouped=new Map(state.parsed.tabs.map(tab=>[tab,[]]));
  state.parsed.messages.forEach(m=>{const tab=String(m.tab||state.parsed.tabs[0]||"メイン");if(!grouped.has(tab))grouped.set(tab,[]);grouped.get(tab).push(m)});
  const tabs=[...grouped].map(([name,messages])=>({name,messages,count:messages.length,saved:0}));
  const total=tabs.reduce((n,t)=>n+t.count,0);
  const render=(active=-1,error="")=>{
    const saved=tabs.reduce((n,t)=>n+t.saved,0);
    progress.replaceChildren(uploadStyle);
    const head=document.createElement("div");head.className="upload-head";
    const heading=document.createElement("strong");heading.textContent=error?"アップロード未完了":"ログをアップロード中";
    const overall=document.createElement("span");overall.className="upload-total";overall.textContent=`${saved.toLocaleString()} / ${total.toLocaleString()}`;
    head.append(heading,overall);progress.append(head);
    const bar=document.createElement("progress");bar.max=Math.max(total,1);bar.value=saved;progress.append(bar);
    for(let i=0;i<tabs.length;i++){
      const t=tabs[i],line=document.createElement("div");line.className="upload-tab";
      const done=t.saved===t.count,activeNow=i===active&&!done;
      line.dataset.state=done?"done":activeNow?"active":"waiting";
      const name=document.createElement("span");name.className="upload-name";name.textContent=t.name;
      const count=document.createElement("span");count.className="upload-count";count.textContent=`${t.saved.toLocaleString()} / ${t.count.toLocaleString()}`;
      const stateLabel=document.createElement("span");stateLabel.className="upload-state";stateLabel.textContent=done?"完了":activeNow?"保存中":"待機";
      line.append(name,count,stateLabel);progress.append(line);
    }
    if(error){const warning=document.createElement("p");warning.className="upload-error";warning.textContent=error;progress.append(warning)}
  };
  render();
  const uploadApi=(path,data)=>api(path,{method:"POST",headers:{"x-board-admin-token":adminToken},body:JSON.stringify({boardId,...data})});
  try{
    if(!boardId||!adminToken)throw Error("部屋の管理権限を確認できません。部屋の管理画面からアップロードしてください。");
    const started=await uploadApi("/api/log-uploads/start",{title:state.parsed.title,tabs:tabs.map(({name,count})=>({name,count})),scenarioTitle:$("#scenarioTitleInput")?.value.trim(),scenarioParticipants:$("#scenarioParticipantsInput")?.value.trim(),spoiler:!!$("#spoilerInput")?.checked});
    const chunkSize=started.chunkSize||120;
    for(let i=0;i<tabs.length;i++){
      const tab=tabs[i],chunks=Math.max(1,Math.ceil(tab.count/chunkSize));
      for(let j=0;j<chunks;j++){
        render(i);
        const messages=tab.messages.slice(j*chunkSize,(j+1)*chunkSize);
        let error;
        for(let attempt=0;attempt<3;attempt++){
          try{await uploadApi(`/api/log-uploads/chunk/${started.uploadId}`,{tabIndex:i,chunkIndex:j,messages});error=null;break}
          catch(e){error=e;if(attempt<2)await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)))}
        }
        if(error)throw error;
        tab.saved+=messages.length;render(i);
      }
    }
    const result=await uploadApi(`/api/log-uploads/finish/${started.uploadId}`,{});
    progress.replaceChildren();const done=document.createElement("h3");done.textContent="全タブの保存が完了しました！";progress.append(done);
    try{
      localStorage.setItem(`admin:${result.id}`,result.adminToken||adminToken);
      const owned=JSON.parse(localStorage.getItem("trpgMarkerOwnedRooms")||"{}");owned[result.id]={title:state.parsed.title,createdAt:new Date().toISOString()};localStorage.setItem("trpgMarkerOwnedRooms",JSON.stringify(owned));
    }catch(e){console.warn("Log ownership cache could not be saved",e)}
    if(integrationEmbedded&&integrationBoardId&&parent!==window)parent.postMessage({type:"jijinboard-room-created",roomId:result.id,adminToken:result.adminToken||adminToken,title:state.parsed.title,spoiler:!!$("#spoilerInput")?.checked,scenarioTitle:$("#scenarioTitleInput")?.value.trim()||"",scenarioParticipants:$("#scenarioParticipantsInput")?.value.trim()||""},location.origin);
    else location.href=`/log/?room=${encodeURIComponent(result.id)}`;
  }catch(e){render(-1,e.message);status.textContent="保存は完了していません。再試行しても既存ログは変更されません。";btn.disabled=false;btn.textContent="最初から再試行"; }
}
async function renderOwnedRooms(){const ids=[];for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key?.startsWith("admin:"))ids.push(key.slice(6))}const box=$("#ownedRooms"),list=$("#ownedRoomList");if(!ids.length){box.classList.add("hidden");return}const saved=JSON.parse(localStorage.getItem("trpgMarkerOwnedRooms")||"{}"),rooms=await Promise.all(ids.map(async id=>{try{const room=await api(`/api/rooms/${encodeURIComponent(id)}?summary=1`);return{id,title:room.title,createdAt:room.createdAt,available:true}}catch{return{id,title:saved[id]?.title||"読み込めない部屋",createdAt:saved[id]?.createdAt||"",available:false}}}));rooms.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));list.innerHTML=rooms.map(room=>`<div class="owned-room ${room.available?"":"unavailable"}" data-owned-room="${esc(room.id)}"><a href="/log/?room=${encodeURIComponent(room.id)}"><span><b>${esc(room.title)}</b><small>${room.createdAt?esc(formatCommentDate(room.createdAt)):""}</small></span><i>${room.available?"開く ›":"確認できません"}</i></a><button type="button" class="room-delete" data-delete-room="${esc(room.id)}" data-room-title="${esc(room.title)}" title="部屋を削除">×</button></div>`).join("");box.classList.remove("hidden")}
function rememberRecentRoom(room){const recent=JSON.parse(localStorage.getItem("trpgMarkerRecentRooms")||"[]").filter(item=>item.id!==room.id);recent.unshift({id:room.id,title:room.title,visitedAt:new Date().toISOString()});localStorage.setItem("trpgMarkerRecentRooms",JSON.stringify(recent.slice(0,20)))}
async function renderRecentRooms(){const saved=JSON.parse(localStorage.getItem("trpgMarkerRecentRooms")||"[]"),box=$("#recentRooms"),list=$("#recentRoomList");if(!saved.length){box.classList.add("hidden");return}const rooms=(await Promise.all(saved.slice(0,12).map(async item=>{try{const room=await api(`/api/rooms/${encodeURIComponent(item.id)}?summary=1`);return{...item,title:room.title,available:true}}catch{return{...item,available:false}}}))).filter(room=>room.available);if(!rooms.length){box.classList.add("hidden");return}list.innerHTML=rooms.map(room=>`<a class="recent-room" href="/log/?room=${encodeURIComponent(room.id)}"><span><b>${esc(room.title)}</b><small>${esc(formatCommentDate(room.visitedAt))}</small></span><i>開く ›</i></a>`).join("");box.classList.remove("hidden")}
async function deleteOwnedRoom(id,title){if(!confirm(`「${title}」を完全に削除しますか？\nログと感想も元に戻せなくなります。`))return;const token=localStorage.getItem(`admin:${id}`);if(!token)return alert("この部屋の管理情報がありません");const button=document.querySelector(`[data-delete-room="${CSS.escape(id)}"]`);if(button){button.disabled=true;button.textContent="…"}try{await api(`/api/rooms/${encodeURIComponent(id)}`,{method:"DELETE",headers:{"x-admin-token":token}});localStorage.removeItem(`admin:${id}`);localStorage.removeItem(`personas:${id}`);localStorage.removeItem(`mainTab:${id}`);localStorage.removeItem(`hiddenTabs:${id}`);const owned=JSON.parse(localStorage.getItem("trpgMarkerOwnedRooms")||"{}");delete owned[id];localStorage.setItem("trpgMarkerOwnedRooms",JSON.stringify(owned));document.querySelector(`[data-owned-room="${CSS.escape(id)}"]`)?.remove();if(!document.querySelector("[data-owned-room]"))$("#ownedRooms").classList.add("hidden")}catch(error){alert(error.message);if(button){button.disabled=false;button.textContent="×"}}}

// Persistent browser cache for every opened log; shared comments remain server-backed.
const logTextCache=(()=>{
  let opening;
  const generation=()=>localStorage.getItem('jijin.dataset.generation.v1');
  function db(){return opening||=(new Promise((resolve,reject)=>{
    const request=indexedDB.open("jijinboard-log-text-v1",1);
    request.onupgradeneeded=()=>request.result.createObjectStore("logs",{keyPath:"id"});
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  })).catch(()=>null)}
  async function read(id){try{const database=await db();if(!database)return null;return await new Promise(resolve=>{
    const request=database.transaction("logs").objectStore("logs").get(id);
    request.onsuccess=()=>{const entry=request.result;resolve((entry?.generation??null)===generation()?entry?.data||null:null)};
    request.onerror=()=>resolve(null);
  })}catch{return null}}
  async function write(id,data){try{const database=await db();if(!database)return;
    const tx=database.transaction("logs","readwrite");
    tx.objectStore("logs").put({id,data,generation:generation(),savedAt:Date.now()});
  }catch{}}
  return {read,write};
})();

async function openRoom(id) {
  state.roomId = id;applyTheme(localStorage.getItem(`theme:${id}`)||"light"); loadRoomPersonas(id); $("#homeView").classList.add("hidden"); $("#roomView").classList.remove("hidden"); $("#profileBtn").classList.remove("hidden");
  $("#roomStatus").textContent = "ログを読み込んでいます…";
  try {
    const comments=refreshAnnotations().catch(error=>console.warn("Comment loading failed",error));
    const localFirst=!!window.JijinDesktop&&integrationEmbedded;
    const readRoom=()=>api(`/api/rooms/${encodeURIComponent(id)}`);
    let fresh=localFirst?null:readRoom();
    // Bound the cache lookup so a blocked browser database cannot hold startup.
    const cached=await Promise.race([
      logTextCache.read(id),
      ...(fresh?[fresh.then(()=>null,()=>null)]:[]),
      new Promise(resolve=>setTimeout(()=>resolve(null),localFirst?180:80))
    ]);
    const localRoom=localFirst&&cached?.id===id&&cached.tabs?.length&&cached.messages?.length&&!cached.stream?.streamed?cached:null;
    if(!localRoom)fresh||=readRoom();
    const paintRoom=room=>{
    const previousTab=state.room?.tabs?.[state.activeTabIndex];
    state.room=room;
    rememberRecentRoom(state.room);
    state.hiddenTabs=new Set(JSON.parse(localStorage.getItem(`hiddenTabs:${id}`)||"[]").filter(tab=>state.room.tabs.includes(tab)));
    let displayTitle=state.room.scenarioTitle||state.room.title;
    try{displayTitle=parent.JIJINBOARD_LOG_TITLE?.(id)||displayTitle}catch{}
    $("#roomTitle").textContent=displayTitle;document.title=`${displayTitle} | LOGCOMMENTS`;
    const firstTab=visibleTabEntries().find(item=>item.tab==="メイン")||visibleTabEntries()[0];
    state.activeTabIndex=visibleTabEntries().find(item=>item.tab===previousTab)?.index??firstTab?.index??0;
    renderLog(); renderComments(); $("#roomStatus").textContent = "";
    };
    paintRoom(localFirst?(localRoom||await fresh):cached||await fresh);
    fresh?.then(room=>{
      logTextCache.write(id,room);
      if(!localFirst&&cached&&state.roomId===id&&JSON.stringify(cached)!==JSON.stringify(room))paintRoom(room);
    }).catch(error=>{if(state.roomId===id)$("#roomStatus").textContent=error.message});
    connectRealtime();
    if (!state.profile.plName) openProfile();
  } catch (e) { $("#roomStatus").textContent = e.message; }
}
function openArchiveData(data){if(data?.format!=="trpg-log-marker"||!data.room?.messages?.length)throw new Error("LOGCOMMENTSの保存ファイルではありません");disconnectRealtime();state.archiveMode=true;state.archiveImages=data.archiveImages||{};state.roomId="archive";state.room={...data.room,id:"archive"};state.annotations=data.annotations||[];state.presence=[];state.profile.personas=data.personas||state.profile.personas;state.hiddenTabs=new Set();state.activeTabIndex=0;state.carouselPosition=1;if(data.theme==="dark"||data.theme==="light")applyTheme(data.theme);$("#homeView").classList.add("hidden");$("#roomView").classList.remove("hidden");$("#profileBtn").classList.add("hidden");$("#shareBtn").classList.add("hidden");$("#roomTitle").textContent=state.room.title;$("#roomStatus").textContent="";renderComments();renderLog();document.title=`${state.room.title} | 保存版`}
async function openArchiveFile(file){try{openArchiveData(await readArchiveFile(file))}catch(error){$("#homeStatus").textContent=error.message}}
async function fetchArchiveForRoom(id){const room=await api(`/api/rooms/${encodeURIComponent(id)}`),data=await api(`/api/rooms/${encodeURIComponent(id)}/annotations?authorId=${encodeURIComponent(state.profile.id)}`),personas=JSON.parse(localStorage.getItem(`personas:${id}`)||"[]");return{room,annotations:data.annotations||[],personas}}
function askDeleteOwnedRoom(id,title){state.deleteTarget={id,title};$("#deleteRoomTitle").textContent=`「${title}」を削除しますか？`;$("#deleteRoomDialog").showModal()}
async function removeOwnedRoom(id){const token=localStorage.getItem(`admin:${id}`);if(!token)throw new Error("この部屋の管理情報がありません");await api(`/api/rooms/${encodeURIComponent(id)}`,{method:"DELETE",headers:{"x-admin-token":token}});for(const key of [`admin:${id}`,`personas:${id}`,`mainTab:${id}`,`hiddenTabs:${id}`,`theme:${id}`])localStorage.removeItem(key);const owned=JSON.parse(localStorage.getItem("trpgMarkerOwnedRooms")||"{}");delete owned[id];localStorage.setItem("trpgMarkerOwnedRooms",JSON.stringify(owned));document.querySelector(`[data-owned-room="${CSS.escape(id)}"]`)?.remove();if(!document.querySelector("[data-owned-room]"))$("#ownedRooms").classList.add("hidden")}
async function confirmDeleteRoom(saveFirst){const target=state.deleteTarget;if(!target)return;const saveButton=$("#saveDeleteRoomBtn"),deleteButton=$("#deleteOnlyRoomBtn");saveButton.disabled=deleteButton.disabled=true;try{if(saveFirst){const data=await fetchArchiveForRoom(target.id);await downloadArchive(data.room,data.annotations,data.personas)}await removeOwnedRoom(target.id);$("#deleteRoomDialog").close();state.deleteTarget=null}catch(error){alert(error.message)}finally{saveButton.disabled=deleteButton.disabled=false}}
function renderPresence(){$("#presenceBar").innerHTML=state.presence.map(person=>`<span class="presence-person ${person.is_typing?"typing":""}" title="${person.is_typing?"入力中":"入室中"}">${person.pl_icon?`<img src="${esc(person.pl_icon)}" alt="">`:`<i>${esc((person.pl_name||"?").slice(0,1))}</i>`}<b>${esc(person.pl_name)}</b>${person.is_typing?'<em>入力中…</em>':""}</span>`).join("");if(integrationEmbedded&&parent!==window)parent.postMessage({type:"jijinboard-presence",people:state.presence},location.origin)}
function realtimePresencePayload(type="presence"){const persona=state.isTyping?currentPersona():null;return{type,clientId:state.realtimeClientId,authorId:state.profile.id,plName:state.profile.plName,plTextColor:state.profile.plTextColor||'',plIcon:state.profile.plIcon||"",isTyping:state.isTyping,typingName:persona?.name||"",typingIcon:persona?.icon||"",typingMessageId:state.isTyping?state.pendingSelection?.messageId||"":""}}
function sendRealtime(payload){if(state.realtime?.readyState!==WebSocket.OPEN)return false;try{state.realtime.send(JSON.stringify(payload));return true}catch{return false}}
function heartbeatPresence(){return sendRealtime(realtimePresencePayload("presence"))}
function startFallbackPolling(){/* Reconnect events perform catch-up; no periodic GET. */}
function stopFallbackPolling(){clearInterval(state.fallbackPoller);state.fallbackPoller=null}
function realtimeSocketUrl(){const protocol=location.protocol==="https:"?"wss:":"ws:";return `${protocol}//${location.host}/api/rooms/${encodeURIComponent(state.roomId)}/realtime`}
function scheduleRealtimeReconnect(){if(!state.realtimeWanted||state.archiveMode||state.realtimeReconnectTimer)return;startFallbackPolling();const delay=Math.min(30000,1000*2**Math.min(state.realtimeAttempts++,5));state.realtimeReconnectTimer=setTimeout(()=>{state.realtimeReconnectTimer=null;connectRealtime()},delay)}
function connectRealtime(){if(!state.roomId||state.archiveMode)return;state.realtimeWanted=true;clearTimeout(state.realtimeReconnectTimer);state.realtimeReconnectTimer=null;if(state.realtime?.readyState===WebSocket.OPEN||state.realtime?.readyState===WebSocket.CONNECTING)return;let socket;try{socket=new WebSocket(realtimeSocketUrl())}catch{scheduleRealtimeReconnect();return}state.realtime=socket;socket.addEventListener("open",async()=>{if(state.realtime!==socket)return;state.realtimeAttempts=0;stopFallbackPolling();sendRealtime(realtimePresencePayload("join"));await pollAnnotationVersion();if($("#roomStatus").textContent.includes("リアルタイム"))$("#roomStatus").textContent=""});socket.addEventListener("message",event=>{if(state.realtime!==socket)return;let data;try{data=JSON.parse(event.data)}catch{return}if(data.type==="presence"){state.presence=Array.isArray(data.presence)?data.presence:[];renderPresence();if(state.room)renderComments()}else if(data.type==="refresh")refreshAnnotations(true);else if(data.type==="room-deleted"){state.realtimeWanted=false;alert("この部屋は削除されました");location.href="/"}});socket.addEventListener("close",()=>{if(state.realtime!==socket)return;state.realtime=null;state.presence=[];renderPresence();if(state.room)renderComments();scheduleRealtimeReconnect()});socket.addEventListener("error",()=>socket.close())}
function disconnectRealtime(){state.realtimeWanted=false;clearTimeout(state.realtimeReconnectTimer);state.realtimeReconnectTimer=null;stopFallbackPolling();const socket=state.realtime;state.realtime=null;if(socket&&socket.readyState<2)socket.close();state.presence=[]}
function setTyping(value){clearTimeout(state.typingTimer);if(state.isTyping!==value){state.isTyping=value;heartbeatPresence()}if(value)state.typingTimer=setTimeout(()=>setTyping(false),1800)}

function groupAnnotations() {
  const map = {}, indexes = new Map(state.room.messages.map((m,i)=>[m.id,i]));
  state.annotations.forEach(a => { if(a.parent_id)return;const start=indexes.get(a.message_id), end=indexes.get(a.end_message_id || a.message_id); if(start==null)return; for(let i=start;i<=(end??start);i++)(map[state.room.messages[i].id] ||= []).push(a); });
  return map;
}
function annotationMarkerColor(annotation){
  const current=state.annotations.find(item=>item.id===annotation.id)||annotation;
  if(current.author_id===state.profile?.id){
    try{
      const board=new URL(location.href).searchParams.get("board")||"";
      const choices=JSON.parse(localStorage.getItem(`jijinboardSelectedColors:${board}:${state.profile.id}`)||"{}");
      const persona=state.profile.personas.find(p=>p.name===current.persona_name&&p.type===current.persona_type);
      const pair=current.persona_type==="PL"?choices.PL:choices[persona?.id]||choices[`name:${current.persona_type}:${current.persona_name}`];
      if(pair)return markerColor(`${pair.light}|${pair.dark}`);
    }catch{}
  }
  return markerColor(current.color);
}
function markedText(message, anns) {
  if (!anns?.length) return JijinLogFormat.render(message.text,[],{compactBlankLines:!!message.diceroll||!!window.JijinDesktop});
  const indexes = new Map(state.room.messages.map((m,i)=>[m.id,i])), messageIndex=indexes.get(message.id);
  const ranges = [...anns].sort((a,b)=>String(a.created_at||"").localeCompare(String(b.created_at||""))).map(a => {
    const startIndex=indexes.get(a.message_id),endIndex=indexes.get(a.end_message_id||a.message_id)??startIndex;
    if(messageIndex<startIndex||messageIndex>endIndex)return null;
    return {start:messageIndex===startIndex?Math.max(0,a.start_offset):0,end:messageIndex===endIndex?Math.min(message.text.length,a.end_offset):message.text.length,id:a.id,color:annotationMarkerColor(a)};
  }).filter(r=>r&&r.end>r.start);
  const edges=[...new Set([0,message.text.length,...ranges.flatMap(r=>[r.start,r.end])])].sort((a,b)=>a-b);
      const segments=[];
      for(let i=0;i<edges.length-1;i++){
        const start=edges[i],end=edges[i+1],covering=ranges.filter(r=>r.start<=start&&r.end>=end);
        const winner=covering.find(r=>r.id===state.activeMarkerId)||covering[0];
        const previous=segments[segments.length-1];
        if(previous&&previous.winner?.id===winner?.id&&previous.end===start)previous.end=end;
        else segments.push({start,end,winner});
      }
      return JijinLogFormat.render(message.text,segments,{compactBlankLines:!!message.diceroll||!!window.JijinDesktop});
}
function markerColor(value){const pair=String(value||"").split("|");value=pair[document.documentElement.classList.contains("dark")&&pair.length>1?1:0];return /^(#[0-9a-f]{3,8}|rgba?\([\d\s,.%]+\)|[a-z]+)$/i.test(value||"")?value:"#ffe66b"}
function messageHtml(m, grouped) {
  const anns = grouped[m.id] || [];
  const color = /^(#[0-9a-f]{3,8}|rgba?\([\d\s,.%]+\)|[a-z]+)$/i.test(m.color || "") ? m.color : "";
  return `<div class="log-message ${m.system ? "system-message" : ""} ${m.diceroll ? "diceroll" : ""}" data-message="${m.id}"${color ? ` style="color:${esc(color)}"` : ""}><span class="speaker">${esc(m.speaker || "")}${m.speaker ? "：" : ""}</span><span class="message-text" data-source-length="${m.text.length}">${markedText(m, anns)}</span>${anns.length ? `<button class="annotation-count" data-message-comments="${m.id}">${anns.length}</button>` : ""}</div>`;
}
function timelineGroups(messages) {
  const groups = [];
  messages.forEach((message, index) => {
    const key = message.time || `untimed-${index}`;
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) { group = { key, time: message.time, tabs: [], tabMap: new Map() }; groups.push(group); }
    const tabName = message.tab || "LOG";
    let panel = group.tabMap.get(tabName);
    if (!panel) { panel = { name: tabName, messages: [] }; group.tabMap.set(tabName, panel); group.tabs.push(panel); }
    panel.messages.push(message);
  });
  return groups;
}
function activeTabName() {
  return state.room?.tabs?.[state.activeTabIndex] || state.room?.tabs?.[0] || "";
}
function visibleTabEntries(){const entries=(state.room?.tabs||[]).map((tab,index)=>({tab,index})).filter(item=>!state.hiddenTabs.has(item.tab));return entries.length?entries:(state.room?.tabs||[]).slice(0,1).map((tab,index)=>({tab,index}))}
function pagePanelHtml(tab, realIndex, trackIndex, grouped, search, clone = "") {
  const messages = state.room.messages.filter(m => m.tab === tab && (!search || `${m.speaker} ${m.text}`.toLowerCase().includes(search)));
  const rows = messages.map(m => `<div class="page-row" data-time="${esc(m.time)}"><time>${esc(m.time)}</time>${messageHtml(m, grouped)}</div>`).join("");
  return `<section class="log-page" data-real-index="${realIndex}" data-track-index="${trackIndex}" data-clone="${clone}"><div class="page-scroll">${rows || '<div class="log-empty-spinner" role="status" aria-label="読み込み中"><span></span></div>'}</div></section>`;
}
function lazyPagePanelHtml(tab,realIndex,trackIndex,clone=""){return `<section class="log-page lazy-page" data-tab="${esc(tab)}" data-real-index="${realIndex}" data-track-index="${trackIndex}" data-clone="${clone}"></section>`}
function shouldHydratePosition(position,current,count){return position===current||position===current-1||position===current+1||(current===1&&position===0)||(current===count&&position===count+1)}
function hydratePanel(position){const panel=document.querySelector(`.log-page[data-track-index="${position}"]`);if(!panel||!panel.classList.contains("lazy-page")||!state.panelRender)return panel;const {mode,grouped,search,slots}=state.panelRender,tab=panel.dataset.tab,realIndex=Number(panel.dataset.realIndex),clone=panel.dataset.clone||"",html=mode==="timeline"?timelinePagePanelHtml(tab,realIndex,position,slots,grouped,search,clone):pagePanelHtml(tab,realIndex,position,grouped,search,clone),template=document.createElement("template");template.innerHTML=html;const fresh=template.content.firstElementChild;panel.replaceWith(fresh);fresh.querySelector(".page-scroll")?.addEventListener("scroll",scheduleVisibleGlimpses,{passive:true});return fresh}
function hydrateNearbyPanels(){const count=visibleTabEntries().length;[state.carouselPosition-1,state.carouselPosition,state.carouselPosition+1,state.carouselPosition===1?0:-1,state.carouselPosition===count?count+1:-1].filter(position=>position>=0&&position<=count+1).forEach(hydratePanel)}
function setTrackPosition(position, animate = false) {
  const track = $("#pageTrack"); if (!track) return;
  track.style.transition = animate ? "transform .52s cubic-bezier(.22,.8,.2,1)" : "none";
  track.style.transform = `translateX(${-position * 100}%)`;
}
function updateCarouselNav() {
  const tab = activeTabName();
  if($("#carouselIndex"))$("#carouselIndex").textContent = `${state.activeTabIndex + 1} / ${state.room.tabs.length}`;
  if($("#carouselTitle"))$("#carouselTitle").textContent = tab;
  document.querySelectorAll("[data-tab-index]").forEach(button=>button.classList.toggle("active",Number(button.dataset.tabIndex)===state.activeTabIndex));
  document.querySelector(".tab-rail [data-tab-index].active")?.scrollIntoView({behavior:"smooth",block:"nearest",inline:"center"});
}
function minuteValue(time){const match=String(time||"").match(/(\d{1,2}):(\d{2})/);return match?Number(match[1])*60+Number(match[2]):null}
function hideTabSuggestions(){clearTimeout(state.suggestionTimer);$("#tabSuggestions").classList.add("hidden");$("#tabSuggestions").innerHTML=""}
function visibleSuggestionTimes(){const panel=document.querySelector(`.log-page[data-track-index="${state.carouselPosition}"]`),scroll=panel?.querySelector(".page-scroll");if(!scroll)return[];const bounds=scroll.getBoundingClientRect();return [...panel.querySelectorAll(".page-row[data-time]")].filter(row=>{const rect=row.getBoundingClientRect();return rect.bottom>=bounds.top&&rect.top<=bounds.bottom&&(state.viewMode!=="timeline"||row.classList.contains("empty-slot"))}).map(row=>row.dataset.time).filter(Boolean)}
function glimpseHtml(slot,tab){const entries=visibleTabEntries(),currentPosition=entries.findIndex(item=>item.tab===tab),search="";return [...slot.byTab.entries()].filter(([otherTab])=>otherTab!==tab&&!state.hiddenTabs.has(otherTab)).flatMap(([otherTab,messages])=>{const targetPosition=entries.findIndex(item=>item.tab===otherTab),direction=targetPosition<currentPosition?"left":"right";return messages.filter(m=>!search||`${m.speaker} ${m.text}`.toLowerCase().includes(search)).slice(0,2).map(m=>{const full=`${m.speaker||""}${m.speaker?"：":""}${m.text}`.replace(/\s+/g," ").trim(),preview=full.slice(0,20)+(full.length>20?"…":"");return `<div class="foreign-glimpse dir-${direction} reveal" data-full-message="${esc(`${otherTab}\\n${m.speaker||""}${m.speaker?"：":""}${m.text||""}`)}" tabindex="0">${direction==="left"?'<i class="glimpse-arrow">‹</i>':""}<b>${esc(otherTab)}</b><span>${esc(preview)}</span>${direction==="right"?'<i class="glimpse-arrow">›</i>':""}</div>`})}).slice(0,3).join("")}
function installGlimpseTooltip(){
 if(document.getElementById("jijinGlimpseTooltip"))return;
 const tooltip=document.createElement("div");tooltip.id="jijinGlimpseTooltip";tooltip.setAttribute("role","tooltip");
 tooltip.style.cssText="position:fixed;z-index:2147483000;display:none;max-width:min(420px,calc(100vw - 24px));max-height:min(65vh,480px);overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;pointer-events:none;padding:10px 12px;border:1px solid rgba(120,120,120,.22);border-radius:8px;background:var(--surface,#fff);color:var(--text-color,#222);box-shadow:0 5px 22px rgba(0,0,0,.12);font:11px/1.6 system-ui,sans-serif";
 document.body.append(tooltip);
 const place=event=>{if(tooltip.style.display==="none")return;const width=tooltip.offsetWidth,height=tooltip.offsetHeight;tooltip.style.left=Math.max(8,Math.min(event.clientX+12,innerWidth-width-8))+"px";tooltip.style.top=Math.max(8,Math.min(event.clientY+14,innerHeight-height-8))+"px"};
 document.addEventListener("pointerover",event=>{if(event.pointerType==="touch")return;const item=event.target.closest?.(".foreign-glimpse[data-full-message]");if(!item)return;tooltip.textContent=item.dataset.fullMessage.split(String.raw`\\n`).join(String.fromCharCode(10));tooltip.style.display="block";place(event)});
 document.addEventListener("pointermove",event=>{if(event.target.closest?.(".foreign-glimpse[data-full-message]"))place(event);else tooltip.style.display="none"});
 document.addEventListener("pointerout",event=>{if(event.target.closest?.(".foreign-glimpse[data-full-message]")&&!event.relatedTarget?.closest?.(".foreign-glimpse[data-full-message]"))tooltip.style.display="none"});
 document.addEventListener("focusin",event=>{const item=event.target.closest?.(".foreign-glimpse[data-full-message]");if(!item)return;tooltip.textContent=item.dataset.fullMessage.split(String.raw`\\n`).join(String.fromCharCode(10));tooltip.style.display="block";const rect=item.getBoundingClientRect();place({clientX:rect.left,clientY:rect.bottom})});
 document.addEventListener("focusout",()=>tooltip.style.display="none");
}
installGlimpseTooltip();
function renderVisibleGlimpses(){cancelAnimationFrame(state.glimpseFrame);state.glimpseFrame=requestAnimationFrame(()=>{if(state.viewMode!=="timeline")return;const panel=document.querySelector(`.log-page[data-track-index="${state.carouselPosition}"]`),scroll=panel?.querySelector(".page-scroll");if(!scroll)return;panel.querySelectorAll(".foreign-glimpses").forEach(el=>el.remove());const bounds=scroll.getBoundingClientRect(),x=Math.min(bounds.right-24,bounds.left+bounds.width*.72),rows=new Set();for(let y=bounds.top+8;y<bounds.bottom;y+=48){const row=document.elementFromPoint(x,y)?.closest?.(".timeline-slot.empty-slot[data-slot-index]");if(row&&panel.contains(row))rows.add(row)}const tab=activeTabName();rows.forEach(row=>{const slot=state.timelineSlots[Number(row.dataset.slotIndex)],html=slot&&glimpseHtml(slot,tab);if(html)row.querySelector(".timeline-slot-content")?.insertAdjacentHTML("beforeend",`<div class="foreign-glimpses">${html}</div>`)})})}
function scheduleVisibleGlimpses(){clearTimeout(state.glimpseTimer);state.glimpseTimer=setTimeout(()=>{if(Date.now()>=state.syncingScrollUntil)state.readingAnchor=currentReadingTime();renderVisibleGlimpses()},110)}
function revealInlineSuggestions(){hideTabSuggestions();renderVisibleGlimpses()}
function showMainSuggestions(){revealInlineSuggestions()}
function tabRailHtml(){return `<div class="tab-navigation"><button class="tab-arrow prev" data-page="prev" aria-label="前のタブ">‹</button><nav class="tab-rail" aria-label="タブ一覧" title="タブ名をダブルクリックで表示／非表示">${state.room.tabs.map((tab,index)=>state.hiddenTabs.has(tab)&&state.viewMode==="timeline"&&!window.JijinDesktop?"":`<button type="button" data-tab-index="${index}" class="${index===state.activeTabIndex?"active":""} ${state.hiddenTabs.has(tab)?"tab-hidden":""}" title="ダブルクリックで${state.hiddenTabs.has(tab)?"表示":"非表示"}">${esc(tab)}</button>`).join("")}</nav><button class="tab-arrow next" data-page="next" aria-label="次のタブ">›</button></div>`}
function syncPanelToTime(panel, time) {
  if (!panel || !time) return;
  const slotMatch=String(time).match(/^@slot:(\d+)\|(.*)$/),fallbackTime=slotMatch?decodeURIComponent(slotMatch[2]||""):time,row=(slotMatch&&panel.querySelector(`.page-row[data-slot-index="${slotMatch[1]}"]`))||[...panel.querySelectorAll(".page-row[data-time]")].find(el => el.dataset.time === fallbackTime);
  const scroll = panel.querySelector(".page-scroll");
  if (row && scroll) scroll.scrollTop = Math.max(0, row.offsetTop - scroll.clientHeight * .28);
}
function renderLog(anchorTime = "") {
  if (!state.room) return;
  if (state.viewMode === "timeline") { renderTimelineLog(anchorTime); return; }
  const entries=visibleTabEntries(),tabs=entries.map(item=>item.tab), search = "", grouped = groupAnnotations();
  if (!entries.length) return;
  let visibleIndex=entries.findIndex(item=>item.index===state.activeTabIndex);if(visibleIndex<0){visibleIndex=0;state.activeTabIndex=entries[0].index}
  state.carouselPosition = visibleIndex + 1;
  state.panelRender={mode:"compact",grouped,search,slots:null};
  const panels = [];
  panels.push(shouldHydratePosition(0,state.carouselPosition,entries.length)?pagePanelHtml(entries.at(-1).tab,entries.at(-1).index,0,grouped,search,"last"):lazyPagePanelHtml(entries.at(-1).tab,entries.at(-1).index,0,"last"));
  entries.forEach((item,position)=>{const trackIndex=position+1;panels.push(shouldHydratePosition(trackIndex,state.carouselPosition,entries.length)?pagePanelHtml(item.tab,item.index,trackIndex,grouped,search):lazyPagePanelHtml(item.tab,item.index,trackIndex))});
  panels.push(shouldHydratePosition(entries.length+1,state.carouselPosition,entries.length)?pagePanelHtml(entries[0].tab,entries[0].index,entries.length+1,grouped,search,"first"):lazyPagePanelHtml(entries[0].tab,entries[0].index,entries.length+1,"first"));
  state.isSliding = false; state.slideQueue = 0;
  $("#logPane").innerHTML = `${tabRailHtml()}<div class="carousel-viewport"><div class="page-track" id="pageTrack">${panels.join("")}</div></div>`;
  setTrackPosition(state.carouselPosition, false); updateCarouselNav();
  if (anchorTime) syncPanelToTime(document.querySelector(`.log-page[data-track-index="${state.carouselPosition}"]`), anchorTime);
  $("#pageTrack").addEventListener("transitionend", event => {
    if (event.target !== $("#pageTrack") || event.propertyName !== "transform") return;
    const n = visibleTabEntries().length;
    if (state.carouselPosition === 0) state.carouselPosition = n;
    else if (state.carouselPosition === n + 1) state.carouselPosition = 1;
    setTrackPosition(state.carouselPosition, false);
    state.isSliding = false;
    hydrateNearbyPanels();
    if (state.slideQueue) { const queued = state.slideQueue; state.slideQueue = 0; requestAnimationFrame(() => switchLogPage(queued)); }
  });
  const viewport=$(".carousel-viewport"); let touchStart=null;
  viewport.addEventListener("touchstart",e=>{const t=e.touches[0];touchStart={x:t.clientX,y:t.clientY}},{passive:true});
  viewport.addEventListener("touchend",e=>{if(!touchStart)return;const t=e.changedTouches[0],dx=t.clientX-touchStart.x,dy=t.clientY-touchStart.y;touchStart=null;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.2)switchLogPage(dx<0?1:-1)},{passive:true});
  document.querySelectorAll(".page-scroll").forEach(page=>page.addEventListener("scroll",scheduleVisibleGlimpses,{passive:true}));
}
function sharedTimelineSlots(messages){const slots=[];messages.filter(message=>!state.hiddenTabs.has(message.tab)).forEach((message,index)=>{const key=message.time||`untimed-${index}`;let slot=slots[slots.length-1];if(!slot||slot.key!==key){slot={key,time:message.time,byTab:new Map()};slots.push(slot)}const list=slot.byTab.get(message.tab)||[];list.push(message);slot.byTab.set(message.tab,list)});slots.forEach(slot=>{const previewCount=Math.min(3,[...slot.byTab.values()].reduce((sum,list)=>sum+list.length,0));slot.height=Math.min(110,Math.max(30,previewCount?previewCount*29+8:0))});return slots}
function timelinePagePanelHtml(tab,realIndex,trackIndex,slots,grouped,search,clone=""){const rows=slots.map((slot,slotIndex)=>{const list=(slot.byTab.get(tab)||[]).filter(m=>!search||`${m.speaker} ${m.text}`.toLowerCase().includes(search)),previewCount=list.length?0:Math.min(3,[...slot.byTab.entries()].filter(([otherTab])=>otherTab!==tab&&!state.hiddenTabs.has(otherTab)).reduce((sum,[,messages])=>sum+messages.filter(m=>!search||`${m.speaker} ${m.text}`.toLowerCase().includes(search)).length,0)),minHeight=list.length?24:previewCount?previewCount*24+6:20;return `<div class="page-row timeline-slot ${list.length?"has-message":"empty-slot"}" data-slot-index="${slotIndex}" data-time="${esc(slot.time)}" style="min-height:${minHeight}px"><time>${esc(slot.time)}</time><div class="timeline-slot-content">${list.map(m=>messageHtml(m,grouped)).join("")}</div></div>`}).join("");return `<section class="log-page" data-real-index="${realIndex}" data-track-index="${trackIndex}" data-clone="${clone}"><div class="page-scroll timeline-page">${rows}</div></section>`}
function renderTimelineLog(anchorTime="") {
  const entries=visibleTabEntries(),search="",grouped=groupAnnotations(),slots=sharedTimelineSlots(state.room.messages);state.timelineSlots=slots;if(!entries.length)return;let visibleIndex=entries.findIndex(item=>item.index===state.activeTabIndex);if(visibleIndex<0){visibleIndex=0;state.activeTabIndex=entries[0].index}
  state.carouselPosition=visibleIndex+1;state.isSliding=false;state.slideQueue=0;
  state.panelRender={mode:"timeline",grouped,search,slots};
  const panels=[shouldHydratePosition(0,state.carouselPosition,entries.length)?timelinePagePanelHtml(entries.at(-1).tab,entries.at(-1).index,0,slots,grouped,search,"last"):lazyPagePanelHtml(entries.at(-1).tab,entries.at(-1).index,0,"last")];entries.forEach((item,position)=>{const trackIndex=position+1;panels.push(shouldHydratePosition(trackIndex,state.carouselPosition,entries.length)?timelinePagePanelHtml(item.tab,item.index,trackIndex,slots,grouped,search):lazyPagePanelHtml(item.tab,item.index,trackIndex))});panels.push(shouldHydratePosition(entries.length+1,state.carouselPosition,entries.length)?timelinePagePanelHtml(entries[0].tab,entries[0].index,entries.length+1,slots,grouped,search,"first"):lazyPagePanelHtml(entries[0].tab,entries[0].index,entries.length+1,"first"));
  $("#logPane").innerHTML=`${tabRailHtml()}<div class="carousel-viewport"><div class="page-track" id="pageTrack">${panels.join("")}</div></div>`;
  setTrackPosition(state.carouselPosition,false);updateCarouselNav();if(anchorTime)syncPanelToTime(document.querySelector(`.log-page[data-track-index="${state.carouselPosition}"]`),anchorTime);
  $("#pageTrack").addEventListener("transitionend",event=>{if(event.target!==$("#pageTrack")||event.propertyName!=="transform")return;const n=visibleTabEntries().length;if(state.carouselPosition===0)state.carouselPosition=n;else if(state.carouselPosition===n+1)state.carouselPosition=1;setTrackPosition(state.carouselPosition,false);state.isSliding=false;hydrateNearbyPanels();if(state.slideQueue){const queued=state.slideQueue;state.slideQueue=0;requestAnimationFrame(()=>switchLogPage(queued))}});
  const viewport=$(".carousel-viewport");let touchStart=null;viewport.addEventListener("touchstart",e=>{const t=e.touches[0];touchStart={x:t.clientX,y:t.clientY}},{passive:true});viewport.addEventListener("touchend",e=>{if(!touchStart)return;const t=e.changedTouches[0],dx=t.clientX-touchStart.x,dy=t.clientY-touchStart.y;touchStart=null;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.2)switchLogPage(dx<0?1:-1)},{passive:true});document.querySelectorAll(".timeline-page").forEach(page=>page.addEventListener("scroll",scheduleVisibleGlimpses,{passive:true}));setTimeout(renderVisibleGlimpses,20);
}
function currentReadingTime() {
  const panel = document.querySelector(`.log-page[data-track-index="${state.carouselPosition}"]`);
  const scroll = panel?.querySelector(".page-scroll"); if (!scroll) return "";
  const rows = [...panel.querySelectorAll(".page-row[data-time]")];
  const targetY = scroll.getBoundingClientRect().top + scroll.clientHeight * .28;
  let best = null, distance = Infinity;
  rows.forEach(row => { const d = Math.abs(row.getBoundingClientRect().top - targetY); if (d < distance) { distance = d; best = row; } });
  return state.viewMode==="timeline"&&best?.dataset.slotIndex!=null?`@slot:${best.dataset.slotIndex}|${encodeURIComponent(best.dataset.time||"")}`:best?.dataset.time||"";
}
function switchLogPage(direction) {
  const entries=visibleTabEntries();if (!entries.length) return;
  if (state.isSliding) { state.slideQueue = direction < 0 ? -1 : 1; return; }
  state.isSliding = true;
  const time = state.readingAnchor||currentReadingTime(), n = entries.length;state.readingAnchor=time;state.syncingScrollUntil=Date.now()+650;let visibleIndex=entries.findIndex(item=>item.index===state.activeTabIndex);if(visibleIndex<0)visibleIndex=0;
  state.carouselPosition += direction;
  visibleIndex=(visibleIndex+direction+n)%n;state.activeTabIndex=entries[visibleIndex].index;
  const target = hydratePanel(state.carouselPosition);
  syncPanelToTime(target, time);
  if(state.carouselPosition===0)syncPanelToTime(document.querySelector(`.log-page[data-track-index="${n}"]`),time);
  if(state.carouselPosition===n+1)syncPanelToTime(document.querySelector(`.log-page[data-track-index="1"]`),time);
  updateCarouselNav(); setTrackPosition(state.carouselPosition, true);setTimeout(revealInlineSuggestions,80);setTimeout(renderVisibleGlimpses,560);
}
function goToTab(index){const tab=state.room?.tabs?.[index],entries=visibleTabEntries();if(!tab||state.hiddenTabs.has(tab)||index===state.activeTabIndex)return;const position=entries.findIndex(item=>item.index===index);if(position<0)return;const time=state.readingAnchor||currentReadingTime();state.readingAnchor=time;state.syncingScrollUntil=Date.now()+650;state.isSliding=true;state.slideQueue=0;state.activeTabIndex=index;state.carouselPosition=position+1;syncPanelToTime(hydratePanel(state.carouselPosition),time);hydrateNearbyPanels();updateCarouselNav();setTrackPosition(state.carouselPosition,true);setTimeout(revealInlineSuggestions,80);setTimeout(renderVisibleGlimpses,560)}
function toggleTabVisibility(index){const tab=state.room?.tabs?.[index];if(!tab)return;if(state.hiddenTabs.has(tab)){state.hiddenTabs.delete(tab)}else{if(visibleTabEntries().length<=1)return;state.hiddenTabs.add(tab)}localStorage.setItem(`hiddenTabs:${state.roomId}`,JSON.stringify([...state.hiddenTabs]));if(state.hiddenTabs.has(activeTabName()))state.activeTabIndex=visibleTabEntries()[0].index;renderLog(currentReadingTime())}
function renderComments() {
  const commentsScroll=$("#commentsList").scrollTop;
  $("#commentCount").textContent = state.annotations.length;
  const order=new Map(state.room.messages.map((message,index)=>[message.id,index])),messageTabs=new Map(state.room.messages.map(message=>[message.id,message.tab])),annotationIds=new Set(state.annotations.map(annotation=>annotation.id));
  const annotations=[...state.annotations].sort((a,b)=>(order.get(a.message_id)??Infinity)-(order.get(b.message_id)??Infinity)||a.start_offset-b.start_offset||String(a.created_at).localeCompare(String(b.created_at)));
  const children=new Map();annotations.forEach(annotation=>{if(annotation.parent_id){const list=children.get(annotation.parent_id)||[];list.push(annotation);children.set(annotation.parent_id,list)}});
  const cardHtml=(a,depth=0)=>{const tab=messageTabs.get(a.message_id)||"",replies=children.get(a.id)||[],interactive=!state.archiveMode,mine=interactive&&a.author_id===state.profile.id,archivedImage=state.archiveImages?.[`annotation:${a.id}`];return `<div class="comment-thread ${depth?"is-reply":""}" style="--reply-depth:${Math.min(depth,3)}"><div class="comment-card" style="--comment-marker:${esc(markerColor(a.color))}" id="comment-${a.id}" data-target="${a.message_id}"><div class="comment-author">${a.persona_icon ? `<img class="comment-avatar" src="${esc(a.persona_icon)}" alt="" loading="lazy">` : '<span class="comment-avatar empty-avatar"></span>'}<span class="comment-name">${esc(a.persona_name)}<span class="persona-type">${esc(a.persona_type)}</span></span>${mine?`<button class="comment-edit" type="button" data-edit-comment="${esc(a.id)}" title="編集">✎</button>`:""}<time class="comment-date">${tab?`${esc(tab)} `:""}${esc(formatCommentDate(a.created_at))}</time>${interactive?`<button class="comment-like ${a.liked_by_me?"liked":""}" type="button" data-like-comment="${esc(a.id)}" aria-label="好き">${a.liked_by_me?"♥":"♡"}${Number(a.like_count)||""}</button><button class="comment-reply" type="button" data-reply-comment="${esc(a.id)}" title="返信">↩</button>`:""}</div>${a.body?`<p class="comment-body">${commentBodyHtml(a.body)}</p>`:""}${archivedImage?`<img class="comment-image" data-expand-image src="${esc(archivedImage)}" alt="添付画像" loading="lazy">`:a.has_image&&!state.archiveMode?`<img class="comment-image" data-expand-image src="/api/rooms/${encodeURIComponent(state.roomId)}/annotations/${encodeURIComponent(a.id)}/image?v=${encodeURIComponent(a.image_version||a.updated_at||'')}" alt="添付画像" loading="lazy">`:""}</div>${replies.map(reply=>cardHtml(reply,depth+1)).join("")}</div>`};
  const roots=annotations.filter(annotation=>!annotation.parent_id||!annotationIds.has(annotation.parent_id));const typing=state.presence.filter(person=>person.is_typing&&person.typing_message_id).map(person=>({typing:true,message_id:person.typing_message_id,person}));const items=[...roots.map(annotation=>({annotation,message_id:annotation.message_id})),...typing].sort((a,b)=>(order.get(a.message_id)??Infinity)-(order.get(b.message_id)??Infinity));const typingHtml=item=>`<button type="button" class="typing-comment" data-typing-target="${esc(item.message_id)}" title="入力中のログへ移動"><span class="comment-avatar">${item.person.typing_icon?`<img src="${esc(item.person.typing_icon)}" alt="">`:esc((item.person.typing_name||item.person.pl_name||"?").slice(0,1))}</span><b>${esc(item.person.typing_name||item.person.pl_name)}</b><em>入力中…</em><i></i><i></i><i></i></button>`;$("#commentsList").innerHTML=items.length?items.map(item=>item.typing?typingHtml(item):cardHtml(item.annotation)).join(""):'<p class="empty">マーカーされた感想がここに並びます。</p>';$("#commentsList").scrollTop=commentsScroll;
}
async function deleteComment(id,confirmed=false){if(!confirmed&&!confirm("このコメントを削除しますか？\n返信もまとめて削除されます。"))return;try{await api(`/api/rooms/${encodeURIComponent(state.roomId)}/annotations/${encodeURIComponent(id)}`,{method:"DELETE",body:JSON.stringify({authorId:state.profile.id}),headers:{"x-admin-token":localStorage.getItem(`admin:${state.roomId}`)||""}});const removed=new Set([id]);
let expanded=true;while(expanded){expanded=false;for(const a of state.annotations){if(removed.has(a.parent_id)&&!removed.has(a.id)){removed.add(a.id);expanded=true}}}
state.annotations=state.annotations.filter(a=>!removed.has(a.id));
const position=currentReadingTime();renderComments();renderLog(position);
await refreshAnnotations(true)}catch(error){alert(error.message)}}
async function toggleLike(id,button){const annotation=state.annotations.find(item=>item.id===id);if(!annotation)return;const before=!!annotation.liked_by_me,count=Number(annotation.like_count)||0;annotation.liked_by_me=!before;annotation.like_count=Math.max(0,count+(before?-1:1));button?.classList.toggle("liked",!before);if(button){button.textContent=`${before?"♡":"♥"}${annotation.like_count||""}`;button.classList.remove("heart-pop");void button.offsetWidth;button.classList.add("heart-pop")}try{const result=await api(`/api/rooms/${encodeURIComponent(state.roomId)}/annotations/${encodeURIComponent(id)}/like`,{method:"POST",body:JSON.stringify({authorId:state.profile.id})});annotation.liked_by_me=!!result.liked}catch(error){annotation.liked_by_me=before;annotation.like_count=count;if(button){button.classList.toggle("liked",before);button.textContent=`${before?"♥":"♡"}${count||""}`}alert(error.message)}}
function formatCommentDate(value){if(!value)return "";const normalized=/Z|[+-]\d\d:?\d\d$/.test(value)?value:value.replace(" ","T")+"Z";const date=new Date(normalized);return Number.isNaN(date.getTime())?String(value):new Intl.DateTimeFormat("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}).format(date)}
async function refreshAnnotations(forceFresh=false) {
  if (!state.roomId) return;
  try {
    const data = await api(`/api/rooms/${encodeURIComponent(state.roomId)}/annotations?authorId=${encodeURIComponent(state.profile.id)}`,forceFresh?{cache:"reload"}:{});
    // In-flight refreshes must not repaint locally selected colors with old data.
    try{
      const board=new URL(location.href).searchParams.get("board")||"";
      const colors=JSON.parse(localStorage.getItem(`jijinboardSelectedColors:${board}:${state.profile.id}`)||"{}");
      for(const a of data.annotations||[]){
        if(a.author_id!==state.profile.id)continue;
        const persona=state.profile.personas.find(p=>p.name===a.persona_name&&p.type===a.persona_type);
        const pair=a.persona_type==="PL"?colors.PL:colors[persona?.id]||colors[`name:${a.persona_type}:${a.persona_name}`];
        if(pair)a.color=`${pair.light}|${pair.dark}`;
      }
    }catch{}
    const changed = Number(data.version)!==state.annotationVersion;
    const markerFields=list=>list.map(a=>[a.id,a.message_id,a.end_message_id,a.start_offset,a.end_offset,a.color]);
    const markersChanged=JSON.stringify(markerFields(data.annotations))!==JSON.stringify(markerFields(state.annotations));
    state.annotations = data.annotations;state.annotationVersion=Number(data.version)||0;
    if (changed||markersChanged) { const time=currentReadingTime(); renderComments(); if(markersChanged)renderLog(time); }
  } catch (e) { $("#roomStatus").textContent = e.message; }
}
async function pollAnnotationVersion(){if(!state.roomId||state.archiveMode||document.hidden)return;try{const data=await api(`/api/rooms/${encodeURIComponent(state.roomId)}/annotations/version`);if(Number(data.version)!==state.annotationVersion)await refreshAnnotations()}catch(e){$("#roomStatus").textContent=e.message}}

function selectionInfo() {
  const selection = getSelection(); if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
  const range=selection.getRangeAt(0), parent=node=>node.nodeType===1?node:node.parentElement, startMessage=parent(range.startContainer)?.closest?.(".log-message"), endMessage=parent(range.endContainer)?.closest?.(".log-message");
  if(!startMessage||!endMessage||!$("#logPane").contains(startMessage)||!$("#logPane").contains(endMessage))return null;
  const startText=startMessage.querySelector(".message-text"),endText=endMessage.querySelector(".message-text");if(!startText||!endText)return null;
  const textOffset=(textEl,node,offset,edge)=>{if(textEl.contains(node)){return JijinLogFormat.sourceOffset(textEl,node,offset,edge)}if(parent(node)?.closest?.(".speaker"))return 0;return edge==="start"?0:Number(textEl.dataset.sourceLength)||0};
  const rects=[...range.getClientRects()].filter(r=>r.width||r.height),focusAtEnd=selection.focusNode===range.endContainer&&selection.focusOffset===range.endOffset,rect=(focusAtEnd?rects[rects.length-1]:rects[0])||range.getBoundingClientRect();const startOffset=textOffset(startText,range.startContainer,range.startOffset,"start"),endOffset=textOffset(endText,range.endContainer,range.endOffset,"end"),messages=state.room.messages,first=messages.findIndex(m=>m.id===startMessage.dataset.message),last=messages.findIndex(m=>m.id===endMessage.dataset.message),quote=messages.slice(first,last+1).map((m,i)=>JijinLogFormat.plain(m.text,i===0?startOffset:0,first+i===last?endOffset:m.text.length)).join("\n");return {messageId:startMessage.dataset.message,endMessageId:endMessage.dataset.message,startOffset,endOffset,quote,anchorLeft:rect.left,anchorRight:rect.right,anchorTop:rect.top,anchorBottom:rect.bottom};
}
let logDragStart=null,logWasDragged=false;
document.addEventListener("pointerdown",event=>{
  if(!event.target.closest?.("#logPane")||event.button!==0)return;
  logDragStart={x:event.clientX,y:event.clientY};logWasDragged=false;
  if(!$("#commentDialog").open){state.selection=null;CSS.highlights?.delete("jijin-comment-selection")}
});
document.addEventListener("pointermove",event=>{
  if(logDragStart&&Math.hypot(event.clientX-logDragStart.x,event.clientY-logDragStart.y)>3)logWasDragged=true;
});
document.addEventListener("pointerup",()=>{logDragStart=null});
function showSelection() {
  if(state.archiveMode)return;
  if(!logWasDragged)return;
  const nextSelection = selectionInfo();
  if (nextSelection?.quote.trim()) { state.selection = nextSelection; $("#selectedQuote").textContent = `「${state.selection.quote.trim()}」`; $("#selectionBar").classList.add("hidden"); if(!$("#commentDialog").open&&!$("#profileDialog").open)openCommentDialog(); }
  else if (!$("#commentDialog").open) $("#selectionBar").classList.add("hidden");
}
function fillPersonaSelect() {
  $("#personaSelect").innerHTML = `<option value="PL">${esc(state.profile.plName || "PL名を設定") }（PL）</option>` + state.profile.personas.map((p,i)=>`<option value="${i}">${esc(p.name)}（${esc(p.type)}）</option>`).join("") + `<option value="ADD">＋ キャラ追加</option>`;
  const valid=state.lastPersona==="PL"||(/^\d+$/.test(state.lastPersona)&&state.profile.personas[Number(state.lastPersona)]);$("#personaSelect").value=valid?state.lastPersona:"PL";state.lastPersona=$("#personaSelect").value;
  updateCommentPersonaAvatar();
}
function updateCommentPersonaAvatar(){const persona=currentPersona(),target=$("#commentPersonaAvatar");target.style.setProperty("--persona-marker",markerColor(persona.color));target.innerHTML=persona.icon?`<img src="${esc(persona.icon)}" alt="">`:`<span>${esc((persona.name||"?").slice(0,1))}</span>`}
function openCommentDialog() {
  if(window.JijinCommentComposer?.keep($("#commentDialog"),!!state.commentImage))return;
  state.replyTo=null;state.editingCommentId=null;state.editingOriginalPersona=null;$("#commentDeleteBtn").classList.add("hidden");
  state.pendingSelection = state.selection ? { ...state.selection } : null;
  if (!state.pendingSelection?.quote?.trim()) return;
  const selected=getSelection();
  if(selected?.rangeCount&&window.Highlight&&CSS.highlights){
    CSS.highlights.set("jijin-comment-selection",new Highlight(selected.getRangeAt(0).cloneRange()));
  }
  if (!state.profile.plName) { openProfile(); return; }
  clearCommentImage();fillPersonaSelect(); $("#commentBody").value = ""; $("#commentDialog").show(); positionCommentDialog(); setTimeout(()=>$("#commentBody").focus(),0);
}
function openReplyDialog(annotation,anchor){if(window.JijinCommentComposer?.keep($("#commentDialog"),!!state.commentImage))return;if(!annotation)return;state.editingCommentId=null;state.editingOriginalPersona=null;$("#commentDeleteBtn").classList.add("hidden");state.replyTo=annotation.id;state.pendingSelection={messageId:annotation.message_id,endMessageId:annotation.end_message_id||annotation.message_id,startOffset:annotation.start_offset,endOffset:annotation.end_offset,quote:annotation.quote,anchorLeft:anchor.left,anchorRight:anchor.right,anchorTop:anchor.top,anchorBottom:anchor.bottom};clearCommentImage();fillPersonaSelect();$("#commentBody").value="";$("#commentDialog").show();positionCommentDialog();setTimeout(()=>$("#commentBody").focus(),0)}
function openEditDialog(annotation,anchor){if(window.JijinCommentComposer?.keep($("#commentDialog"),!!state.commentImage))return;if(!annotation)return;state.replyTo=annotation.parent_id||null;state.editingCommentId=annotation.id;state.pendingSelection={messageId:annotation.message_id,endMessageId:annotation.end_message_id||annotation.message_id,startOffset:annotation.start_offset,endOffset:annotation.end_offset,quote:annotation.quote,anchorLeft:anchor.left,anchorRight:anchor.right,anchorTop:anchor.top,anchorBottom:anchor.bottom};clearCommentImage();fillPersonaSelect();const personaIndex=state.profile.personas.findIndex(persona=>persona.name===annotation.persona_name&&persona.type===annotation.persona_type);$("#personaSelect").value=annotation.persona_type==="PL"?"PL":personaIndex>=0?String(personaIndex):$("#personaSelect").value;state.lastPersona=$("#personaSelect").value;updateCommentPersonaAvatar();$("#commentBody").value=annotation.body||"";state.commentImage=null;$("#commentDeleteBtn").classList.remove("hidden");$("#commentDialog").show();positionCommentDialog();setTimeout(()=>$("#commentBody").focus(),0)}
function positionCommentDialog(){const dialog=$("#commentDialog"),a=state.pendingSelection;if(!a||innerWidth<=800){dialog.style.left="";dialog.style.top="";return}const width=Math.min(390,innerWidth-24),height=Math.min(dialog.offsetHeight||430,innerHeight-24);let left=a.anchorRight+12;if(left+width>innerWidth-12)left=Math.max(12,a.anchorLeft-width-12);let top=Math.min(Math.max(12,a.anchorTop-24),innerHeight-height-12);dialog.style.left=`${left}px`;dialog.style.top=`${top}px`}
async function postComment(event) {
  event.preventDefault(); const persona = currentPersona(), body = $("#commentBody").value.trim(); if (!body&&!state.commentImage&&state.commentImage!==null) return;
  const payload = { ...state.pendingSelection, parentId:state.replyTo||"", color: persona.color || "#ffe66b", authorId: state.profile.id, authorName: state.profile.plName, personaName: persona.name, personaType: persona.type, personaIcon: persona.icon || "", body,imageData:state.commentImage };
  try { const editingId=state.editingCommentId;await api(editingId?`/api/rooms/${encodeURIComponent(state.roomId)}/annotations/${encodeURIComponent(editingId)}`:`/api/rooms/${encodeURIComponent(state.roomId)}/annotations`, { method:editingId?"PATCH":"POST", body:JSON.stringify(payload) }); setTyping(false); $("#commentDialog").close(); state.pendingSelection=null; state.selection=null; state.replyTo=null;state.editingCommentId=null; getSelection()?.removeAllRanges(); $("#selectionBar").classList.add("hidden"); await refreshAnnotations(true); if(!payload.parentId)jumpToMessage(payload.messageId); } catch(e) { alert(e.message); }
}
// PL/PC editing is owned by the current room editor, never a second LOG form.
function openProfile(){window.JijinLogSettings?.open()}
function renderPlIcon(){}
function renderPersonas(){}
function focusCommentChain(id){
  document.querySelectorAll(".comment-card.focused").forEach(card=>card.classList.remove("focused"));
  const seen=new Set();
  while(id&&!seen.has(id)){
    seen.add(id);document.getElementById("comment-"+id)?.classList.add("focused");
    id=state.annotations.find(annotation=>annotation.id===id)?.parent_id;
  }
}
let markerNavigation=0;
function pulseLogMarker(element,id){
  if(!id){element.scrollIntoView({behavior:"smooth",block:"center"});return}
  const token=++markerNavigation;
  const clickedId=id,seenParents=new Set();
  let annotation=state.annotations.find(item=>item.id===id);
  while(annotation?.parent_id&&!seenParents.has(annotation.id)){
    seenParents.add(annotation.id);
    const parentAnnotation=state.annotations.find(item=>item.id===annotation.parent_id);
    if(!parentAnnotation)break;
    annotation=parentAnnotation;id=annotation.id;
  }
  state.activeMarkerId=id;
  const grouped=groupAnnotations();
  for(const row of document.querySelectorAll(".log-message[data-message]")){
    const message=state.room?.messages.find(m=>m.id===row.dataset.message),text=row.querySelector(".message-text");
    if(message&&text)text.innerHTML=markedText(message,grouped[message.id]||[]);
  }
  focusCommentChain(clickedId);
  let hiding=document.getElementById("jijin-marker-navigation-hide");
  if(!hiding){hiding=document.createElement("style");hiding.id="jijin-marker-navigation-hide";document.head.append(hiding)}
  const selector=`mark[data-ann="${CSS.escape(id)}"]`;
  document.querySelectorAll(selector).forEach(mark=>mark.getAnimations().forEach(animation=>animation.cancel()));
  hiding.textContent=`${selector}{background:transparent!important}`;
  element.scrollIntoView({behavior:"smooth",block:"center"});
  const started=performance.now();let previous=null,stable=0;
  function settled(){
    if(token!==markerNavigation)return;
    const panel=document.querySelector(`.log-page[data-track-index="${state.carouselPosition}"]`);
    const target=panel?.querySelector(`[data-message="${CSS.escape(element.dataset.message)}"]`)||element;
    const rect=target.getBoundingClientRect(),position=[rect.top,rect.left];
    stable=previous&&Math.abs(previous[0]-position[0])<.5&&Math.abs(previous[1]-position[1])<.5?stable+1:0;previous=position;
    if((performance.now()-started<180||stable<8)&&performance.now()-started<2500){requestAnimationFrame(settled);return}
    hiding.textContent="";
    for(const mark of (panel||document).querySelectorAll(selector)){
      const color=getComputedStyle(mark).backgroundColor;
      mark.animate([
        {backgroundColor:"transparent",backgroundImage:`linear-gradient(${color},${color})`,backgroundRepeat:"no-repeat",backgroundSize:"0% 100%"},
        {backgroundColor:"transparent",backgroundImage:`linear-gradient(${color},${color})`,backgroundRepeat:"no-repeat",backgroundSize:"100% 100%"}
      ],{duration:320,easing:"cubic-bezier(.2,.9,.25,1)"});
    }
  }
  requestAnimationFrame(settled);
}

function jumpToMessage(id, annotationId) { const message=state.room?.messages.find(m=>m.id===id); if(!message)return;const index=state.room.tabs.indexOf(message.tab);if(state.hiddenTabs.has(message.tab)){state.hiddenTabs.delete(message.tab);localStorage.setItem(`hiddenTabs:${state.roomId}`,JSON.stringify([...state.hiddenTabs]));state.activeTabIndex=index;renderLog(message.time)}else if(index!==state.activeTabIndex){if(state.viewMode==="timeline")goToTab(index);else{state.activeTabIndex=index;renderLog(message.time)}}const panel=document.querySelector(`.log-page[data-track-index="${state.carouselPosition}"]`),el=panel?.querySelector(`[data-message="${CSS.escape(id)}"]`);if(!el)return;const annotation=annotationId&&state.annotations.find(item=>item.id===annotationId),color=markerColor(annotation?.color||"#ffe66b");el.style.setProperty("--flash-color",color);el.querySelector(".annotation-count")?.style.setProperty("--flash-color",color);el.classList.remove("flash");pulseLogMarker(el,annotationId);}

async function resizeCommentImage(file){if(!file)return"";const bitmap=await createImageBitmap(file),max=1000,scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext("2d").drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();let quality=.78,data="";do{data=canvas.toDataURL("image/webp",quality);quality-=.1}while(data.length>600000&&quality>=.38);if(data.length>600000){const small=document.createElement("canvas");small.width=Math.round(canvas.width*.72);small.height=Math.round(canvas.height*.72);small.getContext("2d").drawImage(canvas,0,0,small.width,small.height);data=small.toDataURL("image/webp",.55)}return data}
function clearCommentImage(){state.commentImage=""}
function jumpToComment(id) { const el=$("#comment-"+CSS.escape(id)); if(!el)return; if(innerWidth<=800)$("#commentsPane").classList.add("open"); el.scrollIntoView({behavior:"smooth",block:"center"}); focusCommentChain(id); }

loadProfile();
function applyTheme(theme){
 document.documentElement.classList.toggle("dark",theme==="dark");
 requestAnimationFrame(()=>{
  document.querySelectorAll("mark[data-ann]").forEach(mark=>{const a=state.annotations.find(a=>a.id===mark.dataset.ann);if(a)mark.style.setProperty("--marker",annotationMarkerColor(a))});
  document.querySelectorAll(".comment-card[id^='comment-']").forEach(card=>{const a=state.annotations.find(a=>a.id===card.id.slice(8));if(a)card.style.setProperty("--comment-marker",markerColor(a.color))});
 });
}applyTheme("light");

$("#fileInput").onchange=e=>e.target.files[0]&&handleFile(e.target.files[0]);
$("#spoilerInput").onchange=e=>$("#spoilerDetails").classList.toggle("hidden",!e.target.checked);
for(const ev of ["dragenter","dragover"]){$("#dropzone").addEventListener(ev,e=>{e.preventDefault();e.currentTarget.classList.add("drag")})}
for(const ev of ["dragleave","drop"]){$("#dropzone").addEventListener(ev,e=>{e.preventDefault();e.currentTarget.classList.remove("drag")})}
$("#dropzone").addEventListener("drop",e=>e.dataTransfer.files[0]&&handleFile(e.dataTransfer.files[0]));
$("#createRoomBtn").onclick=createRoom; $("#profileBtn").onclick=openProfile; $("#commentForm").onsubmit=postComment;
document.addEventListener("click",e=>{if(e.target.matches("[data-close]"))e.target.closest("dialog").close();const image=e.target.closest("[data-expand-image]");if(image){e.stopPropagation();$("#expandedCommentImage").src=image.src;$("#imageDialog").showModal();return}const like=e.target.closest("[data-like-comment]");if(like){e.stopPropagation();toggleLike(like.dataset.likeComment,like);return}const edit=e.target.closest("[data-edit-comment]");if(edit){e.stopPropagation();const annotation=state.annotations.find(item=>item.id===edit.dataset.editComment);openEditDialog(annotation,edit.closest(".comment-card").getBoundingClientRect());return}const typing=e.target.closest("[data-typing-target]");if(typing){jumpToMessage(typing.dataset.typingTarget);return} const mark=e.target.closest("mark[data-ann]");if(mark)jumpToComment(mark.dataset.ann);const reply=e.target.closest("[data-reply-comment]");if(reply){const annotation=state.annotations.find(item=>item.id===reply.dataset.replyComment);openReplyDialog(annotation,reply.closest(".comment-card").getBoundingClientRect())} const card=e.target.closest(".comment-card");if(card&&!reply)jumpToMessage(card.dataset.target,card.id.replace("comment-","")); const count=e.target.closest("[data-message-comments]");if(count){const a=state.annotations.find(x=>x.message_id===count.dataset.messageComments&&!x.parent_id);if(a)jumpToComment(a.id)} const page=e.target.closest("[data-page]");if(page)switchLogPage(page.dataset.page==="next"?1:-1)});
document.addEventListener("click",e=>{const tab=e.target.closest("[data-tab-index]");if(tab)goToTab(Number(tab.dataset.tabIndex))});
document.addEventListener("dblclick",e=>{const tab=e.target.closest(".tab-rail [data-tab-index]");if(!tab)return;e.preventDefault();e.stopPropagation();toggleTabVisibility(Number(tab.dataset.tabIndex))});
document.addEventListener("click",e=>{const suggestion=e.target.closest("[data-suggest-message]");if(!suggestion)return;hideTabSuggestions();jumpToMessage(suggestion.dataset.suggestMessage)});
document.addEventListener("click",e=>{const button=e.target.closest("[data-delete-room]");if(button)askDeleteOwnedRoom(button.dataset.deleteRoom,button.dataset.roomTitle)});
$("#personaSelect").onchange=()=>{if($("#personaSelect").value==="ADD"){$("#commentDialog").close();openProfile();return}state.lastPersona=$("#personaSelect").value;localStorage.setItem(`lastPersona:${state.roomId}`,state.lastPersona);updateCommentPersonaAvatar()};
$("#commentDeleteBtn").onclick=async()=>{const id=state.editingCommentId;if(!id)return;if(!confirm("このコメントを削除しますか？\n返信もまとめて削除されます。"))return;$("#commentDialog").close();await deleteComment(id,true);state.editingCommentId=null};
$("#imageDialog").addEventListener("click",e=>{if(e.target===$("#imageDialog"))$("#imageDialog").close()});
$("#exportRoomBtn").onclick=async()=>{if(!state.room)return;const button=$("#exportRoomBtn"),label=button.textContent;button.disabled=true;button.textContent="保存中…";try{await downloadArchive(state.room,state.annotations,state.profile.personas)}catch(error){alert(error.message)}finally{button.disabled=false;button.textContent=label}};
$("#saveDeleteRoomBtn").onclick=()=>confirmDeleteRoom(true);$("#deleteOnlyRoomBtn").onclick=()=>confirmDeleteRoom(false);
document.addEventListener("pointerdown",e=>{const dialog=$("#commentDialog");if(!dialog.open||dialog.contains(e.target))return;if(window.JijinCommentComposer?.outside(dialog,!!state.commentImage))return;if($("#commentBody").value.trim()||state.commentImage)$("#commentForm").requestSubmit();else dialog.close()});
$("#commentBody").addEventListener("input",()=>setTyping(true));
$("#commentDialog").addEventListener("close",()=>setTyping(false));
document.addEventListener("keydown",e=>{if(e.defaultPrevented||e.altKey||e.ctrlKey||e.metaKey)return;const target=e.target;if(target?.matches?.("input, textarea, select")||target?.isContentEditable)return;if(e.key==="ArrowLeft"||e.key==="ArrowRight"){e.preventDefault();switchLogPage(e.key==="ArrowRight"?1:-1);return}if(e.key==="ArrowUp"||e.key==="ArrowDown"){const panel=document.querySelector(`.log-page[data-track-index="${state.carouselPosition}"] .page-scroll`);if(!panel)return;e.preventDefault();const amount=(e.key==="ArrowDown"?1:-1)*Math.max(54,panel.clientHeight*.09);if(e.repeat)panel.scrollTop+=amount;else panel.scrollBy({top:amount,behavior:"smooth"})}});
document.addEventListener("mouseup",()=>setTimeout(showSelection)); document.addEventListener("touchend",()=>setTimeout(showSelection,50));
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&state.realtimeWanted&&state.realtime?.readyState!==WebSocket.OPEN)connectRealtime()});
addEventListener("pagehide",disconnectRealtime);
addEventListener("pageshow",()=>{if(state.roomId&&state.roomId!=="archive"&&!state.archiveMode)connectRealtime()});
addEventListener("message",event=>{if(event.origin!==location.origin)return;if(event.data?.type==="jijinboard-open-profile")openProfile();if(event.data?.type==="jijinboard-request-profile")emitIntegratedProfile()});
$("#markBtn").onclick=openCommentDialog; $("#viewMode").value=state.viewMode; $("#viewMode").onchange=e=>{const time=currentReadingTime();state.readingAnchor=time;state.viewMode=e.target.value;localStorage.setItem("trpgMarkerViewMode",state.viewMode);renderLog(time);setTimeout(revealInlineSuggestions,20)}; $("#searchInput").oninput=()=>{const time=currentReadingTime();state.readingAnchor=time;renderLog(time);setTimeout(revealInlineSuggestions,20)};
$("#shareBtn").onclick=async()=>{await navigator.clipboard.writeText(location.href);$("#roomStatus").textContent="共有URLをコピーしました";setTimeout(()=>$("#roomStatus").textContent="",1800)};
function applyFontSize(value){const size=Math.min(20,Math.max(10,Number(value)||12.5));document.documentElement.style.setProperty("--log-font-size",`${size}px`);$("#fontSize").value=String(size);localStorage.setItem("trpgMarkerFontSize",String(size))}$("#fontSize").oninput=e=>applyFontSize(e.target.value);applyFontSize(localStorage.getItem("trpgMarkerFontSize")||12.5);
const startupUrl=new URL(location.href),siteOwnerKey=startupUrl.searchParams.get("owner");if(siteOwnerKey){localStorage.setItem("trpgMarkerSiteOwnerKey",siteOwnerKey);startupUrl.searchParams.delete("owner");history.replaceState(null,"",startupUrl.pathname+startupUrl.search)}const roomId=startupUrl.searchParams.get("room");if(window.__TRPG_ARCHIVE__)openArchiveData(window.__TRPG_ARCHIVE__);else if(roomId)openRoom(roomId);

addEventListener("jijinboard-cache-updated",event=>{
  const url=new URL(event.detail.url);
  if(url.pathname===`/api/rooms/${encodeURIComponent(state.roomId)}/annotations`)refreshAnnotations().catch(()=>{});
});

document.getElementById("commentDialog").addEventListener("close",()=>{
  CSS.highlights?.delete("jijin-comment-selection");
  state.selection=null;logWasDragged=false;
});

// Settings live in a separate iframe. Apply its saved color pair immediately.
addEventListener("storage",event=>{
  const board=new URL(location.href).searchParams.get("board")||"";
  if(event.key!==`jijinboardSelectedColors:${board}:${state.profile?.id||""}`||!event.newValue)return;
  let colors;try{colors=JSON.parse(event.newValue)}catch{return}
  let changed=false;
  for(const annotation of state.annotations||[]){
    if(annotation.author_id!==state.profile.id)continue;
    const persona=state.profile.personas.find(p=>p.name===annotation.persona_name&&p.type===annotation.persona_type);
    const pair=annotation.persona_type==="PL"?colors.PL:colors[persona?.id]||colors[`name:${annotation.persona_type}:${annotation.persona_name}`];
    if(pair){annotation.color=`${pair.light}|${pair.dark}`;changed=true}
  }
  if(!changed)return;
  for(const mark of document.querySelectorAll("mark[data-ann]")){
    const a=state.annotations.find(a=>a.id===mark.dataset.ann);if(a)mark.style.setProperty("--marker",markerColor(a.color));
  }
  for(const card of document.querySelectorAll(".comment-card[id]")){
    const a=state.annotations.find(a=>`comment-${a.id}`===card.id);if(a)card.style.setProperty("--comment-marker",markerColor(a.color));
  }
});

$("#searchInput").oninput=null;
$("#searchInput").onkeydown=event=>{
 if(event.key!=="Enter")return;event.preventDefault();
 const query=event.target.value.trim().toLowerCase();if(!query||!state.room)return;
 const rows=state.room.messages,visible=document.querySelector(`.log-page[data-track-index="${state.carouselPosition}"] .log-message[data-message]`);
 let start=state.lastSearchMessage?rows.findIndex(m=>m.id===state.lastSearchMessage):rows.findIndex(m=>m.id===visible?.dataset.message);
 for(let n=1;n<=rows.length;n++){
  const index=(start+(event.shiftKey?-n:n)+rows.length*2)%rows.length,m=rows[index];
  if(`${m.speaker} ${m.text}`.toLowerCase().includes(query)){state.lastSearchMessage=m.id;jumpToMessage(m.id);
  document.querySelectorAll(".log-search-hit").forEach(el=>el.classList.remove("log-search-hit"));
  const highlight=()=>document.querySelectorAll(`.log-message[data-message="${CSS.escape(m.id)}"]`).forEach(el=>el.classList.add("log-search-hit"));
  highlight();setTimeout(highlight,400);break}
 }
};

const searchCount=document.createElement("span");searchCount.id="logSearchCount";searchCount.setAttribute("aria-live","polite");
$("#searchInput").insertAdjacentElement("afterend",searchCount);
function updateSearchCount(){
 const query=$("#searchInput").value.trim().toLowerCase();
 if(!query||!state.room){searchCount.textContent="";return}
 const matches=state.room.messages.filter(m=>`${m.speaker} ${m.text}`.toLowerCase().includes(query));
 const index=matches.findIndex(m=>m.id===state.lastSearchMessage);
 searchCount.textContent=`${index<0?0:index+1}/${matches.length}`;
}
$("#searchInput").oninput=()=>{state.lastSearchMessage=null;updateSearchCount()};
const navigateSearch=$("#searchInput").onkeydown;
$("#searchInput").onkeydown=event=>{navigateSearch(event);updateSearchCount()};

// Clipboard paragraph spacing is normalized only for new pasted comments.
document.getElementById('commentBody')?.addEventListener('paste',event=>{
 const text=event.clipboardData?.getData('text/plain');if(!text)return;
 const normalized=text.replace(/\r\n?/g,'\n').replace(/\n[ \t]*\n(?:[ \t]*\n)+/g,'\n\n');
 if(text===normalized)return;event.preventDefault();const field=event.currentTarget;field.setRangeText(normalized,field.selectionStart,field.selectionEnd,'end');field.dispatchEvent(new Event('input',{bubbles:true}));
});
document.addEventListener('dblclick',event=>{
 const tab=event.target.closest('[data-tab-index]');if(!tab)return;
 const index=Number(tab.dataset.tabIndex),name=state.room?.tabs?.[index];if(!name||state.hiddenTabs.has(name))return;
 const anchor=state.readingAnchor||currentReadingTime();state.isSliding=false;state.slideQueue=0;state.activeTabIndex=index;renderLog(anchor);
});
