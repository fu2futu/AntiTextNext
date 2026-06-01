# TextNext Capacitor App

TextNext の iOS / Android アプリ版は、既存の Web 版 `https://textnext.jp` を Capacitor WebView 内で表示する構成です。

## 方針

- Web 版は引き続き Next.js / Vercel / Supabase で運用する
- アプリ版は `https://textnext.jp` を読み込む薄いネイティブラッパーにする
- 通常の画面修正や機能追加は Vercel へ反映すればアプリ側にも反映される
- ネイティブ権限、アイコン、ストア設定、Capacitor プラグイン追加は再ビルド・再提出が必要

## 追加した主要ファイル

- `capacitor.config.ts`
- `ios/`
- `android/`

## Bundle ID

現在の仮設定:

```txt
jp.textnext.app
```

App Store / Google Play に提出する前に、この Bundle ID / Application ID で確定して問題ないか確認してください。公開後の変更は面倒です。

## コマンド

```bash
npm run cap:sync
npm run cap:ios
npm run cap:android
npm run cap:ios:dev
npm run cap:ios:prod
```

`cap:sync` は `capacitor.config.ts` の内容や Web アセットを iOS / Android 側へ同期します。

## URL設定

標準では `https://textnext.jp` を読み込みます。

検証用に別URLを使う場合:

```bash
CAPACITOR_SERVER_URL=https://preview.example.com npm run cap:sync
```

ローカルのNext開発サーバーをiOSシミュレーターで読む場合:

```bash
npm run dev -- -H 127.0.0.1
npm run cap:ios:dev
```

この状態では、開発サーバーが止まるとアプリ側でCSS/JSが読めず、古いWebページのように崩れて見えることがあります。

本番URLへ戻す場合:

```bash
npm run cap:ios:prod
```

## まず確認すること

- アプリ内でログインできる
- ログイン状態が維持される
- 出品画像アップロードが動く
- バーコード読み取りが動く
- チャットが動く
- お知らせ/通知の導線が動く
- パスワード再設定リンクの扱いが問題ない

## 注意

- `server.url` 方式なので、Web更新はアプリにも反映されやすい
- ただし、App Store 審査では単なるWebViewではなく、学内教材フリマとしての機能価値を説明できる状態にする
- ネイティブPush通知やアプリアイコンバッジを本格対応する場合は、Capacitor Push Notifications などの追加検討が必要
