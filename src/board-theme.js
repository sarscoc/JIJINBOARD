const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});

const defaults={color1:"#171a20",textColor2:"#171a20",color2:"#f5f6f7",backgroundMode:"white-gradient",backgroundColor:"#f5f7fa",backgroundImage:"",alternateCells:false,alternateCellColor:"#f7f7f8"};
const color=value=>/^#[0-9a-f]{6}$/i.test(String(value||""))?String(value):null;
function normalize(input){
  if(!input||typeof input!=="object")return null;
  const out={...defaults};
  out.color1=color(input.color1)||defaults.color1;
  out.textColor2=color(input.textColor2)||defaults.textColor2;
  out.color2=color(input.color2)||defaults.color2;
  out.backgroundColor=color(input.backgroundColor)||defaults.backgroundColor;
  out.alternateCellColor=color(input.alternateCellColor)||defaults.alternateCellColor;
  out.backgroundMode=["white-gradient","black-gradient","color","image"].includes(input.backgroundMode)?input.backgroundMode:defaults.backgroundMode;
  out.alternateCells=!!input.alternateCells;
  const image=typeof input.backgroundImage==="string"?input.backgroundImage:"";
  out.backgroundImage=/^data:image\/(?:png|jpe?g|webp);base64,/i.test(image)&&image.length<=650000?image:"";
  if(out.backgroundMode==="image"&&!out.backgroundImage)out.backgroundMode="white-gradient";
  return out;
}

async function ensureTable(db){
  await db.prepare(`CREATE TABLE IF NOT EXISTS board_theme_settings (
    board_id TEXT PRIMARY KEY,
    theme_json TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
}

export async function handleBoardTheme(request,env,boardId){
  await ensureTable(env.DB);
  const board=await env.DB.prepare("SELECT admin_token FROM boards WHERE id=?").bind(boardId).first();
  if(!board)return json({error:"自陣が見つかりません"},404);
  if(request.method==="GET"){
    const row=await env.DB.prepare("SELECT theme_json,updated_at FROM board_theme_settings WHERE board_id=?").bind(boardId).first();
    let theme=null;try{theme=row?normalize(JSON.parse(row.theme_json||"{}")):null}catch{}
    return json({theme,updatedAt:row?.updated_at||""});
  }
  const token=request.headers.get("x-board-admin-token")||"";
  if(!token||token!==board.admin_token)return json({error:"デザインを変更できるのは部屋主だけです"},403);
  if(request.method==="DELETE"){
    await env.DB.prepare("DELETE FROM board_theme_settings WHERE board_id=?").bind(boardId).run();
    return json({ok:true,theme:null});
  }
  if(request.method!=="POST")return json({error:"Method not allowed"},405);
  let body=null;try{body=await request.json()}catch{}
  const theme=normalize(body?.theme);
  if(!theme)return json({error:"デザイン設定が正しくありません"},400);
  const packed=JSON.stringify(theme);
  if(packed.length>700000)return json({error:"背景画像が大きすぎます"},413);
  await env.DB.prepare(`INSERT INTO board_theme_settings(board_id,theme_json,updated_at)
    VALUES(?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(board_id) DO UPDATE SET theme_json=excluded.theme_json,updated_at=CURRENT_TIMESTAMP`)
    .bind(boardId,packed).run();
  return json({ok:true,theme});
}
