import { randomToken,verifyRoomAdmin,deleteR2Prefix } from './data-model.js';

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const CHUNK_SIZE=120;
const IO_CONCURRENCY=8;
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
  async function run(){while(true){const index=cursor++;if(index>=items.length)return;results[index]=await worker(items[index],index)}}
  const workers=await Promise.allSettled(Array.from({length:Math.min(Math.max(1,limit),items.length)},run));
  const failed=workers.find(result=>result.status==='rejected');
  if(failed)throw failed.reason;
  return results;
}
async function logRow(env,logId){return env.DB.prepare('SELECT log_id,room_id,log_name,created_at FROM log WHERE log_id=?').bind(logId).first()}
async function tabRows(env,logId){const result=await env.DB.prepare(`SELECT t.tab_id,t.tab_name,t.tab_sort_order,t.tab_hidden,COUNT(c.chunk_id) AS chunk_count FROM log_tab t LEFT JOIN log_chunk c ON c.tab_id=t.tab_id WHERE t.log_id=? GROUP BY t.tab_id ORDER BY t.tab_sort_order,t.created_at`).bind(logId).all();return result.results||[]}
async function chunkRows(env,tabId){const result=await env.DB.prepare('SELECT chunk_id,chunk_index,chunk_r2_key FROM log_chunk WHERE tab_id=? ORDER BY chunk_index').bind(tabId).all();return result.results||[]}
async function readChunk(env,row,tabName){if(!env.LOGS)throw new Error('R2ログストレージが接続されていません');const object=await env.LOGS.get(row.chunk_r2_key);if(!object)return[];const payload=JSON.parse(await object.text());const lines=Array.isArray(payload)?payload:Array.isArray(payload?.lines)?payload.lines:[];return lines.map(line=>messageFromLine(line,tabName))}

function buildUploadPlan(roomId,logId,tabs,grouped){
  const tabRows=[],chunks=[];
  tabs.forEach((tabName,order)=>{
    const tabId=randomToken(16),messages=grouped.get(tabName)||[];
    tabRows.push({tabId,tabName,order});
    if(!messages.length){chunks.push({tabId,tabName,index:0,messages:[]});return}
    for(let start=0,index=0;start<messages.length;start+=CHUNK_SIZE,index++)chunks.push({tabId,tabName,index,messages:messages.slice(start,start+CHUNK_SIZE)});
  });
  return {tabRows,chunks};
}

export async function createStreamRoom(request,env){
  if(request.method!=='POST')return json({error:'Method not allowed'},405);
  let body=null;try{body=await request.json()}catch{}
  if(!body||!Array.isArray(body.messages)||!body.messages.length)return json({error:'ログが空です'},400);
  const parentRoomId=String(body.boardId||body.parentRoomId||'').slice(0,160);if(!parentRoomId)return json({error:'ログを保存するルームが指定されていません'},400);
  const adminToken=request.headers.get('x-board-admin-token')||request.headers.get('x-admin-token')||'';if(!await verifyRoomAdmin(env.DB,parentRoomId,adminToken))return json({error:'このルームへログを追加できるのは部屋主だけです'},403);
  const serialized=JSON.stringify(body.messages);if(serialized.length>25_000_000)return json({error:'ログが大きすぎます（25MBまで）'},413);
  const id=randomToken(20),title=String(body.title||'TRPG LOG').slice(0,200),scenarioTitle=String(body.scenarioTitle||title).trim().slice(0,120),scenarioParticipants=String(body.scenarioParticipants||'').trim().slice(0,300),spoiler=body.spoiler?1:0,displayMode=body.logDisplayMode==='dark'?'dark':'light';
  const listed=Array.isArray(body.tabs)?body.tabs.map(String).filter(Boolean):[],grouped=new Map();
  body.messages.forEach((message,index)=>{const tab=String(message?.tab||listed[0]||'メイン');if(!grouped.has(tab))grouped.set(tab,[]);grouped.get(tab).push({...message,sourceIndex:Number.isFinite(Number(message?.sourceIndex))?Number(message.sourceIndex):index})});
  const tabs=[...new Set([...listed,...grouped.keys()])];if(!tabs.length)tabs.push('メイン');
  const {tabRows:plannedTabs,chunks:plannedChunks}=buildUploadPlan(parentRoomId,id,tabs,grouped);
  const last=await env.DB.prepare('SELECT COALESCE(MAX(log_sort_order),-1) AS value FROM log WHERE room_id=?').bind(parentRoomId).first();
  const html=typeof body.originalHtml==='string'?body.originalHtml:'',htmlKey=html?originalKey(parentRoomId,id):null;
  try{
    const htmlUpload=html?env.LOGS.put(htmlKey,html,{httpMetadata:{contentType:'text/html; charset=utf-8'},customMetadata:{roomId:parentRoomId,logId:id}}):Promise.resolve();
    const chunkUpload=mapConcurrent(plannedChunks,IO_CONCURRENCY,async chunk=>{
      const lines=chunk.messages.map((message,offset)=>lineFromMessage(message,chunk.index*CHUNK_SIZE+offset)),key=chunkKey(parentRoomId,id,chunk.tabId,chunk.index),chunkId=randomToken(16);
      await env.LOGS.put(key,JSON.stringify({tab_id:chunk.tabId,tab_name:chunk.tabName,chunk_index:chunk.index,lines}),{httpMetadata:{contentType:'application/json; charset=utf-8'},customMetadata:{roomId:parentRoomId,logId:id,tabId:chunk.tabId,chunk:String(chunk.index),lineCount:String(lines.length)}});
      return env.DB.prepare('INSERT INTO log_chunk(chunk_id,tab_id,chunk_index,chunk_r2_key) VALUES(?,?,?,?)').bind(chunkId,chunk.tabId,chunk.index,key);
    });
    const [htmlResult,chunkResult]=await Promise.allSettled([htmlUpload,chunkUpload]);
    if(htmlResult.status==='rejected')throw htmlResult.reason;
    if(chunkResult.status==='rejected')throw chunkResult.reason;
    const chunkStatements=chunkResult.value;
    await env.DB.batch([
      env.DB.prepare('INSERT INTO log(log_id,room_id,log_name,scenario_title,scenario_participants,spoiler_enabled,log_sort_order,log_display_mode,original_html_key) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,parentRoomId,title,scenarioTitle,scenarioParticipants,spoiler,Number(last?.value)+1,displayMode,htmlKey),
      ...plannedTabs.map(tab=>env.DB.prepare('INSERT INTO log_tab(tab_id,log_id,tab_name,tab_sort_order) VALUES(?,?,?,?)').bind(tab.tabId,id,tab.tabName,tab.order)),
      ...chunkStatements
    ]);
    return json({id,adminToken,title,roomId:parentRoomId},201);
  }catch(error){await deleteR2Prefix(env.LOGS,`rooms/${parentRoomId}/logs/${id}/`).catch(()=>{});await env.DB.prepare('DELETE FROM log WHERE log_id=?').bind(id).run().catch(()=>{});return json({error:`ログの保存に失敗しました: ${String(error?.message||error).slice(0,180)}`},500)}
}

// An interrupted legacy upload could leave tab rows and files without a chunk index.
async function unindexedChunks(env,roomId,logId,tabs){
  const prefix=`rooms/${roomId}/logs/${logId}/tabs/`,names=new Map(tabs.map(tab=>[tab.tab_id,tab.tab_name]));
  const objects=[];
  let cursor;
  do{
    const page=await env.LOGS.list({prefix,cursor});
    objects.push(...page.objects);
    cursor=page.truncated?page.cursor:undefined;
  }while(cursor);
  return objects.flatMap(({key})=>{
    if(!key.startsWith(prefix))return [];
    const match=key.slice(prefix.length).match(/^([^/]+)\/chunk-(\d+)\.json$/);
    return match&&names.has(match[1])&&Number(match[2])>0?[{chunk_r2_key:key,tabId:match[1],tab:names.get(match[1]),index:Number(match[2])-1}]:[];
  });
}

async function directChunk(request,env,logId,index){
  const url=new URL(request.url),requestedTab=url.searchParams.get('tab')||'',requestedTabId=url.searchParams.get('tabId')||'';if(!requestedTab&&!requestedTabId)return json({error:'tab is required'},400);
  const where=requestedTabId?'t.tab_id=?':'t.tab_name=?',value=requestedTabId?requestedTabId:requestedTab;
  let row=await env.DB.prepare(`SELECT t.tab_id,t.tab_name,c.chunk_r2_key FROM log_tab t JOIN log_chunk c ON c.tab_id=t.tab_id WHERE t.log_id=? AND ${where} AND c.chunk_index=? LIMIT 1`).bind(logId,value,index).first();
  if(!row&&url.searchParams.get('recovered')==='1'){
    const tab=await env.DB.prepare(`SELECT l.room_id,t.tab_id,t.tab_name FROM log_tab t JOIN log l ON l.log_id=t.log_id WHERE t.log_id=? AND ${where} LIMIT 1`).bind(logId,value).first();
    if(tab)row={...tab,chunk_r2_key:chunkKey(tab.room_id,logId,tab.tab_id,index)};
  }
  if(!row)return json({index,tab:requestedTab,tabId:requestedTabId,messages:[]});
  const messages=await readChunk(env,row,row.tab_name),response=json({index,tab:row.tab_name,tabId:row.tab_id,messages});
  response.headers.set('cache-control','no-store');return response;
}

export async function handleLogStream(request,env,logId,action,arg){
  if(request.method!=='GET')return json({error:'Method not allowed'},405);
  if(action==='chunk'){const index=Math.max(0,Number.parseInt(arg,10)||0);return directChunk(request,env,logId,index)}
  const row=await logRow(env,logId);if(!row)return json({error:'部屋が見つかりません'},404);
  const tabs=await tabRows(env,logId);
  const indexed=tabs.some(tab=>Number(tab.chunk_count)>0);
  if(action==='meta'){
    const items=tabs.map(tab=>({tabId:tab.tab_id,tabName:tab.tab_name,order:Number(tab.tab_sort_order)||0,hidden:!!tab.tab_hidden,chunkCount:Number(tab.chunk_count)||0,messageCount:null}));
    const firstTab=new URL(request.url).searchParams.get('firstTab');
    let first=null;
    // Recover R2 chunks for legacy uploads even when the client does not request firstTab.
    // Otherwise the tab list reports zero chunks and HO tabs appear unreadable.
    if(!indexed){
      const recovered=await unindexedChunks(env,row.room_id,logId,tabs);
      for(const item of items){
        item.recoveredIndexes=recovered.filter(chunk=>chunk.tabId===item.tabId).map(chunk=>chunk.index).sort((a,b)=>a-b);
        item.chunkCount=item.recoveredIndexes.length;
      }
    }
    if(firstTab!==null){
      const visible=items.filter(item=>!item.hidden);
      const preferred=visible.find(item=>item.tabName===firstTab)||visible.find(item=>item.tabName==='メイン')||visible[0];
      if(preferred){
        const chunk=preferred.recoveredIndexes
          ? (preferred.chunkCount?{chunk_r2_key:chunkKey(row.room_id,logId,preferred.tabId,preferred.recoveredIndexes[0])}:null)
          : (await chunkRows(env,preferred.tabId))[0];
        first={tab:preferred.tabName,messages:chunk?await readChunk(env,chunk,preferred.tabName):[]};
      }
    }
    return json({id:row.log_id,title:row.log_name,createdAt:row.created_at,tabs:items.map(item=>item.tabName),messageCount:null,chunkSize:CHUNK_SIZE,chunkCount:items.reduce((sum,item)=>sum+item.chunkCount,0),tabStreams:items,streamed:true,first});
  }
  if(action==='full'){
    let messages=[];
    if(indexed){
      for(const tab of tabs){
        const chunks=await chunkRows(env,tab.tab_id);
        const parts=await mapConcurrent(chunks,IO_CONCURRENCY,chunk=>readChunk(env,chunk,tab.tab_name));
        for(const part of parts)messages.push(...part);
      }
    }else{
      const chunks=await unindexedChunks(env,row.room_id,logId,tabs);
      messages=(await mapConcurrent(chunks,IO_CONCURRENCY,chunk=>readChunk(env,chunk,chunk.tab))).flat();
      if(!messages.length)return json({error:'このログの本文が保存先に見つかりません。元のファイルから追加し直してください。'},404);
    }
    messages.sort((a,b)=>(Number(a.sourceIndex)||0)-(Number(b.sourceIndex)||0));return json({id:row.log_id,title:row.log_name,createdAt:row.created_at,tabs:tabs.map(tab=>tab.tab_name),messages});
  }
  if(action==='find'){
    const messageId=decodeURIComponent(String(arg||''));if(!messageId)return json({error:'message id is required'},400);let globalIndex=0;
    for(const tab of tabs){for(const chunk of await chunkRows(env,tab.tab_id)){const messages=await readChunk(env,chunk,tab.tab_name);if(messages.some(message=>String(message?.id||'')===messageId))return json({index:Number(chunk.chunk_index),globalIndex,tab:tab.tab_name,tabId:tab.tab_id});globalIndex++}}
    return json({index:-1,globalIndex:-1});
  }
  return json({error:'Not found'},404);
}

export async function prepareStreamRoomDelete(request,env,logId){const row=await env.DB.prepare('SELECT l.log_id,l.room_id,r.room_admin_token_hash FROM log l JOIN room r ON r.room_id=l.room_id WHERE l.log_id=?').bind(logId).first();if(!row)return json({error:'部屋が見つかりません'},404);const token=request.headers.get('x-admin-token')||request.headers.get('x-board-admin-token')||'';if(!await verifyRoomAdmin(env.DB,row.room_id,token))return json({error:'部屋主だけが削除できます'},403);return null}

