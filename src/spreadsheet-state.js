import {hashText} from './data-model.js';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const safeBody=async request=>{try{return await request.json()}catch{return null}};
const sheetId=roomId=>`sheet:${roomId}`;

export async function handleSpreadsheetState(request,env,roomId){
  const room=await env.DB.prepare('SELECT room_id FROM room WHERE room_id=?').bind(roomId).first();
  if(!room)return json({error:'自陣が見つかりません'},404);

  if(request.method==='GET'){
    const row=await env.DB.prepare('SELECT sheet_settings,updated_at FROM spreadsheet WHERE room_id=? ORDER BY created_at LIMIT 1').bind(roomId).first();
    let state=null;
    try{state=row?.sheet_settings?JSON.parse(row.sheet_settings):null}catch{}
    return json({state,revision:row?await hashText(row.sheet_settings):null,updatedAt:row?.updated_at||''});
  }

  if(request.method==='POST'){
    const body=await safeBody(request),state=body?.state??{};
    const text=JSON.stringify(state);
    if(text.length>1_500_000)return json({error:'Spreadsheetの保存データが大きすぎます'},413);
    if(!body||!Object.hasOwn(body,'baseRevision'))return json({error:'画面を再読み込みしてください',code:'SHEET_CONFLICT'},409);
    const old=await env.DB.prepare('SELECT sheet_id,sheet_settings FROM spreadsheet WHERE room_id=? ORDER BY created_at LIMIT 1').bind(roomId).first();
    const revision=old?await hashText(old.sheet_settings):null;
    if(body.baseRevision!==revision)return json({error:'他の画面で更新されています。再読み込みしてください',code:'SHEET_CONFLICT'},409);
    const sid=old?.sheet_id||sheetId(roomId),name=String(state?.name||state?.title||'Sheets').slice(0,120);
    const result=old?await env.DB.prepare('UPDATE spreadsheet SET sheet_name=?,sheet_settings=?,updated_at=CURRENT_TIMESTAMP WHERE sheet_id=? AND sheet_settings=?').bind(name,text,sid,old.sheet_settings).run():
      await env.DB.prepare(`INSERT INTO spreadsheet(sheet_id,room_id,sheet_name,row_count,column_count,sheet_settings) VALUES(?,?,?,0,0,?) ON CONFLICT(sheet_id) DO NOTHING`).bind(sid,roomId,name,text).run();
    if(!result.meta?.changes)return json({error:'他の画面で更新されています。再読み込みしてください',code:'SHEET_CONFLICT'},409);
    return json({ok:true,revision:await hashText(text)});
  }

  return json({error:'Method not allowed'},405);
}
