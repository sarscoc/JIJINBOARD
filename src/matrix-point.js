import {validMatrixScope} from './matrix-scope.js';
import {playerKey,characterKey,playerIconUrl} from './player-address.js';
import {handleComments,targets} from './comments.js';
import { parentRoomForLog,ensurePlIdentity } from './data-model.js';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const finite=(value,fallback=null)=>{if(value===undefined)return fallback;if(value===null)return null;const n=Number(value);return Number.isFinite(n)?n:fallback};
const characterIdFromItem=(itemId,authorId)=>{const prefix=`participant:${authorId}:`;return String(itemId||'').startsWith(prefix)?String(itemId).slice(prefix.length):String(itemId||'')};
function savedPoint(row,itemId,templateId){
  return {itemId,templateId,placed:!!row?.is_placed,x:row?.point_x??null,y:row?.point_y??null,
    templateX:row?.template_x??null,templateY:row?.template_y??null,
    scaleBaseWidth:row?.scale_base_width??null,coordVersion:row?.coordinate_version??0,
    placementRevision:row?.placement_revision??0};
}
export async function handleMatrixPoint(request,env,roomId,logId,itemId,executionContext=null){
  if(request.method!=='PATCH')return json({error:'Method not allowed'},405);
  if(!roomId||!logId||!itemId)return json({error:'座標情報が足りません'},400);
  if(!await validMatrixScope(env.DB,roomId,logId))return json({error:'この自陣にないログです'},404);
  let body=null;try{body=await request.json()}catch{}
  const authorId=String(body?.authorId||'').slice(0,120),authorName=String(body?.authorName||'').trim().slice(0,80),templateId=String(body?.templateId||'').slice(0,160);
  if(!authorId||!authorName)return json({error:'先に発言者を登録してください'},400);
  if(!templateId)return json({error:'テンプレート情報がありません'},400);
  await ensurePlIdentity(env.DB,playerKey(roomId,authorId),authorName);
  await env.DB.prepare(`INSERT OR IGNORE INTO matrix_template(room_id,template_id,template_name,template_image_key,template_definition) VALUES(?,?,?,'','{}')`).bind(roomId,templateId,'MATRIX').run();
  if(body?.comment!==undefined){
    const target=targets.matrix(roomId,templateId,itemId);
    return handleComments(new Request(request.url,{method:'PUT',headers:request.headers,body:JSON.stringify({...body,target,body:body.comment})}),env,roomId,'note','',executionContext);
  }
  // A complete drag/drop payload already carries every persisted coordinate.
  // Avoid reading the old point for this frequent path; partial PATCHes retain
  // the existing merge semantics and fetch only the fields they actually need.
  const coordinateFields=['placed','x','y','templateX','templateY','scaleBaseWidth','coordVersion'];
  const complete=coordinateFields.every(key=>body?.[key]!==undefined);
  const readPoint=()=>env.DB.prepare(`SELECT is_placed,point_x,point_y,template_x,template_y,scale_base_width,coordinate_version,
    COALESCE(json_extract(point_settings,'$.placementRevision'),0) AS placement_revision
    FROM matrix_point WHERE room_id=? AND template_id=? AND point_id=?`).bind(roomId,templateId,itemId).first();
  const old=complete?null:await readPoint();
  const guarded=Object.hasOwn(body||{},'basePlacementRevision');
  const base=guarded?body.basePlacementRevision:(old?.placement_revision??0);
  if(!Number.isSafeInteger(base)||base<0)return json({error:'配置のバージョンが不正です'},400);
  const placed=body?.placed!==undefined?!!body.placed:!!old?.is_placed,x=finite(body?.x,old?.point_x??null),y=finite(body?.y,old?.point_y??null),templateX=finite(body?.templateX,old?.template_x??null),templateY=finite(body?.templateY,old?.template_y??null),scale=finite(body?.scaleBaseWidth,old?.scale_base_width??null),version=Math.max(0,Math.min(10,Math.trunc(finite(body?.coordVersion,old?.coordinate_version??0))));
  const candidate=characterIdFromItem(itemId,authorId),ch=await env.DB.prepare('SELECT character_id,character_name,matrix_icon_key,character_icon_key FROM character WHERE character_id=? AND pl_id=?').bind(characterKey(roomId,authorId,candidate),playerKey(roomId,authorId)).first();
  const row=await env.DB.prepare(`INSERT INTO matrix_point(room_id,template_id,point_id,character_id,is_placed,point_x,point_y,template_x,template_y,scale_base_width,coordinate_version,point_settings,updated_at)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,json_object('placementRevision',?,'justPlaced',?),CURRENT_TIMESTAMP
    WHERE EXISTS (SELECT 1 FROM matrix_template WHERE room_id=? AND template_id=? AND template_image_key<>'__deleted__')
      AND (?=0 OR EXISTS (SELECT 1 FROM matrix_point WHERE room_id=? AND template_id=? AND point_id=?))
    ON CONFLICT(room_id,template_id,point_id) DO UPDATE SET
      character_id=COALESCE(excluded.character_id,matrix_point.character_id),is_placed=excluded.is_placed,
      point_x=excluded.point_x,point_y=excluded.point_y,template_x=excluded.template_x,template_y=excluded.template_y,
      scale_base_width=excluded.scale_base_width,coordinate_version=excluded.coordinate_version,updated_at=CURRENT_TIMESTAMP,
      point_settings=json_set(matrix_point.point_settings,'$.placementRevision',COALESCE(json_extract(matrix_point.point_settings,'$.placementRevision'),0)+?,
        '$.justPlaced',excluded.is_placed AND NOT matrix_point.is_placed)
    WHERE (? AND COALESCE(json_extract(matrix_point.point_settings,'$.placementRevision'),0)=?)
       OR (NOT ? AND COALESCE(json_extract(matrix_point.point_settings,'$.placementRevision'),0)=0)
    RETURNING is_placed,point_x,point_y,template_x,template_y,scale_base_width,coordinate_version,
      json_extract(point_settings,'$.placementRevision') AS placement_revision, json_extract(point_settings,'$.justPlaced') AS just_placed,
      (SELECT CASE WHEN json_valid(template_definition) THEN json_type(template_definition,'$.alternate')='true' ELSE 0 END
       FROM matrix_template WHERE room_id=? AND template_id=?) AS alternate_template`)
    .bind(roomId,templateId,itemId,ch?.character_id||null,placed?1:0,x,y,templateX,templateY,scale,version,guarded?1:0,placed?1:0,
      roomId,templateId,base,roomId,templateId,itemId,guarded?1:0,guarded?1:0,base,guarded?1:0,roomId,templateId).first();
  if(!row)return json({code:'MATRIX_POINT_CONFLICT',error:'配置が他の画面で変わりました。最新の位置を表示します。',point:savedPoint(await readPoint(),itemId,templateId)},409);
  let activity=null;
  if(row.just_placed&&!row.alternate_template){
    activity={templateId,itemId,authorName};
    const tokenName=ch?.character_name||String(body?.tokenName||'').trim().slice(0,120);
    const submittedIcon=String(body?.tokenIcon||'');
    const prefix=`/api/boards/${encodeURIComponent(roomId)}/player-icons/`;
    const validIcon=submittedIcon.startsWith(prefix)&&
      /^(?:matrix-icons|character-icons|pl-icons)\/[A-Za-z0-9_-]{20,80}$/.test(submittedIcon.slice(prefix.length));
    const icon=playerIconUrl(roomId,ch?.matrix_icon_key||ch?.character_icon_key)||(validIcon?submittedIcon:'');
    if(tokenName)activity.tokenName=tokenName;
    if(icon)activity.icon=icon;
  }
  return json({ok:true,point:savedPoint(row,itemId,templateId),activity});
}
