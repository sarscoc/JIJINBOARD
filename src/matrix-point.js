const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});

const finite=(value,fallback=null)=>{
  const n=Number(value);
  return Number.isFinite(n)?n:fallback;
};

export async function handleMatrixPoint(request,env,boardId,roomId,itemId){
  if(request.method!=="PATCH")return json({error:"Method not allowed"},405);
  if(!boardId||!roomId||!itemId)return json({error:"座標情報が足りません"},400);

  const linked=await env.DB.prepare("SELECT 1 FROM board_logs WHERE board_id=? AND room_id=?").bind(boardId,roomId).first();
  if(!linked)return json({error:"この自陣にないログです"},404);

  let body=null;
  try{body=await request.json()}catch{}
  const authorId=String(body?.authorId||"").slice(0,100);
  const authorName=String(body?.authorName||"").trim().slice(0,80);
  if(!authorId||!authorName)return json({error:"先に発言者を登録してください"},400);

  const row=await env.DB.prepare("SELECT state_json FROM board_matrix_states WHERE board_id=? AND room_id=?").bind(boardId,roomId).first();
  let state={};
  try{state=row?.state_json?JSON.parse(row.state_json):{}}catch{state={}}
  state.items=state.items&&typeof state.items==="object"?state.items:{};
  const item=state.items[itemId]&&typeof state.items[itemId]==="object"?state.items[itemId]:{};

  if(body?.placed!==undefined)item.placed=!!body.placed;
  for(const [source,target] of [["x","x"],["y","y"],["templateX","templateX"],["templateY","templateY"],["scaleBaseWidth","scaleBaseWidth"]]){
    const value=finite(body?.[source]);
    if(value!==null)item[target]=value;
  }
  if(body?.coordVersion!==undefined){
    const version=Math.max(0,Math.min(10,Math.trunc(finite(body.coordVersion,0))));
    item.coordVersion=version;
  }
  state.items[itemId]=item;

  const serialized=JSON.stringify(state);
  if(serialized.length>1_500_000)return json({error:"MATRIXの保存データが大きすぎます"},413);
  await env.DB.prepare("INSERT INTO board_matrix_states(board_id,room_id,state_json,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(board_id,room_id) DO UPDATE SET state_json=excluded.state_json,updated_at=CURRENT_TIMESTAMP").bind(boardId,roomId,serialized).run();

  return json({ok:true,point:{itemId,placed:!!item.placed,x:item.x,y:item.y,templateX:item.templateX,templateY:item.templateY,coordVersion:item.coordVersion,scaleBaseWidth:item.scaleBaseWidth}});
}
