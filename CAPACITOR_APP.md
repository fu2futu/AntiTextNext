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

## アイコンとスプラッシュ

アプリアイコンは、ホーム画面とApp Storeに表示されるアプリの顔です。

現在は以下が入っています。

- Web/PWA用: `public/icons/icon-192x192.png`, `public/icons/icon-512x512.png`
- iOS用: `ios/App/App/Assets.xcassets/AppIcon.appiconset/`
- Android用: `android/app/src/main/res/mipmap-*`

iOS App Store提出では、1024x1024pxのPNGアイコンが必要です。現在のiOSアイコンは `AppIcon-1024.png` を含む各サイズを正式アイコンから生成しています。

スプラッシュは、アプリ起動直後にWebViewが読み込まれるまで表示される起動画面です。通常の画面ではなく、読み込み中の一瞬だけ出るブランド表示です。

現在は以下が入っています。

- iOS用: `ios/App/App/Assets.xcassets/Splash.imageset/`
- Android用: `android/app/src/main/res/drawable*/splash.png`

アイコンやスプラッシュを差し替える場合は、まず正方形の高解像度PNGを1枚用意し、Capacitor Assets等で各サイズへ展開するのが安全です。

### アイコン変更後の確認手順

iOSはホーム画面アイコンを強くキャッシュするため、画像を差し替えただけでは実機に古いアイコンが残ることがあります。

1. `npm run cap:sync` を実行する
2. Xcodeで `ios/App/App.xcodeproj` を開く
3. Xcodeメニューの `Product` > `Clean Build Folder` を実行する
4. 実機またはシミュレーターから古いTextNextアプリを削除する
5. Xcodeから再インストールする
6. ホーム画面でTextNextの正式アイコンが表示されることを確認する

## ネイティブ権限

TextNextは出品画像・バーコード読み取りでカメラを使います。

iOSには以下の説明文を追加しています。

- `NSCameraUsageDescription`
- `NSPhotoLibraryUsageDescription`
- `NSPhotoLibraryAddUsageDescription`

Androidには以下の権限を追加しています。

- `android.permission.CAMERA`

写真選択はOSのファイル/写真ピッカーを使うため、現時点ではAndroidのストレージ読み取り権限は追加していません。余計な権限を増やすと審査・利用者説明が重くなるためです。

## App Store優先の次ステップ

1. `npm run cap:ios:prod`
2. Xcodeで `ios/App/App.xcodeproj` を開く
3. Bundle Identifier が `jp.textnext.app` でよいか確認
4. Signing & Capabilities でApple Developer Teamを設定
5. 実機でログイン、出品、画像選択、カメラ、チャット、通知導線を確認
6. Archiveを作成してApp Store Connectへアップロード
7. App Store Connectでスクリーンショット、説明文、プライバシー情報を入力

Google Play対応は、iOS側の提出準備が固まってからAndroidの署名鍵、AAB生成、ストア掲載情報を整えるのが効率的です。

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
