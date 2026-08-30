const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});

const dataImage=value=>{
  const match=String(value||"").match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([a-zA-Z0-9+/=]+)$/);
  if(!match)return null;
  const binary=atob(match[2]),bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return{contentType:match[1],bytes};
};
const bytesHash=async bytes=>[...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))].map(value=>value.toString(16).padStart(2,"0")).join("");
const participantIcon=async(env,value)=>{
  const raw=String(value||"").trim();
  if(!raw)return"";
  // Character images that already live on JIJINBOARD are usable by every viewer.
  // Keep those URLs exactly as-is instead of trying to re-import them as data URLs.
  if(/^\/api\/player-master\/icon\/[a-f0-9]{64}(?:$|[?#])/i.test(raw))return raw;
  if(/^\/api\/rooms\/[^/]+\/icons\/[a-f0-9]{64}(?:$|[?#])/i.test(raw))return raw;
  const image=dataImage(raw);
  if(!image||!env.LOGS)return"";
  const hash=await bytesHash(image.bytes),key=`icons/${hash}`;
  if(!await env.LOGS.head(key))await env.LOGS.put(key,image.bytes,{httpMetadata:{contentType:image.contentType,cacheControl:"private, max-age=31536000, immutable"},customMetadata:{sha256:hash}});
  return`r2:${key}`;
};

export async function handleBoardParticipants(request,env,boardId,roomId,personaId=""){
  if(request.method==="POST"&&!personaId){
    let body=null;
    try{body=await request.clone().json()}catch{}
    const personas=Array.isArray(body?.personas)?body.personas.slice(0,12):[];
    // A transient iframe is allowed to report zero PCs while it is still loading.
    // Never interpret that as a destructive delete. Explicit deletion has its own DELETE route.
    if(!personas.length)return json({ok:true,ignoredEmpty:true});
    const authorId=String(body?.authorId||"").slice(0,100),plName=String(body?.plName||"").trim().slice(0,80);
    if(!authorId||!plName)return json({error:"先に発言者を登録してください"},400);
    const linked=await env.DB.prepare("SELECT 1 FROM board_logs WHERE board_id=? AND room_id=?").bind(boardId,roomId).first();
    if(!linked)return json({error:"この自陣にないログです"},404);

    const old=await env.DB.prepare("SELECT persona_id,matrix_icon FROM board_log_participants WHERE board_id=? AND room_id=? AND author_id=?").bind(boardId,roomId,authorId).all();
    const oldMatrix=new Map((old.results||[]).map(row=>[String(row.persona_id),String(row.matrix_icon||"")]));
    const normalized=[];
    for(let index=0;index<personas.length;index++){
      const persona=personas[index]||{},id=String(persona.id||`persona-${index}`).slice(0,100),name=String(persona.name||"").trim().slice(0,80);
      if(!name)continue;
      normalized.push({id,name,icon:await participantIcon(env,persona.icon||persona.baseIcon||"")});
    }
    if(!normalized.length)return json({ok:true,ignoredEmpty:true});

    await env.DB.prepare("DELETE FROM board_log_participants WHERE board_id=? AND room_id=? AND author_id=?").bind(boardId,roomId,authorId).run();
    const inserts=normalized.map(persona=>env.DB.prepare("INSERT INTO board_log_participants(board_id,room_id,author_id,persona_id,pl_name,persona_name,persona_icon,matrix_icon) VALUES(?,?,?,?,?,?,?,?)").bind(boardId,roomId,authorId,persona.id,plName,persona.name,persona.icon,oldMatrix.get(persona.id)||""));
    if(inserts.length)await env.DB.batch(inserts);
    return json({ok:true,participants:normalized.length});
  }
  if(request.method==="DELETE"){
    let body=null;
    try{body=await request.json()}catch{}
    const authorId=String(body?.authorId||"").slice(0,100);
    const plName=String(body?.plName||"").trim().slice(0,80);
    const clearLegacy=!!body?.clearLegacy;
    if(!authorId)return json({error:"発言者情報がありません"},400);
    const linked=await env.DB.prepare("SELECT 1 FROM board_logs WHERE board_id=? AND room_id=?").bind(boardId,roomId).first();
    if(!linked)return json({error:"この自陣にないログです"},404);

    if(personaId){
      const changed=await env.DB.prepare("DELETE FROM board_log_participants WHERE board_id=? AND room_id=? AND author_id=? AND persona_id=?").bind(boardId,roomId,authorId,personaId).run();
      return json({ok:true,deleted:Number(changed.meta?.changes||0)});
    }

    if(clearLegacy&&plName){
      await env.DB.prepare("DELETE FROM board_log_participants WHERE board_id=? AND room_id=? AND (author_id=? OR pl_name=?)").bind(boardId,roomId,authorId,plName).run();
    }else{
      await env.DB.prepare("DELETE FROM board_log_participants WHERE board_id=? AND room_id=? AND author_id=?").bind(boardId,roomId,authorId).run();
    }
    return json({ok:true});
  }
  return null;
}
