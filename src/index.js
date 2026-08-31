import { onRequest as handleApi } from './api-v2.js';
import { onRequest as handlePlayerMaster } from '../functions/api/player-master/[[path]].js';
import { RoomHub } from '../realtime-worker/src/index.js';
import { ensureSchema } from './schema.js';
import { handleLogTabSettings } from './log-tab-settings.js';
import { handleMatrixTemplateComments } from './matrix-template-comments.js';
import { handleMatrixTemplates } from './matrix-templates.js';
import { handleMatrixPoint } from './matrix-point.js';
import { handleMatrixState } from './matrix-state.js';
import { createStreamRoom,handleLogStream,prepareStreamRoomDelete } from './log-stream.js';
import { handleLogCommentMutation } from './log-comments-fast.js';
import { handleBoardTheme } from './board-theme.js';
import { handleGroupRowColors } from './group-row-colors.js';
import { handleSpreadsheetComments } from './spreadsheet-comments.js';
import { handleSpreadsheetState } from './spreadsheet-state.js';
import { handleSpreadsheetImage } from './spreadsheet-images.js';
import { handleLogDisplayMode } from './log-display-mode.js';
import { handleRoomLogMeta } from './room-log-meta.js';
import { handleRoomParticipants } from './room-participants.js';
import { handleRoomDelete } from './room-delete.js';
import { handleTopAuthApi,serveProtectedTop } from './top-auth.js';

export { RoomHub };
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const contextFor=(request,env,path,executionContext)=>({request,env,params:{path},waitUntil:p=>executionContext.waitUntil(p),next:()=>env.ASSETS.fetch(request)});
async function serveAsset(request,env,url){
  const response=await env.ASSETS.fetch(request);
  if(request.method==='GET'&&/^\/log\/?(?:index\.html)?$/.test(url.pathname)&&response.ok){
    const type=response.headers.get('content-type')||'';
    if(type.includes('text/html')){
      const html=(await response.text()).replace('</body>','<script src="/log/comment-incremental-sync.js?v=20260831-1"></script></body>');
      const headers=new Headers(response.headers);headers.delete('content-length');headers.set('cache-control','no-cache');
      return new Response(html,{status:response.status,statusText:response.statusText,headers});
    }
  }
  if(request.method==='GET'&&/^\/matrix\/?(?:index\.html)?$/.test(url.pathname)&&response.ok){
    const type=response.headers.get('content-type')||'';
    if(type.includes('text/html')){
      const html=(await response.text()).replace('</body>','<script src="/matrix/matrix-template-sync.js?v=20260831-2"></script></body>');
      const headers=new Headers(response.headers);headers.delete('content-length');headers.set('cache-control','no-cache');
      return new Response(html,{status:response.status,statusText:response.statusText,headers});
    }
  }
  if(request.method==='GET'&&/^\/spreadsheet\/?(?:index\.html)?$/.test(url.pathname)&&response.ok){
    const type=response.headers.get('content-type')||'';
    if(type.includes('text/html')){
      const html=(await response.text()).replace('</body>','<script src="/spreadsheet/sheet-image-sync.js?v=20260831-2"></script></body>');
      const headers=new Headers(response.headers);headers.delete('content-length');headers.set('cache-control','no-cache');
      return new Response(html,{status:response.status,statusText:response.statusText,headers});
    }
  }
  return response;
}

export default{
  async fetch(request,env,executionContext){
    const url=new URL(request.url);
    if(!env.DB){if(url.pathname.startsWith('/api/'))return json({error:'D1データベースが接続されていません'},503);return new Response('管理TOPを読み込めません。D1接続を確認してください。',{status:503})}
    await ensureSchema(env.DB);

    if(/^\/index(?:\.html)?\/?$/.test(url.pathname)||url.pathname==='/'){
      if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Method not allowed',{status:405});
      return serveProtectedTop(request,env);
    }
    if(!url.pathname.startsWith('/api/'))return serveAsset(request,env,url);
    if(url.pathname.startsWith('/api/top-auth/'))return handleTopAuthApi(request,env,url.pathname.slice('/api/top-auth/'.length).split('/')[0]||'');
    if(!env.LOGS||!env.ROOMS)return json({error:'Cloudflareの保存先を準備中です。デプロイ完了後にもう一度お試しください。'},503);

    if(url.pathname==='/api/player-master'||url.pathname.startsWith('/api/player-master/')){
      const tail=url.pathname==='/api/player-master'?'':url.pathname.slice('/api/player-master/'.length),path=tail.split('/').filter(Boolean);
      return handlePlayerMaster({request,env,params:{path}});
    }
    if(request.method==='POST'&&url.pathname==='/api/rooms')return createStreamRoom(request,env);

    const stream=url.pathname.match(/^\/api\/rooms\/([^/]+)\/stream\/(meta|full|chunk|find)(?:\/([^/]+))?$/);
    if(stream)return handleLogStream(request,env,decodeURIComponent(stream[1]),stream[2],stream[3]?decodeURIComponent(stream[3]):'',executionContext);
    const direct=url.pathname.match(/^\/api\/rooms\/([^/]+)$/);
    if(direct&&request.method==='GET'&&url.searchParams.get('summary')!=='1')return handleLogStream(request,env,decodeURIComponent(direct[1]),'full','',executionContext);
    if(direct&&request.method==='DELETE'){const prepared=await prepareStreamRoomDelete(request,env,decodeURIComponent(direct[1]));if(prepared)return prepared}
    const logComment=url.pathname.match(/^\/api\/rooms\/([^/]+)\/annotations(?:\/([^/]+))?(?:\/([^/]+))?$/);
    if(logComment&&request.method!=='GET'){
      const handled=await handleLogCommentMutation(request,env,decodeURIComponent(logComment[1]),logComment[2]?decodeURIComponent(logComment[2]):'',logComment[3]?decodeURIComponent(logComment[3]):'',executionContext);
      if(handled)return handled;
    }

    const boardRealtime=url.pathname.match(/^\/api\/boards\/([^/]+)\/realtime$/);
    if(boardRealtime){if(request.method!=='GET'||request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return json({error:'WebSocket接続が必要です'},426);const roomId=decodeURIComponent(boardRealtime[1]);if(!await env.DB.prepare('SELECT room_id FROM room WHERE room_id=?').bind(roomId).first())return json({error:'自陣が見つかりません'},404);return env.ROOMS.get(env.ROOMS.idFromName(roomId)).fetch(new Request(new URL('/realtime',request.url),request))}

    const boardRoot=url.pathname.match(/^\/api\/boards\/([^/]+)$/);
    if(boardRoot&&request.method==='GET')return handleRoomLogMeta(request,env,decodeURIComponent(boardRoot[1]));
    if(boardRoot&&request.method==='DELETE')return handleRoomDelete(request,env,decodeURIComponent(boardRoot[1]),executionContext);
    const boardLogs=url.pathname.match(/^\/api\/boards\/([^/]+)\/logs(?:\/([^/]+))?$/);
    if(boardLogs&&(request.method==='POST'||request.method==='PATCH'||request.method==='DELETE')){
      const handled=await handleRoomLogMeta(request,env,decodeURIComponent(boardLogs[1]),boardLogs[2]?decodeURIComponent(boardLogs[2]):'',executionContext);
      if(handled)return handled;
    }
    const participant=url.pathname.match(/^\/api\/boards\/([^/]+)\/logs\/([^/]+)\/participants(?:\/([^/]+))?(?:\/matrix-icon)?$/);
    if(participant){const handled=await handleRoomParticipants(request,env,decodeURIComponent(participant[1]),decodeURIComponent(participant[2]),participant[3]?decodeURIComponent(participant[3]):'');if(handled)return handled}

    const theme=url.pathname.match(/^\/api\/boards\/([^/]+)\/theme$/);if(theme)return handleBoardTheme(request,env,decodeURIComponent(theme[1]));
    const group=url.pathname.match(/^\/api\/boards\/([^/]+)\/group-row-colors$/);if(group)return handleGroupRowColors(request,env,decodeURIComponent(group[1]));
    const display=url.pathname.match(/^\/api\/boards\/([^/]+)\/logs\/([^/]+)\/display-mode$/);if(display)return handleLogDisplayMode(request,env,decodeURIComponent(display[1]),decodeURIComponent(display[2]));
    const sheetState=url.pathname.match(/^\/api\/boards\/([^/]+)\/spreadsheet\/state$/);if(sheetState)return handleSpreadsheetState(request,env,decodeURIComponent(sheetState[1]));
    const sheetImage=url.pathname.match(/^\/api\/boards\/([^/]+)\/spreadsheet\/image$/);if(sheetImage)return handleSpreadsheetImage(request,env,decodeURIComponent(sheetImage[1]));
    const sheetComments=url.pathname.match(/^\/api\/boards\/([^/]+)\/spreadsheet\/comments(?:\/([^/]+))?(?:\/([^/]+))?$/);if(sheetComments)return handleSpreadsheetComments(request,env,decodeURIComponent(sheetComments[1]),sheetComments[2]?decodeURIComponent(sheetComments[2]):'',sheetComments[3]?decodeURIComponent(sheetComments[3]):'');
    const matrixTemplateImage=url.pathname.match(/^\/api\/boards\/([^/]+)\/matrix\/templates\/([^/]+)\/image$/);if(matrixTemplateImage)return handleMatrixTemplates(request,env,decodeURIComponent(matrixTemplateImage[1]),'',decodeURIComponent(matrixTemplateImage[2]),true);
    const matrixTemplates=url.pathname.match(/^\/api\/boards\/([^/]+)\/matrix\/([^/]+)\/templates(?:\/([^/]+))?$/);if(matrixTemplates)return handleMatrixTemplates(request,env,decodeURIComponent(matrixTemplates[1]),decodeURIComponent(matrixTemplates[2]),matrixTemplates[3]?decodeURIComponent(matrixTemplates[3]):'',false);
    const matrixPoint=url.pathname.match(/^\/api\/boards\/([^/]+)\/matrix\/([^/]+)\/points\/([^/]+)$/);if(matrixPoint)return handleMatrixPoint(request,env,decodeURIComponent(matrixPoint[1]),decodeURIComponent(matrixPoint[2]),decodeURIComponent(matrixPoint[3]));
    const matrixState=url.pathname.match(/^\/api\/boards\/([^/]+)\/matrix\/([^/]+)$/);if(matrixState)return handleMatrixState(request,env,decodeURIComponent(matrixState[1]),decodeURIComponent(matrixState[2]));
    const templateComments=url.pathname.match(/^\/api\/boards\/([^/]+)\/matrix\/([^/]+)\/template-comments\/([^/]+)$/);if(templateComments)return handleMatrixTemplateComments(request,env,decodeURIComponent(templateComments[1]),decodeURIComponent(templateComments[2]),decodeURIComponent(templateComments[3]),executionContext);
    const tabSettings=url.pathname.match(/^\/api\/boards\/([^/]+)\/log-tab-settings\/([^/]+)$/);if(tabSettings)return handleLogTabSettings(request,env,decodeURIComponent(tabSettings[1]),decodeURIComponent(tabSettings[2]));

    const path=url.pathname.slice('/api/'.length).split('/').filter(Boolean);
    return handleApi(contextFor(request,env,path,executionContext));
  }
};
