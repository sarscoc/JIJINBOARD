const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const CHUNK_SIZE=250;
const legacyKey=roomId=>`rooms/${roomId}/log.json`;
const chunkPrefix=roomId=>`rooms/${roomId}/chunks/`;
const chunkKey=(roomId,index)=>`${chunkPrefix(roomId)}${index}.json`;
const parseLog=value=>{try{return JSON.parse(value||"{}")||{}}catch{return{}}};
const chunkCountFor=count=>Math.max(1,Math.ceil(Math.max(0,Number(count)||0)/CHUNK_SIZE));
const randomToken=(bytes=18)=>{const data=crypto.getRandomValues(new Uint8Array(bytes));return btoa(String.fromCharCode(...data)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")};

async function roomRow(env,roomId){return env.DB.prepare("SELECT id,title,log_json,admin_token,created_at FROM rooms WHERE id=?").bind(roomId).first()}
async function readLegacy(env,roomId,log){
  if(!env.LOGS)throw new Error("R2ログストレージが接続されていません");
  const object=await env.LOGS.get(log.key||legacyKey(roomId));
  if(!object)throw new Error("R2にログ本文が見つかりません");
  const stored=JSON.parse(await object.text());
  return {tabs:stored.tabs||log.tabs||[],messages:Array.isArray(stored.messages)?stored.messages:[]};
}
async function readChunked(env,roomId,log,index){
  if(!env.LOGS)throw new Error("R2ログストレージが接続されていません");
  const object=await env.LOGS.get(chunkKey(roomId,index));
  if(!object)return [];
  const value=JSON.parse(await object.text());
  return Array.isArray(value)?value:Array.isArray(value?.messages)?value.messages:[];
}
async function storeChunkObjects(env,roomId,tabs,messages){
  const chunks=[];
  for(let i=0;i<messages.length;i+=CHUNK_SIZE)chunks.push(messages.slice(i,i+CHUNK_SIZE));
  if(!chunks.length)chunks.push([]);
  for(let start=0;start<chunks.length;start+=8){
    await Promise.all(chunks.slice(start,start+8).map((chunk,offset)=>env.LOGS.put(chunkKey(roomId,start+offset),JSON.stringify(chunk),{httpMetadata:{contentType:"application/json; charset=utf-8"},customMetadata:{roomId,chunk:String(start+offset),messageCount:String(chunk.length)}})));
  }
  return {tabs:tabs||[],storage:"r2-chunks",chunkSize:CHUNK_SIZE,chunkCount:chunks.length,messageCount:messages.length,prefix:chunkPrefix(roomId)};
}
async function writeChunks(env,roomId,tabs,messages,oldKey=""){
  const meta=await storeChunkObjects(env,roomId,tabs,messages);
  await env.DB.prepare("UPDATE rooms SET log_json=? WHERE id=?").bind(JSON.stringify(meta),roomId).run();
  if(oldKey)await env.LOGS.delete(oldKey).catch(()=>{});
  return meta;
}
async function migrateLegacy(env,roomId,log,stored){
  if(log.storage==="r2-chunks")return log;
  const source=stored||await readLegacy(env,roomId,log);
  return writeChunks(env,roomId,source.tabs,source.messages,log.storage==="r2"?(log.key||legacyKey(roomId)):"");
}

export async function createStreamRoom(request,env){
  if(request.method!=="POST")return json({error:"Method not allowed"},405);
  let body=null;try{body=await request.json()}catch{}
  if(!body||!Array.isArray(body.messages)||!body.messages.length)return json({error:"ログが空です"},400);
  const ownerId=String(body.creatorId||"").slice(0,100);if(!ownerId)return json({error:"作成者情報がありません"},400);
  const serialized=JSON.stringify(body.messages);
  if(serialized.length>25_000_000)return json({error:"ログが大きすぎます（25MBまで）"},413);
  const id=randomToken(20),adminToken=randomToken(24),title=String(body.title||"TRPG LOG").slice(0,200),tabs=Array.isArray(body.tabs)?body.tabs:[];
  let meta=null;
  try{
    meta=await storeChunkObjects(env,id,tabs,body.messages);
    await env.DB.prepare("INSERT INTO rooms (id,title,log_json,admin_token,owner_id) VALUES (?,?,?,?,?)").bind(id,title,JSON.stringify(meta),adminToken,ownerId).run();
    return json({id,adminToken},201);
  }catch(error){
    if(meta)await cleanupStreamChunks(env,id,meta).catch(()=>{});
    else{
      const estimated=chunkCountFor(body.messages.length),keys=Array.from({length:estimated},(_,index)=>chunkKey(id,index));
      if(keys.length)await env.LOGS.delete(keys).catch(()=>{});
    }
    return json({error:`ログの保存に失敗しました: ${String(error?.message||error).slice(0,180)}`},500);
  }
}

export async function handleLogStream(request,env,roomId,action,arg,executionContext){
  if(request.method!=="GET")return json({error:"Method not allowed"},405);
  const row=await roomRow(env,roomId);
  if(!row)return json({error:"部屋が見つかりません"},404);
  const log=parseLog(row.log_json);

  if(action==="meta"){
    const messageCount=Number(log.messageCount)||(Array.isArray(log.messages)?log.messages.length:0);
    const count=log.storage==="r2-chunks"?Math.max(1,Number(log.chunkCount)||chunkCountFor(messageCount)):chunkCountFor(messageCount);
    return json({id:row.id,title:row.title,createdAt:row.created_at,tabs:log.tabs||[],messageCount,chunkSize:CHUNK_SIZE,chunkCount:count,streamed:true});
  }

  if(action==="chunk"){
    const index=Math.max(0,Number.parseInt(arg,10)||0);
    try{
      if(log.storage==="r2-chunks"){
        const messages=await readChunked(env,roomId,log,index);
        return json({index,messages,chunkCount:Number(log.chunkCount)||chunkCountFor(log.messageCount),messageCount:Number(log.messageCount)||0});
      }
      if(log.storage==="r2"){
        const stored=await readLegacy(env,roomId,log);
        const messages=stored.messages.slice(index*CHUNK_SIZE,(index+1)*CHUNK_SIZE);
        executionContext?.waitUntil?.(migrateLegacy(env,roomId,log,stored).catch(()=>{}));
        return json({index,messages,chunkCount:chunkCountFor(stored.messages.length),messageCount:stored.messages.length});
      }
      if(Array.isArray(log.messages)){
        const messages=log.messages.slice(index*CHUNK_SIZE,(index+1)*CHUNK_SIZE);
        executionContext?.waitUntil?.(writeChunks(env,roomId,log.tabs||[],log.messages).catch(()=>{}));
        return json({index,messages,chunkCount:chunkCountFor(log.messages.length),messageCount:log.messages.length});
      }
      return json({index,messages:[],chunkCount:1,messageCount:0});
    }catch(error){return json({error:String(error?.message||error)},500)}
  }

  if(action==="full"){
    try{
      let tabs=log.tabs||[],messages=[];
      if(log.storage==="r2-chunks"){
        const count=Math.max(1,Number(log.chunkCount)||chunkCountFor(log.messageCount));
        for(let start=0;start<count;start+=8){
          const batch=await Promise.all(Array.from({length:Math.min(8,count-start)},(_,offset)=>readChunked(env,roomId,log,start+offset)));
          batch.forEach(chunk=>messages.push(...chunk));
        }
      }else if(log.storage==="r2"){
        const stored=await readLegacy(env,roomId,log);tabs=stored.tabs;messages=stored.messages;
      }else if(Array.isArray(log.messages))messages=log.messages;
      return json({id:row.id,title:row.title,createdAt:row.created_at,tabs,messages});
    }catch(error){return json({error:String(error?.message||error)},500)}
  }

  if(action==="find"){
    const messageId=decodeURIComponent(String(arg||""));
    if(!messageId)return json({error:"message id is required"},400);
    try{
      if(log.storage==="r2-chunks"){
        const count=Math.max(1,Number(log.chunkCount)||chunkCountFor(log.messageCount));
        for(let index=0;index<count;index++){
          const messages=await readChunked(env,roomId,log,index);
          if(messages.some(message=>String(message?.id||"")===messageId))return json({index});
        }
        return json({index:-1});
      }
      const stored=log.storage==="r2"?await readLegacy(env,roomId,log):{messages:Array.isArray(log.messages)?log.messages:[]};
      const position=stored.messages.findIndex(message=>String(message?.id||"")===messageId);
      if(position>=0&&log.storage==="r2")executionContext?.waitUntil?.(migrateLegacy(env,roomId,log,{tabs:stored.tabs||log.tabs||[],messages:stored.messages}).catch(()=>{}));
      return json({index:position<0?-1:Math.floor(position/CHUNK_SIZE)});
    }catch(error){return json({error:String(error?.message||error)},500)}
  }

  return json({error:"Not found"},404);
}

export async function cleanupStreamChunks(env,roomId,logOverride=null){
  const log=logOverride||parseLog((await roomRow(env,roomId))?.log_json);
  if(log?.storage!=="r2-chunks")return;
  const count=Math.max(1,Number(log.chunkCount)||chunkCountFor(log.messageCount));
  const keys=Array.from({length:count},(_,index)=>chunkKey(roomId,index));
  for(let start=0;start<keys.length;start+=1000)await env.LOGS.delete(keys.slice(start,start+1000));
}

export async function prepareStreamRoomDelete(request,env,roomId){
  const row=await roomRow(env,roomId);
  if(!row)return json({error:"部屋が見つかりません"},404);
  const token=request.headers.get("x-admin-token")||"";
  if(!token||token!==row.admin_token)return json({error:"部屋主だけが削除できます"},403);
  await cleanupStreamChunks(env,roomId,parseLog(row.log_json));
  return null;
}
