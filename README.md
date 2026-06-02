# Sales Total Slack Post

GitHub Actions で毎朝 Google Sheets の `指導中` タブ `K:K` を集計し、Slack に売り上げ合計を投稿する最小構成です。

## 仕組み

- GitHub Actions が毎日 `07:00 JST` に実行されます。
- `scripts/post-sales-total.mjs` が Google Sheets API から `K:K` を取得します。
- ヘッダー、空白、非数値セルを除外し、`¥` やカンマを除去して合計します。
- Slack `chat.postMessage` でチャンネルに投稿します。

## GitHub Secrets

以下をリポジトリの Secrets に設定してください。

- `SLACK_BOT_TOKEN`
- `SLACK_CHANNEL_ID`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_SHEETS_SPREADSHEET_ID`
- `GOOGLE_SHEETS_SHEET_NAME`
- `GOOGLE_SHEETS_COLUMN_RANGE`

推奨値:

- `SLACK_CHANNEL_ID=G089NM0JUSK`
- `GOOGLE_SHEETS_SPREADSHEET_ID=14RmSfROInL8xHnp4xRpXBeyzNuCpfMS4FDgKM5sGVjY`
- `GOOGLE_SHEETS_SHEET_NAME=指導中`
- `GOOGLE_SHEETS_COLUMN_RANGE=K:K`

## Google 側の準備

1. Google Cloud で Service Account を作成する
2. Google Sheets API を有効化する
3. Service Account の秘密鍵を発行する
4. 対象スプレッドシートを Service Account のメールアドレスに共有する
5. `client_email` を `GOOGLE_SERVICE_ACCOUNT_EMAIL` に設定する
6. `private_key` を `GOOGLE_PRIVATE_KEY` に設定する

`GOOGLE_PRIVATE_KEY` は改行を含むまま保存するか、`\n` エスケープ文字列でも動きます。

## Slack 側の準備

1. Slack App に `chat:write` 権限を付与する
2. 対象チャンネルに Bot を参加させる
3. Bot Token を `SLACK_BOT_TOKEN` に設定する

## 実行

- 手動実行: GitHub Actions の `Post Sales Total` を `Run workflow`
- ローカル確認: `npm run check`
- Secrets 雛形: `.env.example` を GitHub Secrets 登録時のメモとして使えます

## 失敗時

- Google Sheets の読み取り失敗や Slack 投稿失敗時は workflow を fail させます。
- Slack 投稿自体に失敗した場合は Slack への通知はできないため、GitHub Actions の実行ログ確認が必要です。

## GitHub に載せるとき

1. 新しい GitHub リポジトリを作る
2. このフォルダを push する
3. `.env.example` を見ながら Secrets を登録する
4. Actions から `Run workflow` を 1 回実行して動作確認する
