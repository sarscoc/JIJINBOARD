"use strict";
(()=>{
  const PEOPLE_KEY="trpgProjectPeople.v1";
  const autoKeys=new Set(["id","projectPersonId","name","alias","key","base","sources","local"]);
  const isAutoProjectCharacter=ch=>!!ch&&ch.local===true&&ch.base==null&&Array.isArray(ch.sources)&&ch.sources.length===0&&!String(ch.alias||"").trim()&&!!ch.projectPersonId&&ch.id===ch.projectPersonId&&Object.keys(ch).every(key=>autoKeys.has(key));
  const parse=(value,fallback)=>{try{return JSON.parse(value||"")??fallback}catch{return fallback}};

  function logPersonIds(){
    const ids=new Set();
    for(let index=0;index<localStorage.length;index++){
      const key=localStorage.key(index);
      if(!key?.startsWith("personas:"))continue;
      const personas=parse(localStorage.getItem(key),[]);
      if(!Array.isArray(personas))continue;
      for(const persona of personas){
        if(persona?.projectPersonId)ids.add(String(persona.projectPersonId));
      }
    }
    return ids;
  }

  function cleanSharedMaster(chars){
    const linked=new Set(chars.filter(ch=>!isAutoProjectCharacter(ch)&&ch?.projectPersonId).map(ch=>String(ch.projectPersonId)));
    if(!linked.size)return;
    const realLogIds=logPersonIds();
    const people=parse(localStorage.getItem(PEOPLE_KEY),[]);
    if(!Array.isArray(people))return;
    const next=people.filter(person=>!linked.has(String(person?.id||""))||realLogIds.has(String(person?.id||"")));
    if(next.length!==people.length)localStorage.setItem(PEOPLE_KEY,JSON.stringify(next));
  }

  function cleanSpreadsheetState(){
    if(typeof state==="undefined"||!state)return false;
    const chars=Array.isArray(state.characters)?state.characters:[];
    cleanSharedMaster(chars);
    const removed=new Set(chars.filter(isAutoProjectCharacter).map(ch=>String(ch.id)));
    let changed=removed.size>0;
    const nextChars=chars.filter(ch=>!removed.has(String(ch.id))).map(ch=>{
      if(!ch||typeof ch!=="object"||!("projectPersonId" in ch))return ch;
      const next={...ch};delete next.projectPersonId;changed=true;return next;
    });
    const sources=Array.isArray(state.sources)?state.sources:[];
    const nextSources=sources.map(src=>{
      if(!src||typeof src!=="object"||!src.mapping||typeof src.mapping!=="object"||!removed.size)return src;
      const mapping={...src.mapping};let sourceChanged=false;
      for(const key of Object.keys(mapping))if(removed.has(String(mapping[key]))){delete mapping[key];sourceChanged=true}
      if(!sourceChanged)return src;
      changed=true;return {...src,mapping};
    });
    if(!changed)return false;
    state.characters=nextChars;
    state.sources=nextSources;
    localStorage.setItem("charaHub.characters",JSON.stringify(nextChars));
    localStorage.setItem("charaHub.sources",JSON.stringify(nextSources));
    try{renderCharacters?.()}catch{}
    try{if(typeof setMainView==="function")setMainView();else renderDataTable?.()}catch{}
    return true;
  }

  // From this point Spreadsheet cannot write into the LOG / MATRIX people master,
  // even when an old cached project-data.js happened to run earlier on this load.
  window.TRPGProjectData=null;
  cleanSpreadsheetState();
  // sheet-sync may apply an older remote snapshot asynchronously. Re-clean only
  // a few times during startup; no persistent observer or background loop.
  setTimeout(cleanSpreadsheetState,250);
  setTimeout(cleanSpreadsheetState,900);
  setTimeout(cleanSpreadsheetState,1800);
})();
