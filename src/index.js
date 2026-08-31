import { onRequest as handleApi } from './api-v2.js';
import { onRequest as handlePlayerMaster } from '../functions/api/player-master/[[path]].js';
import { RoomHub } from '../realtime-worker/src/index.js';
import { ensureSchema } from './schema.js';
import { handleLogTabSettings } from './log-tab-settings.js';
import { handleMatrixTemplateComments } from './matrix-template-comments.js';
import { handleMatrixPoint } from './matrix-point.js';
import { createStreamRoom,handleLogStream,prepareStreamRoomDelete } from './log-stream.js';
import { handleBoardTheme } from './board-theme.js';
import { handleGroupRowColors } from './group-row-colors.js';
import { handleSpreadsheetComments } from './spreadsheet-comments.js';
import { handleLogDisplayMode } from './log-display-mode.js';
import { handleRoomLogMeta } from './room-log-meta.js';
import { handleTopAuthApi,serveProtectedTop } from './top-auth.js';

export { RoomHub };
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const contextFor=(request,env,path,executionContext)=>({request,env,params:{path},waitUntil:p=>executionContext.waitUntil(p),next:()=>env.ASSETS.fetch(request)});

export default{
  async fetch(request,env,executionContext){
    const url=new URL(request.url);
    if(!env.DB){if(url.pathname.startsWith('/api/'))return json({error:'D1データベースが接続されていません'},503);return new Response('管理TOPを読み込めません。D1接続を確認してください。',{status:503})}
    await ensureSchema(env.DB);

    if(/^\/index(?:\.html)?\/?$/.test(url.pathname)||url.pathname==='/'){
      if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Method not allowed',{status:405});
      return serveProtectedTop(request,env);
    }
    if(!url.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
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

    const boardRealtime=url.pathname.match(/^\/api\/boards\/([^/]+)\/realtime$/);
    if(boardRealtime){if(request.method!=='GET'||request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return json({error:'WebSocket接続が必要です'},426);const roomId=decodeURIComponent(boardRealtime[1]);if(!await env.DB.prepare('SELECT room_id FROM room WHERE room_id=?').bind(roomId).first())return json({error:'自陣が見つかりません'},404);return env.ROOMS.get(env.ROOMS.idFromName(roomId)).fetch(new Request(new URL('/realtime',request.url),request))}

    const boardRoot=url.pathname.match(/^\/api\/boards\/([^/]+)$/);
    if(boardRoot&&request.method==='GET')return handleRoomLogMeta(request,env,decodeURIComponent(boardRoot[1]));
    const boardLogs=url.pathname.match(/^\/api\/boards\/([^/]+)\/logs(?:\/([^/]+))?$/);
    if(boardLogs&&(request.method==='POST'||request.method==='PATCH')){
      const handled=await handleRoomLogMeta(request,env,decodeURIComponent(boardLogs[1]),boardLogs[2]?decodeURIComponent(boardLogs[2]):'');
      if(handled)return handled;
    }

    const theme=url.pathname.match(/^\/api\/boards\/([^/]+)\/theme$/);if(theme)return handleBoardTheme(request,env,decodeURIComponent(theme[1]));
    const group=url.pathname.match(/^\/api\/boards\/([^/]+)\/group-row-colors$/);if(group)return handleGroupRowColors(request,env,decodeURIComponent(group[1]));
    const display=url.pathname.match(/^\/api\/boards\/([^/]+)\/logs\/([^/]+)\/display-mode$/);if(display)return handleLogDisplayMode(request,env,decodeURIComponent(display[1]),decodeURIComponent(display[2]));
    const sheetComments=url.pathname.match(/^\/api\/boards\/([^/]+)\/spreadsheet\/comments(?:\/([^/]+))?(?:\/([^/]+))?$/);if(sheetComments)return handleSpreadsheetComments(request,env,decodeURIComponent(sheetComments[1]),sheetComments[2]?decodeURIComponent(sheetComments[2]):'',sheetComments[3]?decodeURIComponent(sheetComments[3]):'');
    const matrixPoint=url.pathname.match(/^\/api\/boards\/([^/]+)\/matrix\/([^/]+)\/points\/([^/]+)$/);if(matrixPoint)return handleMatrixPoint(request,env,decodeURIComponent(matrixPoint[1]),decodeURIComponent(matrixPoint[2]),decodeURIComponent(matrixPoint[3]));
    const templateComments=url.pathname.match(/^\/api\/boards\/([^/]+)\/matrix\/([^/]+)\/template-comments\/([^/]+)$/);if(templateComments)return handleMatrixTemplateComments(request,env,decodeURIComponent(templateComments[1]),decodeURIComponent(templateComments[2]),decodeURIComponent(templateComments[3]),executionContext);
    const tabSettings=url.pathname.match(/^\/api\/boards\/([^/]+)\/log-tab-settings\/([^/]+)$/);if(tabSettings)return handleLogTabSettings(request,env,decodeURIComponent(tabSettings[1]),decodeURIComponent(tabSettings[2]));

    const path=url.pathname.slice('/api/'.length).split('/').filter(Boolean);
    return handleApi(contextFor(request,env,path,executionContext));
  }
};
