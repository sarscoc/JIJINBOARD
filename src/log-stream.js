import { randomToken,verifyRoomAdmin,deleteR2Prefix } from './data-model.js';

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const CHUNK_SIZE=120;
const IO_CONCURRENCY=4;
const DB_BATCH_SIZE=50;
const padChunk=index=>String(index+1).padStart(4,'0');
const chunkKey=(roomId,logId,tabId,index)=>`rooms/${roomId}/logs/${logId}/tabs/${tabId}/chunk-${padChunk(index)}.json`;
const originalKey=(roomId,logId)=>`rooms/${roomId}/logs/${logId}/original.html`;

const lineFromMessage=(message,index)=>({
  line_id:String(message?.id||`m${index}`),
  speaker_name:String(message?.speaker||''),
  message_body:String(message?.text||''),
  speaker_color:String(message?.color||''),
  message_timestamp:String(message?.time||''),
  source_order:Number.isFinite(Number(message?.sourceIndex))?Number(message.sourceIndex):index,
  dice_roll_data:message?.diceroll??null,
  system_message_data:message?.system??null
});
const messageFromLine=(line,tabName)=>({
  id:String(line?.line_id||''),speaker:String(line?.speaker_name||''),text:String(line?.message_body||''),color:String(line?.speaker_color||''),time:String(line?.message_timestamp||''),tab:tabName,sourceIndex:Number(line?.source_order)||0,diceroll:line?.dice_roll_data??null,system:line?.system_message_data??null
});

async function mapConcurrent(items,limit,worker){
  const results=new Array(items.length);let cursor=0;
  async function run(){
    while(true){const index=cursor++;if(index>=items.length)return;results[index]=await worker(items[index],index)}
  }
  await Promise.all(Array.from({length:Math.min(Math.max(1,limit),items.length)},run));
  return results;
}
async function runBatches(env,statements,size=DB_BATCH_SIZE){for(let i=0;i<statements.length;i+=size)await env.DB.batch(statements.slice(i,i+size))}

async function logRow(env,logId){return env.DB.prepare(`SELECT l.*,r.room_name,r.room_admin_token_hash FROM log l JOIN room r ON r.room_id=l.room_id WHERE l.log_id=?`).bind(logId).first()}
async function tabRows(env,logId){const result=await env.DB.prepare(`SELECT t.tab_id,t.tab_name,t.tab_sort_order,t.tab_hidden,t.created_at,t.updated_at,COUNT(c.chunk_id) AS chunk_count FROM log_tab t LEFT JOIN log_chunk c ON c.tab_id=t.tab_id WHERE t.log_id=? GROUP BY t.tab_id ORDER BY t.tab_sort_order,t.created_at`).bind(logId).all();return result.results||[]}
async function chunkRows(env,tabId){const result=await env.DB.prepare('SELECT chunk_id,chunk_index,chunk_r2_key FROM log_chunk WHERE tab_id=? ORDER BY chunk_index').bind(tabId).all();return result.results||[]}
async function readChunk(env,row,tabName){if(!env.LOGS)throw new Error('R2ログストレージが接続されていません');const object=await env.LOGS.get(row.chunk_r2_key);if(!object)return[];const payload=JSON.parse(await object.text());const lines=Array.isArray(payload)?payload:Array.isArray(payload?.lines)?payload.lines:[];return lines.map(line=>messageFromLine(line,tabName))}
async function tabMessageCount(env,chunks){
  if(!chunks.length)return 0;
  const last=chunks[chunks.length-1],object=await env.LOGS.head(last.chunk_r2_key),lastCount=Number(object?.customMetadata?.lineCount)||0;
  return Math.max(0,chunks.length-1)*CHUNK_SIZE+lastCount;
}
async function tabMeta(env,logId){
  const tabs=await tabRows(env,logId);
  const items=await mapConcurrent(tabs,IO_CONCURRENCY,async tab=>{
    const chunks=await chunkRows(env,tab.tab_id),count=await tabMessageCount(env,chunks);
    return {tabId:tab.tab_id,tabName:tab.tab_name,order:Number(tab.tab_sort_order)||0,hidden:!!tab.tab_hidden,chunkCount:chunks.length,messageCount:count};
  });
  return {items,total:items.reduce((sum,item)=>sum+item.messageCount,0),totalChunks:items.reduce((sum,item)=>sum+item.chunkCount,0)};
}

async function storeTab(env,roomId,logId,tabId,tabName,messages){
  const chunks=[];
  for(let i=0;i<messages.length;i+=CHUNK_SIZE)chunks.push(messages.slice(i,i+CHUNK_SIZE));
  if(!chunks.length)chunks.push([]);
  const statements=await mapConcurrent(chunks,IO_CONCURRENCY,async(chunk,index)=>{
    const lines=chunk.map((message,offset)=>lineFromMessage(message,index*CHUNK_SIZE+offset)),key=chunkKey(roomId,logId,tabId,index),chunkId=randomToken(16);
    await env.LOGS.put(key,JSON.stringify({tab_id:tabId,tab_name:tabName,chunk_index:index,lines}),{httpMetadata:{contentType:'application/json; charset=utf-8'},customMetadata:{roomId,logId,tabId,chunk:String(index),lineCount:String(lines.length)}});
    return env.DB.prepare('INSERT INTO log_chunk(chunk_id,tab_id,chunk_index,chunk_r2_key) VALUES(?,?,?,?)').bind(chunkId,tabId,index,key);
  });
  if(statements.length)await runBatches(env,statements);
}

export async function createStreamRoom(request,env){
  if(request.method!=='POST')return json({error:'Method not allowed'},405);
  let body=null;try{body=await request.json()}catch{}
  if(!body||!Array.isArray(body.messages)||!body.messages.length)return json({error:'ログが空です'},400);
  const parentRoomId=String(body.boardId||body.parentRoomId||'').slice(0,160);
  if(!parentRoomId)return json({error:'ログを保存するルームが指定されていません'},400);
  const adminToken=request.headers.get('x-board-admin-token')||request.headers.get('x-admin-token')||'';
  if(!await verifyRoomAdmin(env.DB,parentRoomId,adminToken))return json({error:'このルームへログを追加できるのは部屋主だけです'},403);
  const serialized=JSON.stringify(body.messages);if(serialized.length>25_000_000)return json({error:'ログが大きすぎます（25MBまで）'},413);
  const id=randomToken(20),title=String(body.title||'TRPG LOG').slice(0,200);
  const scenarioTitle=String(body.scenarioTitle||title).trim().slice(0,120),scenarioParticipants=String(body.scenarioParticipants||'').trim().slice(0,300),spoiler=body.spoiler?1:0;
  const displayMode=body.logDisplayMode==='dark'?'dark':'light';
  const listed=Array.isArray(body.tabs)?body.tabs.map(String).filter(Boolean):[],messageTabs=body.messages.map(message=>String(message?.tab||'')).filter(Boolean),tabs=[...new Set([...listed,...messageTabs])];if(!tabs.length)tabs.push('メイン');
  const last=await env.DB.prepare('SELECT COALESCE(MAX(log_sort_order),-1) AS value FROM log WHERE room_id=?').bind(parentRoomId).first();
  const sourceByMessage=new Map(body.messages.map((message,index)=>[message,index]));
  try{
    const html=typeof body.originalHtml==='string'?body.originalHtml:'';let htmlKey=null;
    if(html){htmlKey=originalKey(parentRoomId,id);await env.LOGS.put(htmlKey,html,{httpMetadata:{contentType:'text/html; charset=utf-8'},customMetadata:{roomId:parentRoomId,logId:id}})}
    await env.DB.prepare('INSERT INTO log(log_id,room_id,log_name,scenario_title,scenario_participants,spoiler_enabled,log_sort_order,log_display_mode,original_html_key) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,parentRoomId,title,scenarioTitle,scenarioParticipants,spoiler,Number(last?.value)+1,displayMode,htmlKey).run();
    for(let order=0;order<tabs.length;order++){
      const tabName=tabs[order],tabId=randomToken(16);
      await env.DB.prepare('INSERT INTO log_tab(tab_id,log_id,tab_name,tab_sort_order) VALUES(?,?,?,?)').bind(tabId,id,tabName,order).run();
      const messages=body.messages.filter(message=>String(message?.tab||tabs[0])===tabName).map(message=>({...message,sourceIndex:Number.isFinite(Number(message?.sourceIndex))?Number(message.sourceIndex):sourceByMessage.get(message)}));
      await storeTab(env,parentRoomId,id,tabId,tabName,messages);
    }
    return json({id,adminToken,title,roomId:parentRoomId},201);
  }catch(error){
    await deleteR2Prefix(env.LOGS,`rooms/${parentRoomId}/logs/${id}/`).catch(()=>{});
    await env.DB.prepare('DELETE FROM log WHERE log_id=?').bind(id).run().catch(()=>{});
    return json({error:`ログの保存に失敗しました: ${String(error?.message||error).slice(0,180)}`},500);
  }
}

export async function handleLogStream(request,env,logId,action,arg){
  if(request.method!=='GET')return json({error:'Method not allowed'},405);
  const row=await logRow(env,logId);if(!row)return json({error:'部屋が見つかりません'},404);

  if(action==='meta'){
    const meta=await tabMeta(env,logId),tabs=meta.items.map(item=>item.tabName);
    return json({id:row.log_id,title:row.log_name,createdAt:row.created_at,tabs,messageCount:meta.total,chunkSize:CHUNK_SIZE,chunkCount:Math.max(1,meta.totalChunks),tabStreams:meta.items,streamed:true});
  }

  const tabs=await tabRows(env,logId);
  if(action==='chunk'){
    const index=Math.max(0,Number.parseInt(arg,10)||0),url=new URL(request.url),requestedTab=url.searchParams.get('tab')||'',requestedTabId=url.searchParams.get('tabId')||'';
    if(requestedTab||requestedTabId){
      const tab=tabs.find(item=>requestedTabId?item.tab_id===requestedTabId:item.tab_name===requestedTab);if(!tab)return json({error:'タブが見つかりません'},404);
      const chunks=await chunkRows(env,tab.tab_id),chunk=chunks.find(item=>Number(item.chunk_index)===index),messages=chunk?await readChunk(env,chunk,tab.tab_name):[],messageCount=await tabMessageCount(env,chunks);
      return json({index,tab:tab.tab_name,tabId:tab.tab_id,messages,chunkCount:Math.max(1,chunks.length),messageCount});
    }
    let virtual=index,totalChunks=0;for(const tab of tabs)totalChunks+=Number(tab.chunk_count)||0;
    for(const tab of tabs){
      const count=Number(tab.chunk_count)||0;
      if(virtual<count){const chunks=await chunkRows(env,tab.tab_id),chunk=chunks.find(item=>Number(item.chunk_index)===virtual),messages=chunk?await readChunk(env,chunk,tab.tab_name):[];return json({index,messages,chunkCount:Math.max(1,totalChunks),tab:tab.tab_name,tabId:tab.tab_id})}
      virtual-=count;
    }
    return json({index,messages:[],chunkCount:Math.max(1,totalChunks)});
  }

  if(action==='full'){
    const messages=[];
    for(const tab of tabs){for(const chunk of await chunkRows(env,tab.tab_id))messages.push(...await readChunk(env,chunk,tab.tab_name))}
    messages.sort((a,b)=>(Number(a.sourceIndex)||0)-(Number(b.sourceIndex)||0));
    return json({id:row.log_id,title:row.log_name,createdAt:row.created_at,tabs:tabs.map(tab=>tab.tab_name),messages});
  }

  if(action==='find'){
    const messageId=decodeURIComponent(String(arg||''));if(!messageId)return json({error:'message id is required'},400);
    let globalIndex=0;
    for(const tab of tabs){
      for(const chunk of await chunkRows(env,tab.tab_id)){
        const messages=await readChunk(env,chunk,tab.tab_name);
        if(messages.some(message=>String(message?.id||'')===messageId))return json({index:Number(chunk.chunk_index),globalIndex,tab:tab.tab_name,tabId:tab.tab_id});
        globalIndex++;
      }
    }
    return json({index:-1,globalIndex:-1});
  }
  return json({error:'Not found'},404);
}

export async function cleanupStreamChunks(env,logId){
  const row=await logRow(env,logId);if(!row)return;
  await deleteR2Prefix(env.LOGS,`rooms/${row.room_id}/logs/${logId}/`);
}

export async function prepareStreamRoomDelete(request,env,logId){
  const row=await logRow(env,logId);if(!row)return json({error:'部屋が見つかりません'},404);
  const token=request.headers.get('x-admin-token')||request.headers.get('x-board-admin-token')||'';
  if(!await verifyRoomAdmin(env.DB,row.room_id,token))return json({error:'部屋主だけが削除できます'},403);
  await cleanupStreamChunks(env,logId);
  return null;
}
