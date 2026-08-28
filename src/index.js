import { onRequest as handleApi } from "../functions/api/[[path]].js";
import { RoomHub } from "../realtime-worker/src/index.js";
import { ensureSchema } from "./schema.js";
import { handleLogTabSettings } from "./log-tab-settings.js";

export { RoomHub };

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

export default {
  async fetch(request, env, executionContext) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    if (!env.DB || !env.LOGS || !env.ROOMS) {
      return json({ error: "Cloudflareの保存先を準備中です。デプロイ完了後にもう一度お試しください。" }, 503);
    }

    await ensureSchema(env.DB);

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