import {handleComments, targets} from './comments.js';
import {parentRoomForLog} from './data-model.js';

// Old bookmarks and already-open clients are adapters, never a second CRUD path.
export async function handleLegacyComments(request,env,executionContext=null) {
  const url=new URL(request.url),log=url.pathname.match(/^\/api\/rooms\/([^/]+)\/annotations(?:\/([^/]+))?(?:\/([^/]+))?$/),
    sheet=url.pathname.match(/^\/api\/boards\/([^/]+)\/spreadsheet\/comments(?:\/([^/]+))?(?:\/([^/]+))?$/),
    matrix=url.pathname.match(/^\/api\/boards\/([^/]+)\/matrix\/([^/]+)\/comments(?:\/([^/]+))?(?:\/([^/]+))?$/);
  if(!log&&!sheet&&!matrix)return null;
  if(log&&log[2]==='color')return null; // Persona-wide marker color is a separate operation.
  let board,id,action,scope,logId='';
  if(log){
    logId=decodeURIComponent(log[1]);const row=await parentRoomForLog(env.DB,logId);
    if(!row)return new Response(JSON.stringify({error:'部屋が見つかりません'}),{status:404,headers:{'content-type':'application/json'}});
    board=row.room_id;id=decodeURIComponent(log[2]||'');action=decodeURIComponent(log[3]||'');scope=targets.log(board,logId);
  }else{
    const route=sheet||matrix;board=decodeURIComponent(route[1]);id=decodeURIComponent(route[sheet?2:3]||'');action=decodeURIComponent(route[sheet?3:4]||'');scope=sheet?targets.cell(board):targets.matrix(board);
    if(matrix && decodeURIComponent(matrix[2])!==board){
      const row=await parentRoomForLog(env.DB,decodeURIComponent(matrix[2]));
      if(!row||row.room_id!==board)return new Response(JSON.stringify({error:'この自陣にないログです'}),{status:404,headers:{'content-type':'application/json'}});
    }
  }
  let forwarded=request;
  if(request.method==='POST'&&!id){
    try{
      const b=await request.json();
      if(log)b.target=targets.log(board,logId,b);
      else if(sheet)b.target=targets.cell(board,b.cellId);
      else{
        const raw=String(b.targetId||''),at=raw.indexOf('@@matrix-template@@');
        b.target=at<0?`${targets.root(board)}/matrix-legacy/matrix_point/${encodeURIComponent(raw)}`:targets.matrix(board,raw.slice(0,at),raw.slice(at+'@@matrix-template@@'.length));
      }
      forwarded=new Request(request.url,{method:request.method,headers:request.headers,body:JSON.stringify(b)});
    }catch(error){return new Response(JSON.stringify({error:error.message}),{status:400,headers:{'content-type':'application/json'}})}
  }
  return handleComments(forwarded,env,board,id,action,executionContext,{scope});
}
