import { randomToken,verifyRoomAdmin,deleteR2Prefix } from './data-model.js';

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const CHUNK_SIZE=120;
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

async function logRow(env,logId){return env.DB.prepare(`SELECT l.*,r.room_name,r.room_admin_token_hash FROM log l JOIN room r ON r.room_id=l.room_id WHERE l.log_id=?`).bind(logId).first()}
async function tabRows(env,logId){const result=await env.DB.prepare(`SELECT t.tab_id,t.tab_name,t.tab_sort_order,t.tab_hidden,t.created_at,t.updated_at,COUNT(c.chunk_id) AS chunk_count FROM log_tab t LEFT JOIN log_chunk c ON c.tab_id=t.tab_id WHERE t.log_id=? GROUP BY t.tab_id ORDER BY t.tab_sort_order,t.created_at`).bind(logId).all();return result.results||[]}
async function chunkRows(env,tabId){const result=await env.DB.prepare('SELECT chunk_id,chunk_index,chunk_r2_key FROM log_chunk WHERE tab_id=? ORDER BY chunk_index').bind(tabId).all();return result.results||[]}
async function readChunk(env,row,tabName){if(!env.LOGS)throw new Error('R2ログストレージが接続されていません');const object=await env.LOGS.get(row.chunk_r2_key);if(!object)return[];const payload=JSON.parse(await object.text());const lines=Array.isArray(payload)?payload:Array.isArray(payload?.lines)?payload.lines:[];return lines.map(line=>messageFromLine(line,tabName))}

async function tabMeta(env,logId){
  const tabs=await tabRows(env,logId),items=[];let total=0,totalChunks=0;
  for(const tab of tabs){
    const chunks=await chunkRows(env,tab.tab_id);let count=0;
    for(const chunk of chunks){const object=await env.LOGS.head(chunk.chunk_r2_key);count+=Number(object?.customMetadata?.lineCount)||0}
    total+=count;totalChunks+=chunks.length;
    items.push({tabId:tab.tab_id,tabName:tab.tab_name,order:Number(tab.tab_sort_order)||0,hidden:!!tab.tab_hidden,chunkCount:chunks.length,messageCount:count});
  }
  return {items,total,totalChunks};
}

async function storeTab(env,roomId,logId,tabId,tabName,messages){
  const chunks=[];
  for(let i=0;i<messages.length;i+=CHUNK_SIZE)chunks.push(messages.slice(i,i+CHUNK_SIZE));
  if(!chunks.length)chunks.push([]);
  const statements=[];
  for(let index=0;index<chunks.length;index++){
    const lines=chunks[index].map((message,offset)=>lineFromMessage(message,index*CHUNK_SIZE+offset)),key=chunkKey(roomId,logId,tabId,index),chunkId=randomToken(16);
    await env.LOGS.put(key,JSON.stringify({tab_id:tabId,tab_name:tabName,chunk_index:index,lines}),{httpMetadata:{contentType:'application/json; charset=utf-8'},customMetadata:{roomId,logId,tabId,chunk:String(index),lineCount:String(lines.length)}});
    statements.push(env.DB.prepare('INSERT INTO log_chunk(chunk_id,tab_id,chunk_index,chunk_r2_key) VALUES(?,?,?,?)').bind(chunkId,tabId,index,key));
  }
  if(statements.length)await env.DB.batch(statements);
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
  const listed=Array.isArray(body.tabs)?body.tabs.map(String).filter(Boolean):[],messageTabs=body.messages.map(message=>String(message?.tab||'')).filter(Boolean),tabs=[...new Set([...listed,...messageTabs])];if(!tabs.length)tabs.push('メイン');
  const last=await env.DB.prepare('SELECT COALESCE(MAX(log_sort_order),-1) AS value FROM log WHERE room_id=?').bind(parentRoomId).first();
  const sourceByMessage=new Map(body.messages.map((message,index)=>[message,index]));
  const createdKeys=[];
  try{
    const html=typeof body.originalHtml==='string'?body.originalHtml:'';let htmlKey=null;
    if(html){htmlKey=originalKey(parentRoomId,id);await env.LOGS.put(htmlKey,html,{httpMetadata:{contentType:'text/html; charset=utf-8'},customMetadata:{roomId:parentRoomId,logId:id}});createdKeys.push(htmlKey)}
    await env.DB.prepare('INSERT INTO log(log_id,room_id,log_name,log_sort_order,original_html_key) VALUES(?,?,?,?,?)').bind(id,parentRoomId,title,Number(last?.value)+1,htmlKey).run();
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
  const meta=await tabMeta(env,logId),tabs=meta.items.map(item=>item.tabName);

  if(action==='meta')return json({id:row.log_id,title:row.log_name,createdAt:row.created_at,tabs,messageCount:meta.total,chunkSize:CHUNK_SIZE,chunkCount:Math.max(1,meta.totalChunks),tabStreams:meta.items,streamed:true});

  if(action==='chunk'){
    const index=Math.max(0,Number.parseInt(arg,10)||0),url=new URL(request.url),requestedTab=url.searchParams.get('tab')||'',requestedTabId=url.searchParams.get('tabId')||'';
    if(requestedTab||requestedTabId){
      const tab=meta.items.find(item=>requestedTabId?item.tabId===requestedTabId:item.tabName===requestedTab);if(!tab)return json({error:'タブが見つかりません'},404);
      const chunks=await chunkRows(env,tab.tabId),chunk=chunks.find(item=>Number(item.chunk_index)===index),messages=chunk?await readChunk(env,chunk,tab.tabName):[];
      return json({index,tab:tab.tabName,tabId:tab.tabId,messages,chunkCount:Math.max(1,tab.chunkCount),messageCount:tab.messageCount});
    }
    let virtual=index;
    for(const tab of meta.items){
      if(virtual<tab.chunkCount){const chunks=await chunkRows(env,tab.tabId),chunk=chunks.find(item=>Number(item.chunk_index)===virtual),messages=chunk?await readChunk(env,chunk,tab.tabName):[];return json({index,messages,chunkCount:Math.max(1,meta.totalChunks),messageCount:meta.total,tab:tab.tabName,tabId:tab.tabId})}
      virtual-=tab.chunkCount;
    }
    return json({index,messages:[],chunkCount:Math.max(1,meta.totalChunks),messageCount:meta.total});
  }

  if(action==='full'){
    const messages=[];
    for(const tab of meta.items){for(const chunk of await chunkRows(env,tab.tabId))messages.push(...await readChunk(env,chunk,tab.tabName))}
    messages.sort((a,b)=>(Number(a.sourceIndex)||0)-(Number(b.sourceIndex)||0));
    return json({id:row.log_id,title:row.log_name,createdAt:row.created_at,tabs,messages});
  }

  if(action==='find'){
    const messageId=decodeURIComponent(String(arg||''));if(!messageId)return json({error:'message id is required'},400);
    let globalIndex=0;
    for(const tab of meta.items){
      for(const chunk of await chunkRows(env,tab.tabId)){
        const messages=await readChunk(env,chunk,tab.tabName);
        if(messages.some(message=>String(message?.id||'')===messageId))return json({index:Number(chunk.chunk_index),globalIndex,tab:tab.tabName,tabId:tab.tabId});
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
