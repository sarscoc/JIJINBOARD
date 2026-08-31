const encoder=new TextEncoder();

export const randomToken=(bytes=24)=>{
  const data=crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...data)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
};

export const base64url=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
export const hashBytes=async bytes=>new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
export const hashText=async value=>base64url(await hashBytes(encoder.encode(String(value??''))));
export const tokenHash=hashText;

export const dataImage=value=>{
  const match=String(value||'').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([a-zA-Z0-9+/=]+)$/);
  if(!match)return null;
  const binary=atob(match[2]),bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return {contentType:match[1],bytes};
};

const r2Key=value=>{
  const match=String(value||'').match(/^r2:(.+)$/);
  return match?match[1]:'';
};

export async function storeImage(bucket,value,prefix){
  const raw=String(value||'').trim();
  if(!raw)return '';
  const known=r2Key(raw);
  if(known&&known.startsWith(`${prefix}/`))return known;
  const image=dataImage(raw);
  if(!image)return '';
  const hash=base64url(await hashBytes(image.bytes)).replace(/[^a-zA-Z0-9_-]/g,'');
  const key=`${prefix}/${hash}`;
  if(bucket&&!await bucket.head(key))await bucket.put(key,image.bytes,{httpMetadata:{contentType:image.contentType,cacheControl:'private, max-age=31536000, immutable'},customMetadata:{sha256:hash}});
  return key;
}

export const imageReference=key=>key?`r2:${key}`:'';

export async function ensurePlIdentity(db,plId,plName='PL',options={}){
  plId=String(plId||'').slice(0,120);
  if(!plId)return null;
  const existing=await db.prepare('SELECT * FROM pl WHERE pl_id=?').bind(plId).first();
  const name=String(plName||existing?.pl_name||'PL').trim().slice(0,80)||'PL';
  if(existing){
    if(name!==existing.pl_name||options.plIconKey||options.plColor||options.plColorDark){
      await db.prepare(`UPDATE pl SET pl_name=?,pl_icon_key=CASE WHEN ?<>'' THEN ? ELSE pl_icon_key END,pl_color=COALESCE(NULLIF(?,''),pl_color),pl_color_dark=COALESCE(NULLIF(?,''),pl_color_dark),updated_at=CURRENT_TIMESTAMP WHERE pl_id=?`).bind(name,String(options.plIconKey||''),String(options.plIconKey||''),String(options.plColor||''),String(options.plColorDark||''),plId).run();
    }
    return db.prepare('SELECT * FROM pl WHERE pl_id=?').bind(plId).first();
  }
  const placeholder=`implicit:${await hashText(plId)}`;
  await db.prepare('INSERT INTO pl(pl_id,access_token_hash,pl_name,pl_color,pl_color_dark,pl_icon_key) VALUES(?,?,?,?,?,?)').bind(plId,placeholder,name,String(options.plColor||'#ffe66b'),String(options.plColorDark||options.plColor||'#ffe66b'),String(options.plIconKey||'')).run();
  return db.prepare('SELECT * FROM pl WHERE pl_id=?').bind(plId).first();
}

export async function resolveCharacterIdentity(db,plId,personaName,personaType='PC',options={}){
  const type=String(personaType||'PL').toUpperCase();
  if(type==='PL')return null;
  const name=String(personaName||'').trim().slice(0,80);
  if(!plId||!name)return null;
  await ensurePlIdentity(db,plId,options.plName||'PL');
  let row=null;
  if(options.characterId)row=await db.prepare('SELECT * FROM character WHERE character_id=? AND pl_id=?').bind(String(options.characterId).slice(0,120),plId).first();
  if(!row)row=await db.prepare('SELECT * FROM character WHERE pl_id=? AND character_type=? AND character_name=? ORDER BY updated_at DESC LIMIT 1').bind(plId,type==='NPC'?'NPC':'PC',name).first();
  if(row)return row;
  const id=String(options.characterId||`auto_${(await hashText(`${plId}\0${type}\0${name}`)).slice(0,40)}`).slice(0,120);
  await db.prepare('INSERT OR IGNORE INTO character(character_id,pl_id,character_type,character_name,character_color,character_color_dark,character_icon_key,matrix_icon_key) VALUES(?,?,?,?,?,?,?,?)').bind(id,plId,type==='NPC'?'NPC':'PC',name,String(options.color||'#ffe66b'),String(options.colorDark||options.color||'#ffe66b'),String(options.iconKey||''),String(options.matrixIconKey||'')).run();
  return db.prepare('SELECT * FROM character WHERE character_id=?').bind(id).first();
}

export async function verifyRoomAdmin(db,roomId,token){
  const raw=String(token||'');
  if(!raw)return false;
  const room=await db.prepare('SELECT room_admin_token_hash FROM room WHERE room_id=?').bind(roomId).first();
  if(!room)return false;
  return (await tokenHash(raw))===room.room_admin_token_hash;
}

export async function parentRoomForLog(db,logId){
  return db.prepare('SELECT r.*,l.log_id,l.log_name,l.scenario_title,l.spoiler_enabled,l.log_sort_order,l.log_display_mode,l.original_html_key,l.created_at AS log_created_at,l.updated_at AS log_updated_at FROM log l JOIN room r ON r.room_id=l.room_id WHERE l.log_id=?').bind(logId).first();
}

export async function bumpRoomRevision(db,roomId){
  await db.prepare('UPDATE room SET room_revision=room_revision+1,updated_at=CURRENT_TIMESTAMP WHERE room_id=?').bind(roomId).run();
}

export function publicImagePath(kind,key){
  if(!key)return '';
  const clean=String(key).replace(/^r2:/,'');
  const hash=clean.split('/').pop();
  if(kind==='pl'||kind==='character'||kind==='matrix')return `/api/player-master/icon/${encodeURIComponent(hash)}`;
  return '';
}

export async function deleteR2Prefix(bucket,prefix){
  if(!bucket)return;
  let cursor=undefined;
  do{
    const page=await bucket.list({prefix,cursor});
    const keys=(page.objects||[]).map(item=>item.key);
    if(keys.length)await bucket.delete(keys);
    cursor=page.truncated?page.cursor:undefined;
  }while(cursor);
}
