import {notifyResource} from './resource-notify.js';
import {performRequestedReset,requestedResetStatus} from './requested-reset.js';
import {datasetGeneration,checkDataset} from './data-freshness.js';
import {serveAsset} from './assets.js';
import {handleComments} from './comments.js';
import {handleLegacyComments} from './comments-legacy.js';
import { onRequest as handleApi } from './api-v2.js';
import {handleRoomPlayers} from './room-players.js';
import {servePlayerIcon} from './player-address.js';
import { RoomHub } from '../realtime-worker/src/index.js';
import { ensureSchema } from './schema.js';
import { handleLogTabSettings } from './log-tab-settings.js';
import { handleMatrixTemplateComments } from './matrix-template-comments.js';
import { handleMatrixTemplates } from './matrix-templates.js';
import { handleMatrixPoint } from './matrix-point.js';
import { handleMatrixState } from './matrix-state.js';
import { createStreamRoom,handleLogStream,prepareStreamRoomDelete } from './log-stream.js';
import { handleLogCommentWindow } from './log-comments-window.js';
import { handleBoardTheme } from './board-theme.js';
import { handleGroupRowColors } from './group-row-colors.js';
import { handleSpreadsheetState } from './spreadsheet-state.js';
import { handleSpreadsheetImage } from './spreadsheet-images.js';
import { handleLogDisplayMode } from './log-display-mode.js';
import { handleRoomLogMeta } from './room-log-meta.js';
import { handleRoomParticipants } from './room-participants.js';
import { handleRoomDelete } from './room-delete.js';
import { handleTopAuthApi,serveProtectedTop } from './top-auth.js';
import { handleBoardHomeImage } from './board-home-image.js';

export { RoomHub };
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const contextFor=(request,env,path,executionContext)=>({request,env,params:{path},waitUntil:p=>executionContext.waitUntil(p),next:()=>env.ASSETS.fetch(request)});

const worker={
  async fetch(request,env,executionContext){
    const url=new URL(request.url);
    // Normalize once so trailing slashes cannot reach obsolete fallback writers.
    if(url.pathname.startsWith('/api/'))url.pathname=url.pathname.replace(/\/+$/,'');
    if(!url.pathname.startsWith('/api/')&&url.pathname!=='/'&&!/^\/index(?:\.html)?\/?$/.test(url.pathname))return serveAsset(request,env,url);
    if(!env.DB){if(url.pathname.startsWith('/api/'))return json({error:'D1データベースが接続されていません'},503);return new Response('管理TOPを読み込めません。D1接続を確認してください。',{status:503})}
    if(url.pathname==='/api/dataset/reset-status'&&request.method==='GET'){try{return json({reset:await requestedResetStatus(env)})}catch{return json({reset:null})}}
    const resetting=await performRequestedReset(env);if(resetting){
      if(!url.pathname.startsWith('/api/'))return new Response('<!doctype html><html lang="ja"><meta charset="utf-8"><meta http-equiv="refresh" content="5"><title>初期化中</title><p>保存データを初期化しています。そのままお待ちください。</p></html>',{status:503,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
      return resetting;
    }
    await ensureSchema(env.DB);

    if(/^\/index(?:\.html)?\/?$/.test(url.pathname)||url.pathname==='/'){
      if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Method not allowed',{status:405});
      return serveProtectedTop(request,env);
    }
    if(!url.pathname.startsWith('/api/'))return serveAsset(request,env,url);
    if(url.pathname==='/api/dataset'&&request.method==='GET')return json({generation:await datasetGeneration(env.DB),reset:await requestedResetStatus(env)});
    const stale=await checkDataset(request,env.DB);if(stale)return stale;
    if(url.pathname.startsWith('/api/top-auth/'))return handleTopAuthApi(request,env,url.pathname.slice('/api/top-auth/'.length).split('/')[0]||'');
    if(!env.LOGS||!env.ROOMS)return json({error:'Cloudflareの保存先を準備中です。デプロイ完了後にもう一度お試しください。'},503);

    // Unscoped identity/transfer endpoints are retired; never import old profiles.
    if(/^\/api\/(?:player-master|profile-transfers)(?:\/|$)/.test(url.pathname))return json({error:'部屋のURLからPLを登録してください'},410);
    const players=url.pathname.match(/^\/api\/boards\/([^/]+)\/players(?:\/(.*))?$/);
    if(players)return handleRoomPlayers(request,env,decodeURIComponent(players[1]),(players[2]||'').split('/').filter(Boolean).map(decodeURIComponent),executionContext);
    const playerIcon=url.pathname.match(/^\/api\/boards\/([^/]+)\/player-icons\/([^/]+)\/([^/]+)$/);
    if(playerIcon)return servePlayerIcon(request,env,decodeURIComponent(playerIcon[1]),playerIcon[2],playerIcon[3]);
    if(request.method==='POST'&&url.pathname==='/api/rooms')return createStreamRoom(request,env);

    const stream=url.pathname.match(/^\/api\/rooms\/([^/]+)\/stream\/(meta|full|chunk|find)(?:\/([^/]+))?$/);
    if(stream)return handleLogStream(request,env,decodeURIComponent(stream[1]),stream[2],stream[3]?decodeURIComponent(stream[3]):'',executionContext);
    const direct=url.pathname.match(/^\/api\/rooms\/([^/]+)$/);
    if(direct&&request.method==='GET'&&url.searchParams.get('summary')!=='1')return handleLogStream(request,env,decodeURIComponent(direct[1]),'full','',executionContext);
    if(direct&&request.method==='DELETE'){
      const logId=decodeURIComponent(direct[1]),prepared=await prepareStreamRoomDelete(request,env,logId);if(prepared)return prepared;
      const log=await env.DB.prepare('SELECT room_id FROM log WHERE log_id=?').bind(logId).first();
      const headers=new Headers(request.headers);headers.set('x-board-admin-token',headers.get('x-admin-token')||headers.get('x-board-admin-token')||'');
      return handleRoomLogMeta(new Request(request,{headers}),env,log.room_id,logId,executionContext);
    }
    const commonComments=url.pathname.match(/^\/api\/boards\/([^/]+)\/comments(?:\/([^/]+))?(?:\/([^/]+))?$/);
    if(commonComments)return handleComments(request,env,decodeURIComponent(commonComments[1]),decodeURIComponent(commonComments[2]||''),decodeURIComponent(commonComments[3]||''),executionContext);
    const legacyComments=await handleLegacyComments(request,env,executionContext);
    if(legacyComments)return legacyComments;
    const logCommentWindow=url.pathname.match(/^\/api\/rooms\/([^/]+)\/annotations-window$/);
    if(logCommentWindow&&request.method==='GET')return handleLogCommentWindow(request,env,decodeURIComponent(logCommentWindow[1]));

    const boardRealtime=url.pathname.match(/^\/api\/boards\/([^/]+)\/realtime$/);
    if(boardRealtime){if(request.method!=='GET'||request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return json({error:'WebSocket接続が必要です'},426);const roomId=decodeURIComponent(boardRealtime[1]);if(!await env.DB.prepare('SELECT room_id FROM room WHERE room_id=?').bind(roomId).first())return json({error:'自陣が見つかりません'},404);return env.ROOMS.get(env.ROOMS.idFromName(roomId)).fetch(new Request(new URL('/realtime',request.url),request))}

    const boardHomeImage=url.pathname.match(/^\/api\/boards\/([^/]+)\/home-image$/);
    if(boardHomeImage)return handleBoardHomeImage(request,env,decodeURIComponent(boardHomeImage[1]));
    const boardRoot=url.pathname.match(/^\/api\/boards\/([^/]+)$/);
    if(boardRoot&&request.method==='GET')return handleRoomLogMeta(request,env,decodeURIComponent(boardRoot[1]));
    if(boardRoot&&request.method==='DELETE')return handleRoomDelete(request,env,decodeURIComponent(boardRoot[1]),executionContext);
    const boardLogs=url.pathname.match(/^\/api\/boards\/([^/]+)\/logs(?:\/([^/]+))?$/);
    if(boardLogs&&(request.method==='POST'||request.method==='PATCH'||request.method==='DELETE')){
      const handled=await handleRoomLogMeta(request,env,decodeURIComponent(boardLogs[1]),boardLogs[2]?decodeURIComponent(boardLogs[2]):'',executionContext);
      if(handled)return handled;
    }
    const boardParticipant=url.pathname.match(/^\/api\/boards\/([^/]+)\/participants$/);
    if(boardParticipant&&request.method==='GET')return handleRoomParticipants(request,env,decodeURIComponent(boardParticipant[1]));
    const participant=url.pathname.match(/^\/api\/boards\/([^/]+)\/logs\/([^/]+)\/participants(?:\/([^/]+))?(?:\/matrix-icon)?$/);
    if(participant){const handled=await handleRoomParticipants(request,env,decodeURIComponent(participant[1]),decodeURIComponent(participant[2]),participant[3]?decodeURIComponent(participant[3]):'',executionContext);if(handled)return handled}

    const theme=url.pathname.match(/^\/api\/boards\/([^/]+)\/theme$/);if(theme)return handleBoardTheme(request,env,decodeURIComponent(theme[1]));
    const group=url.pathname.match(/^\/api\/boards\/([^/]+)\/group-row-colors$/);if(group)return handleGroupRowColors(request,env,decodeURIComponent(group[1]));
    const display=url.pathname.match(/^\/api\/boards\/([^/]+)\/logs\/([^/]+)\/display-mode$/);if(display)return handleLogDisplayMode(request,env,decodeURIComponent(display[1]),decodeURIComponent(display[2]));
    const sheetState=url.pathname.match(/^\/api\/boards\/([^/]+)\/spreadsheet\/state$/);if(sheetState)return handleSpreadsheetState(request,env,decodeURIComponent(sheetState[1]));
    const sheetImage=url.pathname.match(/^\/api\/boards\/([^/]+)\/spreadsheet\/image$/);if(sheetImage)return handleSpreadsheetImage(request,env,decodeURIComponent(sheetImage[1]));

    const matrixTemplateImage=url.pathname.match(/^\/api\/boards\/([^/]+)\/matrix\/templates\/([^/]+)\/image$/);if(matrixTemplateImage)return handleMatrixTemplates(request,env,decodeURIComponent(matrixTemplateImage[1]),'',decodeURIComponent(matrixTemplateImage[2]),true);
    const matrixTemplates=url.pathname.match(/^\/api\/boards\/([^/]+)\/matrix\/([^/]+)\/templates(?:\/([^/]+))?$/);if(matrixTemplates)return handleMatrixTemplates(request,env,decodeURIComponent(matrixTemplates[1]),decodeURIComponent(matrixTemplates[2]),matrixTemplates[3]?decodeURIComponent(matrixTemplates[3]):'',false);
    const matrixPoint=url.pathname.match(/^\/api\/boards\/([^/]+)\/matrix\/([^/]+)\/points\/([^/]+)$/);if(matrixPoint)return handleMatrixPoint(request,env,decodeURIComponent(matrixPoint[1]),decodeURIComponent(matrixPoint[2]),decodeURIComponent(matrixPoint[3]),executionContext);
    const matrixState=url.pathname.match(/^\/api\/boards\/([^/]+)\/matrix\/([^/]+)$/);if(matrixState)return handleMatrixState(request,env,decodeURIComponent(matrixState[1]),decodeURIComponent(matrixState[2]));
    const templateComments=url.pathname.match(/^\/api\/boards\/([^/]+)\/matrix\/([^/]+)\/template-comments\/([^/]+)$/);if(templateComments)return handleMatrixTemplateComments(request,env,decodeURIComponent(templateComments[1]),decodeURIComponent(templateComments[2]),decodeURIComponent(templateComments[3]),executionContext);
    const tabSettings=url.pathname.match(/^\/api\/boards\/([^/]+)\/log-tab-settings\/([^/]+)$/);if(tabSettings)return handleLogTabSettings(request,env,decodeURIComponent(tabSettings[1]),decodeURIComponent(tabSettings[2]));

    const path=url.pathname.slice('/api/'.length).split('/').filter(Boolean);
    return handleApi(contextFor(request,env,path,executionContext));
  }
};

export default{async fetch(request,env,context){const copy=request.method==='POST'&&/\/spreadsheet\/state$/.test(new URL(request.url).pathname)?request.clone():null;const response=await worker.fetch(request,env,context);return notifyResource(request,response,env,context,copy)}};
