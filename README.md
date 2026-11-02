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

これだけで、初回デプロイ時に以下がまとめて準備されます。Workers URLが無効の場合は、Workerの `Domains` でProductionの `workers.dev` をONにします。

- 画面一式（Static Assets）
- D1データベース（部屋、コメント、返信、♡）
- R2バケット（ログ本文、重複排除した人物アイコン）
- Durable Objects（入室者、入力中、更新通知）
- WebSocketリアルタイム更新
- D1の初期テーブル

デプロイ後は `https://jijinboard.<アカウントのサブドメイン>.workers.dev` で開けます。以降はJIJINBOARDの `main` を更新するとCloudflareが自動デプロイします。

## URL構成

- `/` — 部屋主専用の管理TOP（このブラウザが管理鍵を持つ自陣だけを表示）
- `/board/?id=...` — 参加者へ共有する自陣の部屋。複数ログと3機能タブを表示
- `/log/` — 既存TRPG LOG MARKER本体（統合画面内でも既存処理をそのまま利用）
- `/matrix/` — MAGIA MATRIX本体
- `/spreadsheet/` — CHARA DATA HUB本体

各自陣は複数ログを持てます。左のログ一覧ではシナリオ名、開封状態、参加PCを確認でき、未開封ログを開く前にネタバレ注意を表示します。参加PCは各PLがLOGの発言者設定へ登録したPCから選びます。

## 保存とリアルタイムの役割

- 永続データ: D1 / R2
- リアルタイム通知: Durable Objects / WebSocket

Durable Objectsにコメント本文やログ本文は保存しません。通知が一時的に切れてもD1/R2上のデータは残ります。

統合版には7日TTL、自動削除、期限延長、期限切れRoom cleanup、部屋数制限を設けていません。ユーザーが明示的に削除するまで保持します。

## コメントの共通APIと対象アドレス

LOG / MAGIA MATRIX / CHARA DATA HUB は `src/comments.js` の保存・取得・返信・編集・♡・削除を共有します。
対象の住所は `public/shared/comment-target.js` で組み立て、同じコードでブラウザとWorkerが検証します。

| 対象 | アドレス例 |
| --- | --- |
| ログの文字範囲 | `/boards/B/logs/L/ranges/M?start=0&end=12&endMessage=M` |
| MATRIXのコマ | `/boards/B/matrix/T/points/P` |
| DATA HUBのセル | `/boards/B/sheets/main/cells/C` |

各IDはURLエンコードします。表示名・行番号ではなく既存の安定したIDを使い、ログの文字位置はJavaScriptのUTF-16オフセットです。
これらは対象識別用のアドレスです。ブラウザの遷移先や認証情報ではありません。

- `GET /api/boards/B/comments?scope=対象の親アドレス&authorId=閲覧者ID` — 一覧。`target=完全な対象アドレス` なら対象を完全一致で絞り込み。
- `POST /api/boards/B/comments` — `{target, body, authorId, authorName, personaType, personaName, characterId?, parentId?, imageData?}`。引用文・マーカー色は追加の表示情報。
- `GET/PATCH/DELETE /api/boards/B/comments/コメントID` — 取得・編集・削除。
- `POST /api/boards/B/comments/コメントID/like` — ♡。返信・画像も対象の種類によらず同じ処理。
- `GET /api/boards/B/comments/コメントID/image` — 添付画像。

コマ周辺の短文は、同じコマのアドレスを持つ表示用ラベルです。
`GET /api/boards/B/comments/note?target=コマのアドレス` で取得し、`PUT /api/boards/B/comments/note` の `{target, body, authorId, baseComment, commentPosition}` で保存します。
発言者・返信・♡を持つコメント欄とは用途を区別し、既存の `matrix_point` に保持します。保存はブラウザ内で直列化し、`baseComment` と現在値が異なる場合は409を返します。

永続化成功後の通知は全種類でサーバーから `comment:*` イベントを送ります。
`public/shared/comments.js` がキャッシュを避けた通信・取得中の更新通知の再取得・再接続・タブ復帰時の取得を共有します。
画面ごとのコードは選択対象と表示を担当します。座標やテンプレ画像の保存は引き続き独立しています。

既存のコメントID・返信・♡・画像・保存テーブルは変更しません。
旧APIは `src/comments-legacy.js` でアドレスに変換して共通処理へ渡します。
テンプレート情報のない古いMATRIXコメントは `matrix-legacy` の住所を維持し、勝手に別のページへ割り当てません。
本番データの再登録・削除・破壊的移行は不要です。

## ローカル確認（必要な場合だけ）

```bash
npm install
npm run dev
```

通常の導入ではローカル操作は不要です。

## 構成

- `public/` — 部屋主管理TOP、統合部屋、LOG、MATRIX、Spreadsheet
- `src/index.js` — Static Assetsと既存LOG APIをつなぐ薄いWorker
- `functions/api/[[path]].js` — LOGCOMMENTSの既存API
- `realtime-worker/src/index.js` — 既存RoomHub（Durable Objects / WebSocket）
- `src/schema.js` — 新しいD1を初回アクセス時に初期化
- `wrangler.jsonc` — Cloudflare一括デプロイ設定

Cloudflare公式資料:

- [Workers BuildsのGit連携](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/)
- [D1/R2の自動プロビジョニング](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
