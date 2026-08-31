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
    return json({state,updatedAt:row?.updated_at||''});
  }

  if(request.method==='POST'){
    const body=await safeBody(request),state=body?.state??{};
    const text=JSON.stringify(state);
    if(text.length>1_500_000)return json({error:'Spreadsheetの保存データが大きすぎます'},413);
    const sid=sheetId(roomId),name=String(state?.name||state?.title||'Spreadsheet').slice(0,120);
    await env.DB.prepare(`INSERT INTO spreadsheet(sheet_id,room_id,sheet_name,row_count,column_count,sheet_settings,updated_at)
      VALUES(?,?,?,0,0,?,CURRENT_TIMESTAMP)
      ON CONFLICT(sheet_id) DO UPDATE SET sheet_name=excluded.sheet_name,sheet_settings=excluded.sheet_settings,updated_at=CURRENT_TIMESTAMP`)
      .bind(sid,roomId,name,text).run();
    return json({ok:true});
  }

  return json({error:'Method not allowed'},405);
}
