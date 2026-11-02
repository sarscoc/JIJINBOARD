import {randomToken,tokenHash,storeImage} from './data-model.js';
import {playerKey,playerPrefix,characterKey,localId,iconPrefix,playerIconUrl} from './player-address.js';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const text=(value,max=120)=>String(value||'').slice(0,max);
async function bodyOf(request){try{return await request.json()}catch{return null}}
const token=request=>request.headers.get('x-player-token')||'';
const masterRow=(db,id)=>db.prepare('SELECT * FROM pl WHERE pl_id=?').bind(id).first();
async function authorized(db,request,id){
 const row=await masterRow(db,id),raw=token(request);if(!row||!raw)return null;
 const hash=await tokenHash(raw);
 return hash===row.access_token_hash||await db.prepare('SELECT 1 FROM transfer WHERE pl_id=? AND transfer_used_at IS NOT NULL AND transfer_code_hash=?').bind(id,hash).first()?row:null;
}
async function masterData(db,board,row){
 const chars=(await db.prepare('SELECT * FROM character WHERE pl_id=? ORDER BY created_at,character_id').bind(row.pl_id).all()).results||[];
 const deleted=(await db.prepare('SELECT character_id FROM deleted_character WHERE pl_id=?').bind(row.pl_id).all()).results||[];
 return {boardId:board,address:row.pl_id,playerId:localId(row.pl_id),plName:row.pl_name,plIcon:playerIconUrl(board,row.pl_icon_key),plColor:row.pl_color,plColorDark:row.pl_color_dark,
  characters:chars.map(c=>({id:localId(c.character_id),address:c.character_id,type:c.character_type,name:c.character_name,icon:playerIconUrl(board,c.character_icon_key),matrixIcon:playerIconUrl(board,c.matrix_icon_key),color:c.character_color,colorDark:c.character_color_dark,updatedAt:c.updated_at})),deletedCharacterIds:deleted.map(c=>localId(c.character_id)),updatedAt:row.updated_at};
}
async function saveCharacters(env,board,playerId,list){
 const pl=playerKey(board,playerId);
 for(const item of Array.isArray(list)?list.slice(0,100):[]){
  const id=text(item?.id||item?.characterId),name=text(item?.name,80).trim();if(!id||!name)continue;
  const key=characterKey(board,playerId,id);
  if(await env.DB.prepare('SELECT 1 FROM deleted_character WHERE character_id=?').bind(key).first())continue;
  const old=await env.DB.prepare('SELECT * FROM character WHERE character_id=? AND pl_id=?').bind(key,pl).first();
  const icon=await storeImage(env.LOGS,text(item.icon,7_000_000),iconPrefix(board,'character-icons'))||old?.character_icon_key||'';
  const matrix=await storeImage(env.LOGS,text(item.matrixIcon,7_000_000),iconPrefix(board,'matrix-icons'))||old?.matrix_icon_key||'';
  await env.DB.prepare(`INSERT INTO character(character_id,pl_id,character_type,character_name,character_icon_key,matrix_icon_key,character_color,character_color_dark,updated_at)
   SELECT ?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP WHERE NOT EXISTS(SELECT 1 FROM deleted_character WHERE character_id=?)
   ON CONFLICT(character_id) DO UPDATE SET character_type=excluded.character_type,character_name=excluded.character_name,character_icon_key=excluded.character_icon_key,matrix_icon_key=excluded.matrix_icon_key,character_color=excluded.character_color,character_color_dark=excluded.character_color_dark,updated_at=CURRENT_TIMESTAMP WHERE character.pl_id=excluded.pl_id`)
   .bind(key,pl,item.type==='NPC'?'NPC':'PC',name,icon,matrix,text(item.color||'#ffe66b',40),text(item.colorDark||item.color||'#ffe66b',40),key).run();
 }
}
async function redeem(request,env,board,code){
 const hash=await tokenHash(code),row=await env.DB.prepare('SELECT * FROM transfer WHERE transfer_code_hash=? AND substr(pl_id,1,?)=?').bind(hash,playerPrefix(board).length,playerPrefix(board)).first();
 // Never allow a code issued for another room to select a player here.
 if(!row||row.transfer_used_at||Date.parse(row.transfer_expires_at)<=Date.now()||!row.pl_id.startsWith(playerPrefix(board)))return json({error:'コードが無効、使用済み、または別の部屋のものです'},404);
 const old=await masterRow(env.DB,row.pl_id);if(!old)return json({error:'PLが見つかりません'},404);
 const accessToken=randomToken(24),newHash=await tokenHash(accessToken);
 const [saved]=await env.DB.batch([
  env.DB.prepare(`UPDATE pl SET access_token_hash=?,updated_at=CURRENT_TIMESTAMP WHERE pl_id=? AND access_token_hash=? AND EXISTS(SELECT 1 FROM transfer WHERE transfer_id=? AND transfer_used_at IS NULL AND transfer_expires_at>?)`).bind(newHash,row.pl_id,old.access_token_hash,row.transfer_id,new Date().toISOString()),
  env.DB.prepare(`UPDATE transfer SET transfer_code_hash=?,transfer_used_at=CURRENT_TIMESTAMP WHERE transfer_id=? AND transfer_used_at IS NULL AND EXISTS(SELECT 1 FROM pl WHERE pl_id=? AND access_token_hash=?)`).bind(old.access_token_hash,row.transfer_id,row.pl_id,newHash)
 ]);
 if(!saved.meta?.changes)return json({error:'コードは使用済みです'},409);
 return json({playerId:localId(row.pl_id),accessToken,master:await masterData(env.DB,board,await masterRow(env.DB,row.pl_id))});
}
async function roomPlayers(request,env,board,parts=[]){
 if(!await env.DB.prepare('SELECT 1 FROM room WHERE room_id=?').bind(board).first())return json({error:'自陣が見つかりません'},404);
 const method=request.method;
 if(method==='POST'&&parts[0]==='redeem'&&/^\d{4}$/.test(parts[1]||''))return redeem(request,env,board,parts[1]);
 const data=['GET','HEAD'].includes(method)?null:await bodyOf(request),playerId=text(parts[0]||data?.playerId);
 if(!playerId)return json({error:'PL情報がありません'},400);
 if(data?.playerId&&data.playerId!==playerId)return json({error:'PLのアドレスが一致しません'},400);
 const key=playerKey(board,playerId);let row=await masterRow(env.DB,key);
 if(method==='POST'&&parts.length===0){
  const name=text(data?.plName,80).trim();if(!name)return json({error:'PL名を登録してください'},400);
  let accessToken=token(request),created=false;
  if(!row||row.access_token_hash.startsWith('implicit:')){
   accessToken=randomToken(24);const hash=await tokenHash(accessToken),icon=await storeImage(env.LOGS,String(data?.plIcon||''),iconPrefix(board,'pl-icons'));
   const saved=await env.DB.prepare(`INSERT INTO pl(pl_id,access_token_hash,pl_name,pl_icon_key,pl_color,pl_color_dark) VALUES(?,?,?,?,?,?)
    ON CONFLICT(pl_id) DO UPDATE SET access_token_hash=excluded.access_token_hash,pl_name=excluded.pl_name,pl_icon_key=excluded.pl_icon_key,pl_color=excluded.pl_color,pl_color_dark=excluded.pl_color_dark WHERE pl.access_token_hash LIKE 'implicit:%'`)
    .bind(key,hash,name,icon,text(data?.plColor||'#ffe66b',40),text(data?.plColorDark||data?.plColor||'#ffe66b',40)).run();
   if(!saved.meta?.changes)return json({error:'PLは別の画面で登録されています'},409);
   created=true;
  }else if(!await authorized(env.DB,request,key))return json({error:'この部屋のPLへのアクセス権がありません'},403);
  // Bootstrap reads the server master; only explicit profile edits send PC updates.
  row=await masterRow(env.DB,key);
  return json({playerId,accessToken,master:await masterData(env.DB,board,row)},created?201:200);
 }
 row=await authorized(env.DB,request,key);if(!row)return json({error:'この部屋のPLへのアクセス権がありません'},403);
 if(method==='GET'&&parts.length===1)return json({master:await masterData(env.DB,board,row)});
 if(method==='PUT'&&parts.length===1){
  const icon=await storeImage(env.LOGS,String(data?.plIcon||''),iconPrefix(board,'pl-icons'))||row.pl_icon_key;
  await env.DB.prepare('UPDATE pl SET pl_name=?,pl_icon_key=?,pl_color=?,pl_color_dark=?,updated_at=CURRENT_TIMESTAMP WHERE pl_id=?').bind(text(data?.plName||row.pl_name,80).trim(),icon,text(data?.plColor||row.pl_color,40),text(data?.plColorDark||data?.plColor||row.pl_color_dark,40),key).run();
  await saveCharacters(env,board,playerId,data?.characters);
  // Existing log marks use the same light/dark pair as the edited speaker.
  await env.DB.prepare(`UPDATE log_comment_range SET marker_color=COALESCE(
   (SELECT CASE WHEN c.author_character_id IS NULL THEN p.pl_color||'|'||p.pl_color_dark
    ELSE ch.character_color||'|'||ch.character_color_dark END
    FROM comment c JOIN pl p ON p.pl_id=c.author_pl_id LEFT JOIN character ch ON ch.character_id=c.author_character_id
    WHERE c.comment_id=log_comment_range.comment_id),marker_color)
   WHERE comment_id IN(SELECT comment_id FROM comment WHERE room_id=? AND author_pl_id=?)`).bind(board,key).run();
  return json({master:await masterData(env.DB,board,await masterRow(env.DB,key))});
 }
 if(parts[1]==='characters'&&parts[2]&&parts.length===3&&method==='DELETE'){
  const char=characterKey(board,playerId,parts[2]);
  await env.DB.batch([
   env.DB.prepare(`INSERT OR IGNORE INTO deleted_character(character_id,pl_id,character_name,character_type) VALUES(?,?,COALESCE((SELECT character_name FROM character WHERE character_id=? AND pl_id=?),''),COALESCE((SELECT character_type FROM character WHERE character_id=? AND pl_id=?),'PC'))`).bind(char,key,char,key,char,key),
   env.DB.prepare('DELETE FROM character WHERE pl_id=? AND character_id=?').bind(key,char)
  ]);return json({ok:true});
 }
 if(parts[1]==='selection'&&parts.length===2){
  if(method==='GET'){const rows=(await env.DB.prepare('SELECT character_id FROM room_participant WHERE room_id=? AND pl_id=? AND character_id IS NOT NULL ORDER BY created_at,character_id').bind(board,key).all()).results||[];return json({characterIds:rows.map(x=>localId(x.character_id))})}
  if(method==='PUT'){
   const ids=[...new Set((Array.isArray(data?.characterIds)?data.characterIds:[]).slice(0,100).map(x=>text(x)).filter(Boolean))];
   await env.DB.batch([
    env.DB.prepare('DELETE FROM room_participant WHERE room_id=? AND pl_id=?').bind(board,key),
    env.DB.prepare('INSERT INTO room_participant(room_id,pl_id,character_id) VALUES(?,?,NULL)').bind(board,key),
    ...ids.map(id=>env.DB.prepare('INSERT OR IGNORE INTO room_participant(room_id,pl_id,character_id) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM character WHERE pl_id=? AND character_id=?)').bind(board,key,characterKey(board,playerId,id),key,characterKey(board,playerId,id)))
   ]);return json({ok:true});
  }
 }
 if(parts[1]==='code'&&parts.length===2&&method==='POST'){
  let code='';for(let i=0;i<20&&!code;i++){const value=String(crypto.getRandomValues(new Uint32Array(1))[0]%10000).padStart(4,'0');if(!await env.DB.prepare('SELECT 1 FROM transfer WHERE transfer_code_hash=?').bind(await tokenHash(value)).first())code=value}
  if(!code)return json({error:'コードを発行できませんでした'},503);
  const expires=new Date(Date.now()+10*60*1000).toISOString();
  await env.DB.prepare('INSERT INTO transfer(transfer_id,pl_id,transfer_code_hash,transfer_expires_at) VALUES(?,?,?,?)').bind(randomToken(18),key,await tokenHash(code),expires).run();return json({code,expiresAt:expires});
 }
 return json({error:'Not found'},404);
}


// Notify only after the durable write succeeds; disconnected clients catch up on reconnect.
export async function handleRoomPlayers(request,env,board,parts=[],context){
 const response=await roomPlayers(request,env,board,parts);
 if(response?.ok&&!['GET','HEAD','OPTIONS'].includes(request.method)&&parts[1]!=='code'&&env.ROOMS){
  const task=Promise.resolve().then(()=>env.ROOMS.get(env.ROOMS.idFromName(board)).fetch('https://room/notify',{
   method:'POST',body:JSON.stringify({action:'participants',data:{profileChanged:true}})
  })).catch(error=>console.warn('Player update notification failed',error));
  if(context?.waitUntil)context.waitUntil(task);else await task;
 }
 return response;
}
