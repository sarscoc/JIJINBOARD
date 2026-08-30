const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});

export async function handleBoardParticipants(request,env,boardId,roomId){
  if(request.method==="POST"){
    let body=null;
    try{body=await request.clone().json()}catch{}
    const personas=Array.isArray(body?.personas)?body.personas:[];
    // A transient iframe is allowed to report zero PCs while it is still loading.
    // Never interpret that as a destructive delete. Explicit deletion has its own DELETE route.
    if(!personas.length)return json({ok:true,ignoredEmpty:true});
    return null;
  }
  if(request.method==="DELETE"){
    let body=null;
    try{body=await request.json()}catch{}
    const authorId=String(body?.authorId||"").slice(0,100);
    if(!authorId)return json({error:"発言者情報がありません"},400);
    const linked=await env.DB.prepare("SELECT 1 FROM board_logs WHERE board_id=? AND room_id=?").bind(boardId,roomId).first();
    if(!linked)return json({error:"この自陣にないログです"},404);
    await env.DB.prepare("DELETE FROM board_log_participants WHERE board_id=? AND room_id=? AND author_id=?").bind(boardId,roomId,authorId).run();
    return json({ok:true});
  }
  return null;
}
