(function(global){
  "use strict";
  // Spreadsheet characters are their own data model. Do not let Spreadsheet
  // read from or write to the shared LOG / MAGIA MATRIX people master.
  if(/\/spreadsheet(?:\/|$)/.test(location.pathname)){
    global.TRPGProjectData=null;
    return;
  }

  const PEOPLE_KEY="trpgProjectPeople.v1";
  const SESSION_META_KEY="trpgProjectSessions.v1";
  const DELETED_KEY="jijinboardDeletedPeople.v1";
  const VAULT_KEY="jijinboardPersonaVault.v1";
  const uid=prefix=>`${prefix}_${crypto.randomUUID?.()||Math.random().toString(36).slice(2)+Date.now().toString(36)}`;
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||"")||fallback}catch{return fallback}};
  const write=(key,value)=>{localStorage.setItem(key,JSON.stringify(value));return value};
  const people=()=>read(PEOPLE_KEY,[]),savePeople=value=>write(PEOPLE_KEY,value),sessions=()=>read(SESSION_META_KEY,{}),saveSessions=value=>write(SESSION_META_KEY,value);
  const deletedIds=()=>new Set(Array.isArray(read(DELETED_KEY,[]))?read(DELETED_KEY,[]):[]);
  const saveDeletedIds=set=>write(DELETED_KEY,[...set]);
  const normalizeType=value=>["PL","PC","NPC"].includes(value)?value:"NPC";
  const iconOf=value=>String(value?.icon||value?.plIcon||""),colorOf=value=>String(value?.color||value?.plColor||"#ffe66b");

  function findOrCreate(list,candidate){
    const type=normalizeType(candidate.type),name=String(candidate.name||"").trim();if(!name)return null;
    let person=list.find(item=>item.id===candidate.id)||list.find(item=>item.type===type&&item.name===name);
    if(!person){person={id:candidate.id||uid(type.toLowerCase()),type,name,icon:iconOf(candidate),color:colorOf(candidate),plId:candidate.plId||""};list.push(person)}
    else{if(!person.icon&&iconOf(candidate))person.icon=iconOf(candidate);if(candidate.color)person.color=colorOf(candidate);if(candidate.plId)person.plId=candidate.plId}
    return person;
  }

  function personaMatchesDeleted(persona,deleted){
    const projectId=String(persona?.projectPersonId||"");
    return !!projectId&&deleted.has(projectId);
  }

  function importLogPeople(){
    const deleted=deletedIds();
    const list=people().filter(person=>!deleted.has(String(person?.id||"")));
    const profile=read("trpgMarkerProfile",null);
    if(profile?.plName&&!deleted.has(String(profile.id||"")))findOrCreate(list,{id:profile.id,type:"PL",name:profile.plName,icon:profile.plIcon,color:profile.plColor});

    const keys=[];for(let index=0;index<localStorage.length;index++){const key=localStorage.key(index);if(key?.startsWith("personas:"))keys.push(key)}
    for(const key of keys){
      const roomPeople=read(key,[]);if(!Array.isArray(roomPeople))continue;
      let changed=false;
      const kept=[];
      for(const persona of roomPeople){
        if(personaMatchesDeleted(persona,deleted)){changed=true;continue}
        const person=findOrCreate(list,{id:persona.projectPersonId,type:persona.type,name:persona.name,icon:persona.icon,color:persona.color});
        if(person&&!persona.projectPersonId){persona.projectPersonId=person.id;changed=true}
        kept.push(persona);
      }
      if(changed)write(key,kept);
    }
    savePeople(list);return list;
  }

  function upsertPerson(value){
    const list=people(),index=list.findIndex(item=>item.id===value.id),type=normalizeType(value.type);
    const person={id:value.id||uid(type.toLowerCase()),type,name:String(value.name||"").trim(),icon:String(value.icon||""),color:String(value.color||"#ffe66b"),plId:String(value.plId||"")};
    const deleted=deletedIds();deleted.delete(person.id);saveDeletedIds(deleted);
    if(index<0)list.push(person);else list[index]={...list[index],...person};savePeople(list);return person;
  }

  function removePersonDeep(id){
    id=String(id||"");
    const list=people(),target=list.find(item=>String(item?.id||"")===id)||null;
    const next=list.filter(item=>String(item?.id||"")!==id).map(item=>item.plId===id?{...item,plId:""}:item);
    savePeople(next);

    const deleted=deletedIds();deleted.add(id);saveDeletedIds(deleted);
    const removedPersonas=[];
    const profile=read("trpgMarkerProfile",null);
    const authorId=String(profile?.id||"");

    const personaKeys=[];for(let index=0;index<localStorage.length;index++){const key=localStorage.key(index);if(key?.startsWith("personas:"))personaKeys.push(key)}
    for(const key of personaKeys){
      const roomId=key.slice("personas:".length),rows=read(key,[]);if(!Array.isArray(rows))continue;
      const removed=rows.filter(persona=>String(persona?.projectPersonId||"")===id||(!persona?.projectPersonId&&String(persona?.id||"")===id));
      if(!removed.length)continue;
      const kept=rows.filter(persona=>!removed.includes(persona));
      write(key,kept);
      for(const persona of removed)removedPersonas.push({roomId,personaId:String(persona?.id||""),projectPersonId:String(persona?.projectPersonId||""),name:String(persona?.name||target?.name||""),authorId});
    }

    // Remove the same PC from the recovery vault. If it was the last PC in a room,
    // preserve an explicit-empty marker so recovery code cannot resurrect it.
    const vault=read(VAULT_KEY,{});let vaultChanged=false;
    for(const [slot,entry] of Object.entries(vault||{})){
      const rows=Array.isArray(entry?.personas)?entry.personas:[];
      const kept=rows.filter(persona=>String(persona?.projectPersonId||"")!==id&&String(persona?.id||"")!==id);
      if(kept.length===rows.length)continue;
      vault[slot]={...entry,personas:kept,explicitEmpty:kept.length===0,updatedAt:Date.now()};vaultChanged=true;
    }
    if(vaultChanged)write(VAULT_KEY,vault);

    // Also clear cached participant snapshots used by the recovery layer.
    const syncKeys=[];for(let index=0;index<localStorage.length;index++){const key=localStorage.key(index);if(key?.startsWith("jijinboardParticipantSync:"))syncKeys.push(key)}
    for(const key of syncKeys){
      const snapshot=read(key,null);if(!snapshot||!Array.isArray(snapshot.personas))continue;
      const kept=snapshot.personas.filter(persona=>String(persona?.projectPersonId||"")!==id&&String(persona?.id||"")!==id);
      if(kept.length!==snapshot.personas.length)write(key,{...snapshot,personas:kept});
    }

    return {people:next,target,removedPersonas};
  }

  function removePerson(id){return removePersonDeep(id).people}
  global.TRPGProjectData={PEOPLE_KEY,SESSION_META_KEY,DELETED_KEY,uid,read,write,people,savePeople,sessions,saveSessions,importLogPeople,upsertPerson,removePerson,removePersonDeep};
})(window);
