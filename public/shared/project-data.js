(function(global){
  "use strict";
  const PEOPLE_KEY="trpgProjectPeople.v1",SESSION_META_KEY="trpgProjectSessions.v1";
  const uid=prefix=>`${prefix}_${crypto.randomUUID?.()||Math.random().toString(36).slice(2)+Date.now().toString(36)}`;
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||"")||fallback}catch{return fallback}};
  const write=(key,value)=>{localStorage.setItem(key,JSON.stringify(value));return value};
  const people=()=>read(PEOPLE_KEY,[]),savePeople=value=>write(PEOPLE_KEY,value),sessions=()=>read(SESSION_META_KEY,{}),saveSessions=value=>write(SESSION_META_KEY,value);
  const normalizeType=value=>["PL","PC","NPC"].includes(value)?value:"NPC";
  const iconOf=value=>String(value?.icon||value?.plIcon||""),colorOf=value=>String(value?.color||value?.plColor||"#ffe66b");
  function findOrCreate(list,candidate){
    const type=normalizeType(candidate.type),name=String(candidate.name||"").trim();if(!name)return null;
    let person=list.find(item=>item.id===candidate.id)||list.find(item=>item.type===type&&item.name===name);
    if(!person){person={id:candidate.id||uid(type.toLowerCase()),type,name,icon:iconOf(candidate),color:colorOf(candidate),plId:candidate.plId||""};list.push(person)}
    else{if(!person.icon&&iconOf(candidate))person.icon=iconOf(candidate);if(candidate.color)person.color=colorOf(candidate);if(candidate.plId)person.plId=candidate.plId}
    return person;
  }
  function importLogPeople(){
    const list=people(),profile=read("trpgMarkerProfile",null);
    if(profile?.plName)findOrCreate(list,{id:profile.id,type:"PL",name:profile.plName,icon:profile.plIcon,color:profile.plColor});
    for(let index=0;index<localStorage.length;index++){
      const key=localStorage.key(index);if(!key?.startsWith("personas:"))continue;
      const roomPeople=read(key,[]);let changed=false;
      roomPeople.forEach(persona=>{const person=findOrCreate(list,{id:persona.projectPersonId,type:persona.type,name:persona.name,icon:persona.icon,color:persona.color});if(person&&!persona.projectPersonId){persona.projectPersonId=person.id;changed=true}});
      if(changed)write(key,roomPeople);
    }
    savePeople(list);return list;
  }
  function upsertPerson(value){
    const list=people(),index=list.findIndex(item=>item.id===value.id),type=normalizeType(value.type);
    const person={id:value.id||uid(type.toLowerCase()),type,name:String(value.name||"").trim(),icon:String(value.icon||""),color:String(value.color||"#ffe66b"),plId:String(value.plId||"")};
    if(index<0)list.push(person);else list[index]={...list[index],...person};savePeople(list);return person;
  }
  function removePerson(id){const list=people().filter(item=>item.id!==id).map(item=>item.plId===id?{...item,plId:""}:item);savePeople(list);return list}
  global.TRPGProjectData={PEOPLE_KEY,SESSION_META_KEY,uid,read,write,people,savePeople,sessions,saveSessions,importLogPeople,upsertPerson,removePerson};
})(window);
