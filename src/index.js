import { onRequest as handleApi } from "../functions/api/[[path]].js";
import { onRequest as handlePlayerMaster } from "../functions/api/player-master/[[path]].js";
import { RoomHub } from "../realtime-worker/src/index.js";
import { ensureSchema } from "./schema.js";
import { handleLogTabSettings } from "./log-tab-settings.js";
import { handleMatrixTemplateComments } from "./matrix-template-comments.js";
import { handleMatrixPoint } from "./matrix-point.js";
import { createStreamRoom, handleLogStream, prepareStreamRoomDelete, cleanupStreamChunks } from "./log-stream.js";
import { handleBoardTheme } from "./board-theme.js";
import { handleGroupRowColors } from "./group-row-colors.js";
import { handleSpreadsheetComments } from "./spreadsheet-comments.js";
import { handleLogDisplayMode } from "./log-display-mode.js";
import { handleBoardParticipants } from "./board-participants.js";
import { handleTopAuthApi, serveProtectedTop } from "./top-auth.js";

export { RoomHub };

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

const fourDigitTransferCode = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 10000).padStart(4, "0");

async function createProfileTransfer(request, env) {
  let body = null;
  try { body = await request.json(); } catch {}
  const profile = body?.profile;
  if (!profile?.id || !profile?.plName) return json({ error: "PL情報が足りません" }, 400);

  await env.DB.prepare("CREATE TABLE IF NOT EXISTS profile_transfers (code TEXT PRIMARY KEY,profile_json TEXT NOT NULL,expires_at TEXT NOT NULL,used_at TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  const now = new Date().toISOString();
  await env.DB.prepare("DELETE FROM profile_transfers WHERE expires_at <= ? OR used_at <> ''").bind(now).run();
  const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  for (let attempt = 0; attempt < 32; attempt++) {
    const code = fourDigitTransferCode();
    try {
      await env.DB.prepare("INSERT INTO profile_transfers(code,profile_json,expires_at) VALUES(?,?,?)").bind(code, JSON.stringify(profile), expires).run();
      return json({ code, expiresAt: expires });
    } catch (error) {
      const message = String(error).toLowerCase();
      if (!message.includes("unique") && !message.includes("constraint")) throw error;
    }
  }

  return json({ error: "引き継ぎコードを発行できませんでした。もう一度お試しください。" }, 503);
}

export default {
  async fetch(request, env, executionContext) {
    const url = new URL(request.url);

    if (/^\/index(?:\.html)?\/?$/.test(url.pathname) || url.pathname === "/") {
      if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
      return serveProtectedTop(request, env);
    }

    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    if (url.pathname.startsWith("/api/top-auth/")) {
      const action=url.pathname.slice("/api/top-auth/".length).split("/")[0]||"";
      return handleTopAuthApi(request,env,action);
    }

    if (!env.DB || !env.LOGS || !env.ROOMS) {
      return json({ error: "Cloudflareの保存先を準備中です。デプロイ完了後にもう一度お試しください。" }, 503);
    }

    await ensureSchema(env.DB);

    if (url.pathname === "/api/player-master" || url.pathname.startsWith("/api/player-master/")) {
      const path=url.pathname.slice("/api/player-master/".length).split("/").filter(Boolean);
      return handlePlayerMaster({request,env,params:{path}});
    }

    if (request.method === "POST" && url.pathname === "/api/profile-transfers") {
      return createProfileTransfer(request, env);
    }

    if(request.method==="POST"&&url.pathname==="/api/rooms"){
      return createStreamRoom(request,env);
    }

    const roomIconMatch=url.pathname.match(/^\/api\/rooms\/([^/]+)\/icons\/([a-f0-9]{64})$/i);
    if(roomIconMatch){
      if(request.method!=="GET"&&request.method!=="HEAD")return new Response("Method not allowed",{status:405});
      const roomId=decodeURIComponent(roomIconMatch[1]);
      const room=await env.DB.prepare("SELECT id FROM rooms WHERE id=?").bind(roomId).first();
      if(!room)return new Response("Not found",{status:404});
      const object=await env.LOGS.get(`icons/${roomIconMatch[2].toLowerCase()}`);
      if(!object)return new Response("Not found",{status:404});
      const headers=new Headers();
      object.writeHttpMetadata(headers);
      headers.set("etag",object.httpEtag);
      headers.set("cache-control",headers.get("cache-control")||"private, max-age=31536000, immutable");
      return new Response(request.method==="HEAD"?null:object.body,{status:200,headers});
    }

    const logStreamMatch=url.pathname.match(/^\/api\/rooms\/([^/]+)\/stream\/(meta|full|chunk|find)(?:\/([^/]+))?$/);
    if(logStreamMatch){
      return handleLogStream(
        request,
        env,
        decodeURIComponent(logStreamMatch[1]),
        logStreamMatch[2],
        logStreamMatch[3]?decodeURIComponent(logStreamMatch[3]):"",
        executionContext
      );
    }

    const directRoomMatch=url.pathname.match(/^\/api\/rooms\/([^/]+)$/);
    if(directRoomMatch&&request.method==="GET"&&url.searchParams.get("summary")!=="1"){
      return handleLogStream(request,env,decodeURIComponent(directRoomMatch[1]),"full","",executionContext);
    }
    if(directRoomMatch&&request.method==="DELETE"){
      const prepared=await prepareStreamRoomDelete(request,env,decodeURIComponent(directRoomMatch[1]));
      if(prepared)return prepared;
    }

    const boardLogDeleteMatch=url.pathname.match(/^\/api\/boards\/([^/]+)\/logs\/([^/]+)$/);
    if(boardLogDeleteMatch&&request.method==="DELETE"){
      const boardId=decodeURIComponent(boardLogDeleteMatch[1]),roomId=decodeURIComponent(boardLogDeleteMatch[2]);
      const board=await env.DB.prepare("SELECT admin_token FROM boards WHERE id=?").bind(boardId).first();
      if(!board||request.headers.get("x-board-admin-token")!==board.admin_token)return json({error:"この自陣を編集できるのは部屋主だけです"},403);
      await cleanupStreamChunks(env,roomId).catch(()=>{});
    }

    const boardRealtimeMatch=url.pathname.match(/^\/api\/boards\/([^/]+)\/realtime$/);
    if(boardRealtimeMatch){
      if(request.method!=="GET"||request.headers.get("Upgrade")?.toLowerCase()!=="websocket")return json({error:"WebSocket接続が必要です"},426);
      const boardId=decodeURIComponent(boardRealtimeMatch[1]);
      const board=await env.DB.prepare("SELECT id FROM boards WHERE id=?").bind(boardId).first();
      if(!board)return json({error:"自陣が見つかりません"},404);
      const id=env.ROOMS.idFromName(`board:${boardId}`);
      return env.ROOMS.get(id).fetch(request);
    }

    const participantMatch=url.pathname.match(/^\/api\/boards\/([^/]+)\/logs\/([^/]+)\/participants(?:\/([^/]+))?$/);
    if(participantMatch){
      const handled=await handleBoardParticipants(
        request,
        env,
        decodeURIComponent(participantMatch[1]),
        decodeURIComponent(participantMatch[2]),
        participantMatch[3]?decodeURIComponent(participantMatch[3]):""
      );
      if(handled)return handled;
    }

    const themeMatch=url.pathname.match(/^\/api\/boards\/([^/]+)\/theme$/);
    if(themeMatch){
      return handleBoardTheme(request,env,decodeURIComponent(themeMatch[1]));
    }

    const groupColorsMatch=url.pathname.match(/^\/api\/boards\/([^/]+)\/group-row-colors$/);
    if(groupColorsMatch){
      return handleGroupRowColors(request,env,decodeURIComponent(groupColorsMatch[1]));
    }

    const logDisplayModeMatch=url.pathname.match(/^\/api\/boards\/([^/]+)\/logs\/([^/]+)\/display-mode$/);
    if(logDisplayModeMatch){
      return handleLogDisplayMode(
        request,
        env,
        decodeURIComponent(logDisplayModeMatch[1]),
        decodeURIComponent(logDisplayModeMatch[2])
      );
    }

    const sheetCommentsMatch=url.pathname.match(/^\/api\/boards\/([^/]+)\/spreadsheet\/comments(?:\/([^/]+))?(?:\/([^/]+))?$/);
    if(sheetCommentsMatch){
      return handleSpreadsheetComments(
        request,
        env,
        decodeURIComponent(sheetCommentsMatch[1]),
        sheetCommentsMatch[2]?decodeURIComponent(sheetCommentsMatch[2]):"",
        sheetCommentsMatch[3]?decodeURIComponent(sheetCommentsMatch[3]):""
      );
    }

    const matrixPointMatch=url.pathname.match(/^\/api\/boards\/([^/]+)\/matrix\/([^/]+)\/points\/([^/]+)$/);
    if(matrixPointMatch){
      return handleMatrixPoint(
        request,
        env,
        decodeURIComponent(matrixPointMatch[1]),
        decodeURIComponent(matrixPointMatch[2]),
        decodeURIComponent(matrixPointMatch[3])
      );
    }

    const matrixTemplateCommentsMatch=url.pathname.match(/^\/api\/boards\/([^/]+)\/matrix\/([^/]+)\/template-comments\/([^/]+)$/);
    if(matrixTemplateCommentsMatch){
      return handleMatrixTemplateComments(
        request,
        env,
        decodeURIComponent(matrixTemplateCommentsMatch[1]),
        decodeURIComponent(matrixTemplateCommentsMatch[2]),
        decodeURIComponent(matrixTemplateCommentsMatch[3]),
        executionContext
      );
    }

    const tabSettingsMatch=url.pathname.match(/^\/api\/boards\/([^/]+)\/log-tab-settings\/([^/]+)$/);
    if(tabSettingsMatch){
      return handleLogTabSettings(request,env,decodeURIComponent(tabSettingsMatch[1]),decodeURIComponent(tabSettingsMatch[2]));
    }

    const path = url.pathname.slice("/api/".length).split("/").filter(Boolean);

    return handleApi({
      request,
      env,
      params: { path },
      waitUntil: promise => executionContext.waitUntil(promise),
      next: () => env.ASSETS.fetch(request)
    });
  }
};
