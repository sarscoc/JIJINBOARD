# JIJINBOARD

LOGCOMMENTSを核に、MAGIA MATRIXとSheetsをまとめたTRPG統合WEBアプリです。

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
- `/spreadsheet/` — Sheets本体

各自陣は複数ログを持てます。左のログ一覧ではシナリオ名、開封状態、参加PCを確認でき、未開封ログを開く前にネタバレ注意を表示します。参加PCは各PLがLOGの発言者設定へ登録したPCから選びます。

## 保存とリアルタイムの役割

- 永続データ: D1 / R2
- リアルタイム通知: Durable Objects / WebSocket

Durable Objectsにコメント本文やログ本文は保存しません。通知が一時的に切れてもD1/R2上のデータは残ります。

統合版には7日TTL、自動削除、期限延長、期限切れRoom cleanup、部屋数制限を設けていません。ユーザーが明示的に削除するまで保持します。

## コメントの共通APIと対象アドレス

LOG / MAGIA MATRIX / Sheets は `src/comments.js` の保存・取得・返信・編集・♡・削除を共有します。
対象の住所は `public/shared/comment-target.js` で組み立て、同じコードでブラウザとWorkerが検証します。

| 対象 | アドレス例 |
| --- | --- |
| ログの文字範囲 | `/boards/B/logs/L/ranges/M?start=0&end=12&endMessage=M` |
| MATRIXのコマ | `/boards/B/matrix/T/points/P` |
| Sheetsのセル | `/boards/B/sheets/main/cells/C` |

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

## 画面の初期化と旧データ

各画面のスクリプト・CSSは、その画面のHTMLで一度だけ読み込みます。Workerは旧UIや追加の描画処理をHTMLへ挿入しません。
人物・コメント・レイアウトの画面初期化には重複実行防止を設けています。
保存済みの空のSheetsも正規の保存データとして扱い、端末内の古い内容を自動で再登録しません。APIの `no-store` 指示もブラウザキャッシュで守ります。
既存コメントやテンプレート、人物データの互換読み込み・明示的削除の記録は維持します。

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

## 古い端末からの復活防止

すべてのAPI書き込みには `GET /api/dataset` で確認した `x-jijin-dataset` が必要です。ヘッダーなし・世代違いの旧クライアントは409で拒否します。この値は鮮度確認用で、認証を代替しません。
HTMLの最初に `dataset-guard.js` を読み込みます。世代変更時はアプリの端末キャッシュを破棄して再読み込みし、旧画面で組み立てた送信内容を新世代へ再送しません。IndexedDBも世代別・Sheets画像は部屋別に分離します。世代変更時は管理鍵・PLアクセス情報を含むアプリの端末キャッシュを除去します。

Sheetsはサーバーが空・未保存の場合でもローカルデータや画像を自動復元しません。全体保存には取得時の `baseRevision` が必要で、競合時は保存を停止して再読み込みを求めます。PC削除は `deleted_character` に削除記録を残し、マスター同期や発言者登録で同じIDを再作成できません。

**実際に初期化するときは、書き込みを停止した保守時間中にD1/R2を消去し、`app_dataset.generation` を新しいUUIDへ必ず変更してください。** 全テーブルを初期化した場合は次のアクセスで新しい世代が作られます。世代だけを維持したデータ消去は不可です。削除記録は通常運用で消さず、完全初期化時だけ世代変更と一緒に破棄します。通常のコード更新では初期化しません。今回は下記の明示的な一回限りの初期化指定を使います。

## 部屋ごとのPL・PC管理

PLのD1主キーは `/boards/{部屋ID}/players/{PL ID}`、PCはその下の `/characters/{PC ID}` です。各IDをURLエンコードし、部屋をまたいで同じID・表示名を使っても別レコードとして扱います。引き継ぎ・削除記録もこのPLアドレスに結び付けます。画像はR2の `rooms/{部屋ID}/pl-icons/`、`character-icons/`、`matrix-icons/` 配下に保存します。

APIは `/api/boards/{部屋ID}/players` で登録、`/players/{PL ID}` で取得・更新、`/players/{PL ID}/characters/{PC ID}` で削除、`/players/{PL ID}/selection` で部屋内のPC選択、`/players/{PL ID}/code` と `/players/redeem/{コード}` で同じ部屋内の端末追加を行います。旧 `/api/player-master`・`/api/profile-transfers` は410で停止します。

端末のPL情報・トークン・人物候補・PC一覧も `board:{部屋ID}:players:` 配下に分け、旧共通キャッシュは移しません。管理TOPの共通PEOPLEは廃止し、各部屋の設定で登録します。ログ・MATRIXは同じ部屋のPCを共有し、Sheetsのキャラクターは引き続き独立です。古いコメントや復旧用バックアップからPCを再生成する処理は削除しています。

## 今回依頼された本番データの一括初期化

`wrangler.jsonc` の `RESET_DATASET_ONCE=room-scoped-players-20261102-ef325b3d` は、ユーザーから明示的に依頼された今回一度の初期化指定です。Workerの次のリクエストで、先にデータ世代を失効させ、30秒の待機中はアプリへのアクセスを503で停止します。その後D1の部屋・ログ・コメント・PL・PC・Sheets・MATRIX・旧形式のテーブル／ビューを消去して現行スキーマだけを作り直し、LOGSバケットの全オブジェクトも削除します。管理TOPの認証設定とセッション、データ世代、初期化管理記録は残します。

`app_reset` に完了を記録し、同じ指定で再デプロイしても二度目の消去はしません。失敗時は完了扱いにせず、メンテナンス状態を維持して次のリクエストで再開します。全データテーブルの空確認・R2の空確認・外部キー確認が通ってからアクセスを再開します。`GET /api/dataset` の `reset.state=complete` と `completedAt` で完了確認できます。通常の更新ではこの指定値を変更したり完了記録を消したりしないでください。
