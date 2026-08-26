# JIJINBOARD

LOGCOMMENTSを核に、MAGIA MATRIXとCHARA DATA HUBをまとめたTRPG統合WEBアプリです。

## いちばん簡単なCloudflare導入

### 0. R2を有効にする（新規アカウントのみ）

Cloudflare Dashboardの `Storage & databases` → `R2` を開き、R2の利用開始手続きを完了します。

R2には無料枠がありますが、Cloudflare側の仕様として最初にR2 subscriptionのcheckoutが必要です。

### 1. GitHubから取り込む

1. Cloudflare Dashboardの `Workers & Pages` を開く
2. `Create application` を押す
3. `Import a repository` を選ぶ
4. GitHubを接続し、`sarscoc/JIJINBOARD` を選ぶ
5. Worker名を聞かれた場合は **`jijinboard`** にする
6. Build commandは空欄、Deploy commandは **`npx wrangler deploy`** のまま `Save and Deploy`

これだけで、初回デプロイ時に以下がまとめて準備されます。

- 画面一式（Static Assets）
- D1データベース（部屋、コメント、返信、♡）
- R2バケット（ログ本文、重複排除した人物アイコン）
- Durable Objects（入室者、入力中、更新通知）
- WebSocketリアルタイム更新
- D1の初期テーブル

デプロイ後は `https://jijinboard.<アカウントのサブドメイン>.workers.dev` で開けます。以降はJIJINBOARDの `main` を更新するとCloudflareが自動デプロイします。

## URL構成

- `/` — TRPG PROJECT TOP、Session一覧、共通PL／PC／NPC
- `/log/` — TRPG LOG MARKER本体
- `/matrix/` — MAGIA MATRIX
- `/spreadsheet/` — CHARA DATA HUB

## 保存とリアルタイムの役割

- 永続データ: D1 / R2
- リアルタイム通知: Durable Objects / WebSocket

Durable Objectsにコメント本文やログ本文は保存しません。通知が一時的に切れてもD1/R2上のデータは残ります。

統合版には7日TTL、自動削除、期限延長、期限切れRoom cleanup、部屋数制限を設けていません。ユーザーが明示的に削除するまで保持します。

## ローカル確認（必要な場合だけ）

```bash
npm install
npm run dev
```

通常の導入ではローカル操作は不要です。

## 構成

- `public/` — TOP、LOG、MATRIX、Spreadsheet
- `src/index.js` — Static Assetsと既存LOG APIをつなぐ薄いWorker
- `functions/api/[[path]].js` — LOGCOMMENTSの既存API
- `realtime-worker/src/index.js` — 既存RoomHub（Durable Objects / WebSocket）
- `src/schema.js` — 新しいD1を初回アクセス時に初期化
- `wrangler.jsonc` — Cloudflare一括デプロイ設定

Cloudflare公式資料:

- [Workers BuildsのGit連携](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/)
- [D1/R2の自動プロビジョニング](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
