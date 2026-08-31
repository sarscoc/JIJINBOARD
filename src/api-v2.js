import { randomToken,tokenHash,ensurePlIdentity,resolveCharacterIdentity,storeImage,imageReference,verifyRoomAdmin,parentRoomForLog,bumpRoomRevision,deleteR2Prefix } from './data-model.js';

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const safeBody=async request=>{try{return await request.json()}catch{return null}};
const publicIcon=key=>{if(!key)return'';const clean=String(key).replace(/^r2:/,''),hash=clean.split('/').pop();return `/api/player-master/icon/${encodeURIComponent(hash)}`};
const roomHub=(env,roomId)=>env.ROOMS?env.ROOMS.get(env.ROOMS.idFromName(roomId)):null;
const notifyRoom=(context,env,roomId,action,request,data=null)=>{const hub=roomHub(env,roomId);if(!hub)return;const excludeClientId=String(request?.headers.get('x-realtime-client')||'').slice(0,100);context.waitUntil(hub.fetch('https://room/notify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,excludeClientId,data})}).catch(()=>{}))};

async function ensureLog(env,logId){return parentRoomForLog(env.DB,logId)}
async function ensureRoom(env,roomId){return env.DB.prepare('SELECT * FROM room WHERE room_id=?').bind(roomId).first()}
async function roomAdmin(request,env,roomId){return verifyRoomAdmin(env.DB,roomId,request.headers.get('x-board-admin-token')||request.headers.get('x-admin-token')||'')}

async function boardPayload(env,room){
  const logsResult=await env.DB.prepare('SELECT log_id,log_name,scenario_title,spoiler_enabled,log_sort_order,created_at FROM log WHERE room_id=? ORDER BY log_sort_order,created_at').bind(room.room_id).all();
  const participantsResult=await env.DB.prepare(`SELECT lp.log_id,c.character_id,c.character_name,c.character_icon_key,c.matrix_icon_key,c.character_type,p.pl_id,p.pl_name
    FROM log_participant lp JOIN character c ON c.character_id=lp.character_id JOIN pl p ON p.pl_id=c.pl_id
    JOIN log l ON l.log_id=lp.log_id WHERE l.room_id=? ORDER BY lp.participant_sort_order,lp.created_at,c.character_name`).bind(room.room_id).all();
  const participants=new Map();
  for(const item of participantsResult.results||[]){
    const list=participants.get(item.log_id)||[];
    list.push({authorId:item.pl_id,personaId:item.character_id,plName:item.pl_name,name:item.character_name,icon:publicIcon(item.matrix_icon_key||item.character_icon_key),baseIcon:publicIcon(item.character_icon_key),matrixIcon:publicIcon(item.matrix_icon_key)});
    participants.set(item.log_id,list);
  }
  return {id:room.room_id,name:room.room_name,createdAt:room.created_at,logs:(logsResult.results||[]).map((item,index)=>({roomId:item.log_id,title:item.log_name||'LOG',order:Number(item.log_sort_order)||index,spoiler:!!item.spoiler_enabled,scenarioTitle:item.scenario_title||'',scenarioParticipants:(participants.get(item.log_id)||[]).map(person=>person.name).join(' / '),createdAt:item.created_at,participants:participants.get(item.log_id)||[]}))};
}

async function participantIdentity(env,body){
  const plId=String(body?.authorId||'').slice(0,120),authorName=String(body?.authorName||body?.plName||body?.personaName||'PL').trim().slice(0,80)||'PL';
  const plIconKey=await storeImage(env.LOGS,String(body?.plIcon||''),'pl-icons');
  await ensurePlIdentity(env.DB,plId,authorName,{plIconKey});
  const type=String(body?.personaType||'PL').toUpperCase();
  if(type==='PL')return {plId,characterId:null};
  const iconKey=await storeImage(env.LOGS,String(body?.personaIcon||''),'character-icons');
  const character=await resolveCharacterIdentity(env.DB,plId,String(body?.personaName||''),type,{plName:authorName,iconKey,characterId:body?.characterId});
  if(character&&iconKey&&!character.character_icon_key)await env.DB.prepare('UPDATE character SET character_icon_key=?,updated_at=CURRENT_TIMESTAMP WHERE character_id=?').bind(iconKey,character.character_id).run();
  return {plId,characterId:character?.character_id||null};
}

async function legacyCommentRows(env,roomId,viewer,targetType,targetId=null){
  const params=[viewer,roomId,targetType],where=['c.room_id=?','c.comment_target_type=?'];if(targetId!==null){where.push('c.comment_target_id=?');params.push(targetId)}
  const result=await env.DB.prepare(`SELECT c.comment_id,c.author_pl_id,c.author_character_id,c.comment_target_id,c.comment_body,c.comment_image_key,c.parent_comment_id,c.created_at,c.updated_at,
    p.pl_name,p.pl_icon_key,ch.character_name,ch.character_type,ch.character_icon_key,
    (SELECT COUNT(*) FROM comment_reaction r WHERE r.comment_id=c.comment_id) AS like_count,
    EXISTS(SELECT 1 FROM comment_reaction r WHERE r.comment_id=c.comment_id AND r.author_pl_id=?) AS liked_by_me
    FROM comment c JOIN pl p ON p.pl_id=c.author_pl_id LEFT JOIN character ch ON ch.character_id=c.author_character_id
    WHERE ${where.join(' AND ')} ORDER BY c.created_at,c.comment_id`).bind(...params).all();
  return result.results||[];
}

async function toggleReaction(env,commentId,authorId){
  if(!authorId)return null;
  await ensurePlIdentity(env.DB,authorId,'PL');
  const old=await env.DB.prepare('SELECT 1 FROM comment_reaction WHERE comment_id=? AND author_pl_id=?').bind(commentId,authorId).first();
  if(old)await env.DB.prepare('DELETE FROM comment_reaction WHERE comment_id=? AND author_pl_id=?').bind(commentId,authorId).run();
  else await env.DB.prepare('INSERT INTO comment_reaction(comment_id,author_pl_id) VALUES(?,?)').bind(commentId,authorId).run();
  return !old;
}

async function descendantIds(db,rootId){
  const result=await db.prepare(`WITH RECURSIVE d(comment_id) AS (SELECT comment_id FROM comment WHERE comment_id=? UNION ALL SELECT c.comment_id FROM comment c JOIN d ON c.parent_comment_id=d.comment_id) SELECT comment_id FROM d`).bind(rootId).all();
  return (result.results||[]).map(row=>row.comment_id);
}

const matrixStateId=roomId=>`__matrix_state__:${roomId}`;
async function getMatrixState(env,roomId){
  const row=await env.DB.prepare('SELECT template_definition,updated_at FROM matrix_template WHERE template_id=? AND room_id=?').bind(matrixStateId(roomId),roomId).first();
  let state={};try{state=row?JSON.parse(row.template_definition||'{}'): {}}catch{}
  state=state&&typeof state==='object'?state:{};state.items=state.items&&typeof state.items==='object'?state.items:{};
  const points=await env.DB.prepare('SELECT point_id,is_placed,point_x,point_y,template_x,template_y,scale_base_width,coordinate_version,supplement_body FROM matrix_point WHERE room_id=?').bind(roomId).all();
  for(const point of points.results||[]){
    const item=state.items[point.point_id]&&typeof state.items[point.point_id]==='object'?state.items[point.point_id]:{};
    item.placed=!!point.is_placed;if(point.point_x!==null)item.x=Number(point.point_x);if(point.point_y!==null)item.y=Number(point.point_y);if(point.template_x!==null)item.templateX=Number(point.template_x);if(point.template_y!==null)item.templateY=Number(point.template_y);if(point.scale_base_width!==null)item.scaleBaseWidth=Number(point.scale_base_width);item.coordVersion=Number(point.coordinate_version)||0;if(point.supplement_body)item.supplement=point.supplement_body;state.items[point.point_id]=item;
  }
  return {state,updatedAt:row?.updated_at||''};
}
async function saveMatrixState(env,roomId,state){
  const serialized=JSON.stringify(state||{});if(serialized.length>1_500_000)throw Object.assign(new Error('MATRIXの保存データが大きすぎます'),{status:413});
  const id=matrixStateId(roomId);
  await env.DB.prepare(`INSERT INTO matrix_template(template_id,room_id,template_name,template_definition,updated_at) VALUES(?,?,?, ?,CURRENT_TIMESTAMP)
    ON CONFLICT(template_id) DO UPDATE SET template_definition=excluded.template_definition,updated_at=CURRENT_TIMESTAMP`).bind(id,roomId,'__STATE__',serialized).run();
  const items=state?.items&&typeof state.items==='object'?state.items:{};
  for(const [pointId,item] of Object.entries(items)){
    const existingCharacter=await env.DB.prepare('SELECT character_id FROM character WHERE character_id=?').bind(pointId).first();
    await env.DB.prepare(`INSERT INTO matrix_point(point_id,room_id,character_id,is_placed,point_x,point_y,template_x,template_y,scale_base_width,coordinate_version,supplement_body,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(point_id) DO UPDATE SET room_id=excluded.room_id,character_id=COALESCE(excluded.character_id,matrix_point.character_id),is_placed=excluded.is_placed,point_x=excluded.point_x,point_y=excluded.point_y,template_x=excluded.template_x,template_y=excluded.template_y,scale_base_width=excluded.scale_base_width,coordinate_version=excluded.coordinate_version,supplement_body=excluded.supplement_body,updated_at=CURRENT_TIMESTAMP`).bind(String(pointId).slice(0,180),roomId,existingCharacter?.character_id||null,item?.placed?1:0,Number.isFinite(Number(item?.x))?Number(item.x):null,Number.isFinite(Number(item?.y))?Number(item.y):null,Number.isFinite(Number(item?.templateX))?Number(item.templateX):null,Number.isFinite(Number(item?.templateY))?Number(item.templateY):null,Number.isFinite(Number(item?.scaleBaseWidth))?Number(item.scaleBaseWidth):null,Math.max(0,Math.min(10,Number(item?.coordVersion)||0)),String(item?.supplement||'').slice(0,4000)).run();
  }
}

const sheetId=roomId=>`sheet:${roomId}`,sheetStateCellId=roomId=>`sheet-state:${roomId}`;
async function getSheetState(env,roomId){
  const row=await env.DB.prepare(`SELECT c.cell_value,c.updated_at FROM spreadsheet s LEFT JOIN spreadsheet_cell c ON c.sheet_id=s.sheet_id AND c.cell_id=? WHERE s.room_id=? ORDER BY s.created_at LIMIT 1`).bind(sheetStateCellId(roomId),roomId).first();
  let state=null;try{state=row?.cell_value?JSON.parse(row.cell_value):null}catch{}
  return {state,updatedAt:row?.updated_at||''};
}
async function saveSheetState(env,roomId,state){
  const serialized=JSON.stringify(state||{});if(serialized.length>1_500_000)throw Object.assign(new Error('Spreadsheetの保存データが大きすぎます'),{status:413});
  const sid=sheetId(roomId);await env.DB.prepare(`INSERT INTO spreadsheet(sheet_id,room_id,sheet_name,row_count,column_count,updated_at) VALUES(?,?,?,0,0,CURRENT_TIMESTAMP)
    ON CONFLICT(sheet_id) DO UPDATE SET updated_at=CURRENT_TIMESTAMP`).bind(sid,roomId,String(state?.name||state?.title||'Spreadsheet').slice(0,120)).run();
  await env.DB.prepare(`INSERT INTO spreadsheet_cell(cell_id,sheet_id,row_index,column_index,cell_value,cell_type,cell_style,updated_at) VALUES(?,?,-1,-1,?,'state','{}',CURRENT_TIMESTAMP)
    ON CONFLICT(cell_id) DO UPDATE SET cell_value=excluded.cell_value,updated_at=CURRENT_TIMESTAMP`).bind(sheetStateCellId(roomId),sid,serialized).run();
}

async function profileTransfer(context,parts){
  const {request,env}=context,method=request.method;
  if(method==='POST'&&parts.length===1){
    const body=await safeBody(request),profile=body?.profile;if(!profile?.id||!profile?.plName)return json({error:'PL情報が足りません'},400);
    await ensurePlIdentity(env.DB,String(profile.id),String(profile.plName));
    for(const persona of Array.isArray(profile.personas)?profile.personas:[])await resolveCharacterIdentity(env.DB,String(profile.id),String(persona?.name||''),String(persona?.type||'PC'),{characterId:persona?.id});
    let code='';for(let i=0;i<32;i++){const candidate=String(crypto.getRandomValues(new Uint32Array(1))[0]%10000).padStart(4,'0'),exists=await env.DB.prepare('SELECT 1 FROM transfer WHERE transfer_code_hash=? AND transfer_used_at IS NULL').bind(await tokenHash(candidate)).first();if(!exists){code=candidate;break}}
    if(!code)return json({error:'引き継ぎコードを発行できませんでした。もう一度お試しください。'},503);
    const expires=new Date(Date.now()+30*60*1000).toISOString();await env.DB.prepare('INSERT INTO transfer(transfer_id,pl_id,transfer_code_hash,transfer_expires_at) VALUES(?,?,?,?)').bind(`profile_${randomToken(14)}`,String(profile.id),await tokenHash(code),expires).run();return json({code,expiresAt:expires});
  }
  if(method==='POST'&&parts[1]){
    const codeHash=await tokenHash(String(parts[1]).padStart(4,'0')),row=await env.DB.prepare("SELECT transfer_id,pl_id,transfer_expires_at,transfer_used_at FROM transfer WHERE transfer_id LIKE 'profile_%' AND transfer_code_hash=?").bind(codeHash).first();
    if(!row||row.transfer_used_at)return json({error:'コードが無効、または使用済みです'},404);if(Date.parse(row.transfer_expires_at)<=Date.now())return json({error:'コードの有効期限（30分）が切れています'},410);
    await env.DB.prepare('UPDATE transfer SET transfer_used_at=CURRENT_TIMESTAMP WHERE transfer_id=?').bind(row.transfer_id).run();const pl=await env.DB.prepare('SELECT pl_id,pl_name,pl_icon_key,pl_color FROM pl WHERE pl_id=?').bind(row.pl_id).first(),chars=await env.DB.prepare('SELECT character_id,character_name,character_type,character_icon_key,character_color FROM character WHERE pl_id=?').bind(row.pl_id).all();
    return json({profile:{id:pl.pl_id,plName:pl.pl_name,plIcon:publicIcon(pl.pl_icon_key),plColor:pl.pl_color,personas:(chars.results||[]).map(c=>({id:c.character_id,name:c.character_name,type:c.character_type,icon:publicIcon(c.character_icon_key),color:c.character_color}))}});
  }
  return null;
}

export async function onRequest(context){
  const {request,env,params}=context;if(!env.DB)return json({error:'D1データベースが接続されていません'},500);
  const parts=Array.isArray(params.path)?params.path:String(params.path||'').split('/').filter(Boolean),method=request.method;

  if(parts[0]==='profile-transfers'){const handled=await profileTransfer(context,parts);if(handled)return handled}

  if(parts[0]==='boards'){
    if(method==='POST'&&parts.length===1){
      const body=await safeBody(request),name=String(body?.name||'').trim().slice(0,120),ownerId=String(body?.ownerId||'').slice(0,120);if(!name)return json({error:'自陣の名前を入力してください'},400);if(!ownerId)return json({error:'作成者情報がありません'},400);
      await ensurePlIdentity(env.DB,ownerId,String(body?.ownerName||'PL'));const id=randomToken(20),adminToken=randomToken(24);await env.DB.prepare('INSERT INTO room(room_id,owner_pl_id,room_name,room_admin_token_hash) VALUES(?,?,?,?)').bind(id,ownerId,name,await tokenHash(adminToken)).run();return json({id,adminToken,name},201);
    }
    const roomId=String(parts[1]||'');if(!roomId)return json({error:'Not found'},404);const room=await ensureRoom(env,roomId);if(!room)return json({error:'自陣の部屋が見つかりません'},404);
    if(method==='GET'&&parts.length===2)return json(await boardPayload(env,room));

    if(parts[2]==='spreadsheet'&&parts[3]==='state'&&parts.length===4){
      if(method==='GET')return json(await getSheetState(env,roomId));
      if(method==='POST'){const body=await safeBody(request);try{await saveSheetState(env,roomId,body?.state);return json({ok:true})}catch(error){return json({error:error.message},error.status||500)}}
    }

    if(parts[2]==='matrix'&&parts[3]&&parts.length===4){
      const log=await ensureLog(env,parts[3]);if(!log||log.room_id!==roomId)return json({error:'この自陣にないログです'},404);
      if(method==='GET'){
        const saved=await getMatrixState(env,roomId),rows=await legacyCommentRows(env,roomId,'','matrix_template',matrixStateId(roomId));
        return json({state:saved.state,updatedAt:saved.updatedAt,comments:rows.map(row=>({id:row.comment_id,author_id:row.author_pl_id,author_name:row.pl_name,body:row.comment_body,created_at:row.created_at}))});
      }
      if(method==='POST'){
        const body=await safeBody(request),authorId=String(body?.authorId||'').slice(0,120),authorName=String(body?.authorName||'').trim().slice(0,80);if(!authorId||!authorName)return json({error:'先に発言者を登録してください'},400);await ensurePlIdentity(env.DB,authorId,authorName);
        try{if(body?.state!==undefined)await saveMatrixState(env,roomId,body.state)}catch(error){return json({error:error.message},error.status||500)}
        const text=String(body?.comment||'').trim().slice(0,2000);if(text)await env.DB.prepare("INSERT INTO comment(comment_id,room_id,author_pl_id,comment_target_type,comment_target_id,comment_body) VALUES(?,?,?,'matrix_template',?,?,?)".replace('?,?,?)','?,?)')).bind(randomToken(16),roomId,authorId,matrixStateId(roomId),text).run();
        return json({ok:true});
      }
    }

    if(parts[2]==='matrix'&&parts[3]&&parts[4]==='comments'){
      const log=await ensureLog(env,parts[3]);if(!log||log.room_id!==roomId)return json({error:'この自陣にないログです'},404);const commentId=String(parts[5]||''),action=String(parts[6]||'');
      if(method==='GET'&&!commentId){const viewer=new URL(request.url).searchParams.get('authorId')||'',rows=[...await legacyCommentRows(env,roomId,viewer,'matrix_point'),...await legacyCommentRows(env,roomId,viewer,'matrix_template')].sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)));return json({comments:rows.map(row=>({id:row.comment_id,target_id:row.comment_target_id,parent_id:row.parent_comment_id||'',author_id:row.author_pl_id,author_name:row.pl_name,persona_name:row.character_name||row.pl_name,persona_type:row.character_type||'PL',persona_icon:publicIcon(row.character_icon_key||row.pl_icon_key),body:row.comment_body,created_at:row.created_at,updated_at:row.updated_at,like_count:Number(row.like_count)||0,liked_by_me:!!row.liked_by_me}))})}
      if(method==='POST'&&!commentId){const body=await safeBody(request),targetId=String(body?.targetId||'').slice(0,180),text=String(body?.body||'').trim().slice(0,4000),parentId=String(body?.parentId||'').slice(0,120);if(!targetId||!text)return json({error:'コメント情報が足りません'},400);const who=await participantIdentity(env,body);if(!who.plId)return json({error:'コメント情報が足りません'},400);if(parentId&&!await env.DB.prepare('SELECT 1 FROM comment WHERE comment_id=? AND room_id=?').bind(parentId,roomId).first())return json({error:'返信先コメントが見つかりません'},404);const type=targetId.includes('@@matrix-template@@')?'matrix_template':'matrix_point',id=randomToken(16);await env.DB.prepare('INSERT INTO comment(comment_id,room_id,author_pl_id,author_character_id,comment_target_type,comment_target_id,comment_body,parent_comment_id) VALUES(?,?,?,?,?,?,?,NULLIF(?,\'\'))').bind(id,roomId,who.plId,who.characterId,type,targetId,text,parentId).run();notifyRoom(context,env,roomId,'matrix-comment',request);return json({id},201)}
      if(method==='POST'&&commentId&&action==='like'){const body=await safeBody(request),liked=await toggleReaction(env,commentId,String(body?.authorId||'').slice(0,120));if(liked===null)return json({error:'参加者情報が必要です'},400);notifyRoom(context,env,roomId,'matrix-like',request);return json({liked})}
      if((method==='PATCH'||method==='DELETE')&&commentId){const body=await safeBody(request),row=await env.DB.prepare('SELECT author_pl_id FROM comment WHERE comment_id=? AND room_id=?').bind(commentId,roomId).first();if(!row)return json({error:'コメントが見つかりません'},404);if(row.author_pl_id!==String(body?.authorId||''))return json({error:`自分のコメントだけ${method==='PATCH'?'編集':'削除'}できます`},403);if(method==='PATCH'){const text=String(body?.body||'').trim().slice(0,4000);if(!text)return json({error:'感想を入力してください'},400);await env.DB.prepare('UPDATE comment SET comment_body=?,updated_at=CURRENT_TIMESTAMP WHERE comment_id=?').bind(text,commentId).run();notifyRoom(context,env,roomId,'matrix-edit',request);return json({ok:true})}const ids=await descendantIds(env.DB,commentId);for(const id of ids.reverse())await env.DB.prepare('DELETE FROM comment WHERE comment_id=?').bind(id).run();notifyRoom(context,env,roomId,'matrix-delete',request);return json({ok:true})}
    }

    if(!await roomAdmin(request,env,roomId))return json({error:'この自陣を編集できるのは部屋主だけです'},403);
    if(method==='PATCH'&&parts.length===2){const body=await safeBody(request),name=String(body?.name||'').trim().slice(0,120);if(!name)return json({error:'自陣の名前を入力してください'},400);await env.DB.prepare('UPDATE room SET room_name=?,updated_at=CURRENT_TIMESTAMP WHERE room_id=?').bind(name,roomId).run();return json({ok:true,name})}
    if(method==='PATCH'&&parts[2]==='logs'&&parts[3]&&parts.length===4){const body=await safeBody(request),changed=await env.DB.prepare('UPDATE log SET spoiler_enabled=?,scenario_title=?,updated_at=CURRENT_TIMESTAMP WHERE room_id=? AND log_id=?').bind(body?.spoiler?1:0,String(body?.scenarioTitle||'').trim().slice(0,120),roomId,parts[3]).run();if(!changed.meta?.changes)return json({error:'ログが見つかりません'},404);return json({ok:true})}
    if(method==='POST'&&parts[2]==='logs'&&parts.length===3){const body=await safeBody(request),logId=String(body?.roomId||'');const log=await ensureLog(env,logId);if(!log||log.room_id!==roomId)return json({error:'追加するログが見つかりません'},404);if(body?.scenarioTitle||body?.spoiler)await env.DB.prepare('UPDATE log SET spoiler_enabled=?,scenario_title=?,updated_at=CURRENT_TIMESTAMP WHERE log_id=?').bind(body?.spoiler?1:0,String(body?.scenarioTitle||'').trim().slice(0,120),logId).run();return json({ok:true,roomId:logId},201)}
    if(method==='DELETE'&&parts[2]==='logs'&&parts[3]&&parts.length===4){const log=await ensureLog(env,parts[3]);if(!log||log.room_id!==roomId)return json({error:'ログが見つかりません'},404);await deleteR2Prefix(env.LOGS,`rooms/${roomId}/logs/${parts[3]}/`).catch(()=>{});await env.DB.prepare('DELETE FROM log WHERE log_id=?').bind(parts[3]).run();notifyRoom(context,env,roomId,'log-delete',request);return json({ok:true})}
  }

  if(parts[0]==='rooms'&&parts[1]){
    const logId=String(parts[1]),log=await ensureLog(env,logId);if(!log)return json({error:'部屋が見つかりません'},404);const roomId=log.room_id;
    if(method==='GET'&&parts.length===2&&new URL(request.url).searchParams.get('summary')==='1')return json({id:log.log_id,title:log.log_name,createdAt:log.log_created_at});
    if(method==='DELETE'&&parts.length===2){await env.DB.prepare('DELETE FROM log WHERE log_id=?').bind(logId).run();notifyRoom(context,env,roomId,'log-delete',request);return json({ok:true})}
    if(method==='GET'&&parts[2]==='realtime'&&parts.length===3){if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return json({error:'WebSocket接続が必要です'},426);const hub=roomHub(env,roomId);if(!hub)return json({error:'リアルタイム機能が接続されていません（Binding名: ROOMS）'},503);return hub.fetch(new Request(new URL('/realtime',request.url),request))}
    if(parts[2]==='presence'){
      const hub=roomHub(env,roomId);if(!hub)return json({presence:[]});if(method==='GET')return hub.fetch('https://room/presence');if(method==='POST'){const body=await safeBody(request);return hub.fetch('https://room/presence',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body||{})})}
    }
    if(method==='GET'&&parts[2]==='icons'&&parts[3]&&parts.length===4){const hash=String(parts[3]);if(!env.LOGS)return new Response('R2 is not connected',{status:500});for(const prefix of ['pl-icons','character-icons','matrix-icons']){const object=await env.LOGS.get(`${prefix}/${hash}`);if(object)return new Response(object.body,{headers:{'content-type':object.httpMetadata?.contentType||'image/webp','cache-control':'private, max-age=31536000, immutable'}})}return new Response('Not found',{status:404})}

    if(parts[2]==='annotations'){
      const commentId=String(parts[3]||''),action=String(parts[4]||'');
      if(method==='GET'&&commentId&&action==='image'){const row=await env.DB.prepare("SELECT comment_image_key FROM comment WHERE comment_id=? AND room_id=? AND comment_target_type='log_range'").bind(commentId,roomId).first();if(!row?.comment_image_key)return new Response('Not found',{status:404});const object=await env.LOGS.get(row.comment_image_key);if(!object)return new Response('Not found',{status:404});return new Response(object.body,{headers:{'content-type':object.httpMetadata?.contentType||'image/webp','cache-control':'private, max-age=31536000, immutable'}})}
      if(method==='GET'&&commentId==='version'){const row=await ensureRoom(env,roomId);return json({version:Number(row?.room_revision)||0})}
      if(method==='GET'&&!commentId){const viewer=new URL(request.url).searchParams.get('authorId')||'',rows=await legacyCommentRows(env,roomId,viewer,'log_range',logId),ranges=await env.DB.prepare('SELECT * FROM log_comment_range WHERE comment_id IN (SELECT comment_id FROM comment WHERE room_id=? AND comment_target_type=\'log_range\' AND comment_target_id=?)').bind(roomId,logId).all(),rangeMap=new Map((ranges.results||[]).map(r=>[r.comment_id,r]));return json({annotations:rows.map(row=>{const range=rangeMap.get(row.comment_id)||{};return{id:row.comment_id,room_id:logId,message_id:range.start_line_id||'',end_message_id:range.end_line_id||range.start_line_id||'',parent_id:row.parent_comment_id||'',start_offset:Number(range.start_character_offset)||0,end_offset:Number(range.end_character_offset)||0,quote:range.selected_text||'',color:range.marker_color||'yellow',author_id:row.author_pl_id,author_name:row.pl_name,persona_name:row.character_name||row.pl_name,persona_type:row.character_type||'PL',persona_icon:publicIcon(row.character_icon_key||row.pl_icon_key),body:row.comment_body,created_at:row.created_at,updated_at:row.updated_at,has_image:row.comment_image_key?1:0,like_count:Number(row.like_count)||0,liked_by_me:!!row.liked_by_me}}),version:Number(log.room_revision)||0})}
      if(method==='POST'&&!commentId){const body=await safeBody(request),required=['messageId','quote','authorName','personaName','personaType'],missing=!body?required:required.filter(key=>body[key]==null||String(body[key]).trim()==='');if(missing.length)return json({error:`入力が足りません（${missing.join(', ')}）`},400);const text=String(body.body||'').trim();if(!text)return json({error:'感想を入力してください'},400);const who=await participantIdentity(env,body),id=randomToken(16),parent=String(body.parentId||'');if(parent&&!await env.DB.prepare('SELECT 1 FROM comment WHERE comment_id=? AND room_id=?').bind(parent,roomId).first())return json({error:'返信先コメントが見つかりません'},404);await env.DB.batch([env.DB.prepare("INSERT INTO comment(comment_id,room_id,author_pl_id,author_character_id,comment_target_type,comment_target_id,comment_body,parent_comment_id) VALUES(?,?,?,?,'log_range',?,?,NULLIF(?,''))").bind(id,roomId,who.plId,who.characterId,logId,text,parent),env.DB.prepare('INSERT INTO log_comment_range(comment_id,start_line_id,start_character_offset,end_line_id,end_character_offset,selected_text,marker_color) VALUES(?,?,?,?,?,?,?)').bind(id,String(body.messageId),Number(body.startOffset)||0,String(body.endMessageId||body.messageId),Number(body.endOffset)||0,String(body.quote).slice(0,2000),String(body.color||'yellow').slice(0,40))]);await bumpRoomRevision(env.DB,roomId);notifyRoom(context,env,roomId,'comment',request);return json({id},201)}
      if(method==='POST'&&commentId&&action==='like'){const body=await safeBody(request),liked=await toggleReaction(env,commentId,String(body?.authorId||'').slice(0,120));if(liked===null)return json({error:'参加者情報が必要です'},400);await bumpRoomRevision(env.DB,roomId);notifyRoom(context,env,roomId,'like',request);return json({liked})}
      if(method==='DELETE'&&commentId){const body=await safeBody(request),row=await env.DB.prepare('SELECT author_pl_id FROM comment WHERE comment_id=? AND room_id=?').bind(commentId,roomId).first();if(!row)return json({error:'コメントが見つかりません'},404);const isAdmin=await verifyRoomAdmin(env.DB,roomId,request.headers.get('x-admin-token')||'');if(!isAdmin&&String(body?.authorId||'')!==row.author_pl_id)return json({error:'自分のコメントだけ削除できます'},403);const ids=await descendantIds(env.DB,commentId);for(const id of ids.reverse())await env.DB.prepare('DELETE FROM comment WHERE comment_id=?').bind(id).run();await bumpRoomRevision(env.DB,roomId);notifyRoom(context,env,roomId,'delete',request);return json({ok:true})}
      if(method==='PATCH'&&commentId&&commentId!=='color'){const body=await safeBody(request),row=await env.DB.prepare('SELECT author_pl_id,comment_image_key FROM comment WHERE comment_id=? AND room_id=?').bind(commentId,roomId).first();if(!row)return json({error:'コメントが見つかりません'},404);if(String(body?.authorId||'')!==row.author_pl_id)return json({error:'自分のコメントだけ編集できます'},403);const text=String(body?.body||'').trim().slice(0,4000);let imageKey=row.comment_image_key||null;if(body?.imageData!==null&&body?.imageData!==undefined){if(String(body.imageData||'')){imageKey=await storeImage(env.LOGS,String(body.imageData),'comment-images')||imageKey}else imageKey=null}if(!text&&!imageKey)return json({error:'感想または画像を入力してください'},400);await env.DB.prepare('UPDATE comment SET comment_body=?,comment_image_key=?,updated_at=CURRENT_TIMESTAMP WHERE comment_id=?').bind(text,imageKey,commentId).run();const who=await participantIdentity(env,body);if(who.characterId!==undefined)await env.DB.prepare('UPDATE comment SET author_character_id=? WHERE comment_id=?').bind(who.characterId,commentId).run();await env.DB.prepare('UPDATE log_comment_range SET marker_color=? WHERE comment_id=?').bind(String(body?.color||'yellow').slice(0,40),commentId).run();await bumpRoomRevision(env.DB,roomId);notifyRoom(context,env,roomId,'edit',request);return json({ok:true})}
      if(method==='PATCH'&&commentId==='color'){const body=await safeBody(request),authorId=String(body?.authorId||''),name=String(body?.personaName||''),type=String(body?.personaType||'PL').toUpperCase(),color=String(body?.color||'');if(!authorId||!name||!color)return json({error:'色の更新情報が足りません'},400);let characterId=null;if(type!=='PL'){const ch=await env.DB.prepare('SELECT character_id FROM character WHERE pl_id=? AND character_name=? AND character_type=? ORDER BY updated_at DESC LIMIT 1').bind(authorId,name,type==='NPC'?'NPC':'PC').first();characterId=ch?.character_id||'__none__'}await env.DB.prepare(`UPDATE log_comment_range SET marker_color=? WHERE comment_id IN (SELECT comment_id FROM comment WHERE room_id=? AND comment_target_type='log_range' AND comment_target_id=? AND author_pl_id=? AND ${type==='PL'?'author_character_id IS NULL':'author_character_id=?'})`).bind(...(type==='PL'?[color.slice(0,40),roomId,logId,authorId]:[color.slice(0,40),roomId,logId,authorId,characterId])).run();await bumpRoomRevision(env.DB,roomId);notifyRoom(context,env,roomId,'color',request);return json({ok:true})}
    }
  }
  return json({error:'Not found'},404);
}
