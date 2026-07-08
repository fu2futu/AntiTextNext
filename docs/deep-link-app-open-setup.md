# 確認メールのリンクをアプリで開く（ディープリンク）実装指示書

## 目的

現状、認証メール（登録確認・パスワード再設定）内のリンク
`https://textnext.jp/auth/callback?...` を押すと、必ずモバイルブラウザ（web）で開く。
これを **iOSユニバーサルリンク / Androidアプリリンク** に対応させ、
リンクを押したときに **TextNextアプリが直接開く** ようにする。

## 前提（現状の構成）

- Capacitor 8。アプリは `https://textnext.jp` を WebView でそのまま表示する構成
  （`capacitor.config.ts` の `server.url`）。
- appId / iOS Bundle ID / Android applicationId: **`jp.textnext.app`**（3つとも共通）
- アプリ名: TextNext
- 認証コールバック: `https://textnext.jp/auth/callback`
  （`app/auth/callback/route.ts`。`code` または `token_hash` を処理し、
  成功時 `/auth/setup-profile`（登録）または `/auth/update-password`（再設定）へ遷移）
- 現状 **ディープリンク設定は一切なし**（`.well-known` ファイル無し、`@capacitor/app` 未インストール、
  ネイティブの intent-filter / Associated Domains 無し）。

---

## 担当分担

| 作業 | 担当 | 場所 |
|---|---|---|
| A. 事前情報の収集 | ネイティブ担当 | Apple Developer / 署名鍵 |
| B. サーバーに紐付けファイル配置 | Web担当 | textnext.jp（Next.js） |
| C. iOS 設定（Xcode） | ネイティブ担当 | `ios/App` |
| D. Android 設定 | ネイティブ担当 | `android/app` |
| E. アプリ内リンク受け取りコード | Web担当 | Next.js |
| F. Supabase 設定確認 | 運営 | Supabaseダッシュボード |
| G. 実機テスト | ネイティブ担当 | 実機 / シミュレータ |

> B・E は Web 側で対応可能。指示があれば別途こちらで実装する。
> 本書は主に **A・C・D・G（Xcode / Android / 実機）** の担当者向け。

---

## A. 事前に必要な情報（先に集める）

1. **Apple Team ID**（10桁英数字）
   - Apple Developer → Membership → Team ID。例: `ABCDE12345`
2. **Android アプリ署名鍵の SHA-256 フィンガープリント**
   - Google Play の「アプリの署名」を使っている場合:
     Play Console → 対象アプリ → テストとリリース → アプリの署名 → **「アプリ署名鍵証明書」の SHA-256**
   - ローカル署名鍵の場合:
     ```
     keytool -list -v -keystore <your.keystore> -alias <alias>
     ```
   - デバッグビルドでも検証したい場合はデバッグ鍵の SHA-256 も取得しておく:
     ```
     keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
     ```

以降、`ABCDE12345` = Team ID、`AA:BB:...:ZZ` = SHA-256 と表記する。実値に置き換えること。

---

## B. サーバー側：紐付けファイルを textnext.jp に配置

textnext.jp（このNext.jsアプリ）から、以下2ファイルを **HTTPSで・リダイレクトなし・正しいContent-Type** で配信する。

### B-1. iOS: `/.well-known/apple-app-site-association`

内容（拡張子なしのJSON、`ABCDE12345` を差し替え）:

```json
{
  "applinks": {
    "details": [
      {
        "appIDs": ["ABCDE12345.jp.textnext.app"],
        "components": [
          { "/": "/auth/callback", "comment": "認証コールバック" },
          { "/": "/auth/callback/*", "comment": "認証コールバック（サブパス）" }
        ]
      }
    ]
  }
}
```

### B-2. Android: `/.well-known/assetlinks.json`

内容（`AA:BB:...:ZZ` を差し替え。複数鍵があれば配列に追加）:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "jp.textnext.app",
      "sha256_cert_fingerprints": ["AA:BB:CC:DD:...:ZZ"]
    }
  }
]
```

### B-3. Next.js での配信上の注意（重要）

- `apple-app-site-association` は **拡張子なし**。`public/` に置くだけだと Content-Type が
  適切に付かない場合がある。**`application/json` で配信**されること。
- **リダイレクト・認証・www有無の正規化に注意**。`https://textnext.jp/.well-known/apple-app-site-association`
  が 200 で素の JSON を返すこと（301/302 が挟まると iOS は検証に失敗する）。
- Next.js での実装案（どちらか）:
  - `app/.well-known/apple-app-site-association/route.ts` と `.../assetlinks.json/route.ts` を
    Route Handler で作り、`Content-Type: application/json` を明示して返す。
  - もしくは `public/.well-known/` に置き、`next.config` の `headers()` で Content-Type を付与。
- 配置後の確認:
  ```
  curl -i https://textnext.jp/.well-known/apple-app-site-association
  curl -i https://textnext.jp/.well-known/assetlinks.json
  ```
  → 200 / `content-type: application/json` / リダイレクト無しであること。

---

## C. iOS 設定（Xcode）

対象プロジェクト: `ios/App/App.xcodeproj`（Bundle ID `jp.textnext.app`）

1. **Associated Domains を有効化**
   - Xcode で App ターゲット → Signing & Capabilities → `+ Capability` → **Associated Domains** を追加。
   - ドメインに次を追加:
     ```
     applinks:textnext.jp
     ```
   - これにより `ios/App/App/App.entitlements`（無ければ生成される）に以下が入る:
     ```xml
     <key>com.apple.developer.associated-domains</key>
     <array>
       <string>applinks:textnext.jp</string>
     </array>
     ```
2. **Team / 署名** が Team ID `ABCDE12345` の Provisioning Profile で署名されていること
   （AASA の appID と一致していないと動かない）。
3. Apple Developer の App ID で **Associated Domains** が有効になっていること。
4. `Info.plist`（`ios/App/App/Info.plist`）にカスタムURLスキームは不要
   （ユニバーサルリンク方式のため）。

> 補足: iOS はアプリ初回インストール後に AASA を取得する。反映されない時はアプリ再インストールで再取得される。

---

## D. Android 設定

対象: `android/app/src/main/AndroidManifest.xml`（applicationId `jp.textnext.app`）

`MainActivity` に **App Links 用の intent-filter を追加**する。
既存の LAUNCHER intent-filter は残したまま、下記を `<activity>` 内に追記:

```xml
<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data
        android:scheme="https"
        android:host="textnext.jp"
        android:pathPrefix="/auth/callback" />
</intent-filter>
```

- `MainActivity` は既に `launchMode="singleTask"` / `exported="true"` なのでそのままでよい。
- `android:autoVerify="true"` により、インストール時に端末が
  `https://textnext.jp/.well-known/assetlinks.json` を取得して自動検証する（B-2 が前提）。
- 検証状態の確認（実機）:
  ```
  adb shell pm get-app-links jp.textnext.app
  ```
  → `textnext.jp` が `verified` になっていること。

---

## E. アプリ内でリンクを受け取り、画面遷移させる（Web担当）

ユニバーサル/アプリリンクでアプリが起動しても、WebView を対象パスへ遷移させる処理が必要。

1. プラグイン追加:
   ```
   npm install @capacitor/app
   npx cap sync
   ```
2. Next.js のクライアント側（例: ルートレイアウトに置くクライアントコンポーネント）で、
   ネイティブ起動時のみリスナーを登録:
   ```ts
   "use client";
   import { useEffect } from "react";
   import { Capacitor } from "@capacitor/core";

   export function DeepLinkHandler() {
     useEffect(() => {
       if (!Capacitor.isNativePlatform()) return;
       let remove: (() => void) | undefined;
       import("@capacitor/app").then(({ App }) => {
         App.addListener("appUrlOpen", ({ url }) => {
           try {
             const parsed = new URL(url);
             if (parsed.pathname.startsWith("/auth/callback")) {
               // WebView を認証コールバックへ遷移させる
               window.location.href = parsed.pathname + parsed.search;
             }
           } catch {}
         }).then((h) => { remove = () => h.remove(); });
       });
       return () => remove?.();
     }, []);
     return null;
   }
   ```
3. これで、アプリ起動 → `appUrlOpen` で受け取った `/auth/callback?...` へ WebView が遷移し、
   `app/auth/callback/route.ts` が同一WebView内でセッションを確立できる。

> 現状 `@capacitor/app` は未インストール。ここは Web 側で対応する範囲。

---

## F. Supabase 設定の確認（運営）

- Dashboard → Authentication → URL Configuration の **Redirect URLs 許可リスト** に
  `https://textnext.jp/auth/callback` が含まれること（signUp の `emailRedirectTo` がこれ）。
- メールテンプレートのリンク先が `https://textnext.jp/auth/callback...` を指していること。
  （送信元・テンプレートは `docs/supabase-auth-email-templates.md` 参照）

---

## G. テスト手順

### iOS
- シミュレータ:
  ```
  xcrun simctl openurl booted "https://textnext.jp/auth/callback?token_hash=TEST&type=signup"
  ```
  → アプリが開けば OK（実際の認証は有効なリンクで確認）。
- 実機: メモ帳などに `https://textnext.jp/auth/callback` を貼り付けて長押し→「"TextNext"で開く」が出るか。

### Android
```
adb shell am start -a android.intent.action.VIEW \
  -c android.intent.category.BROWSABLE \
  -d "https://textnext.jp/auth/callback?token_hash=TEST&type=signup" \
  jp.textnext.app
```
→ アプリが前面に来ること。`pm get-app-links` で `verified` を確認。

### エンドツーエンド
1. 実機のアプリ内で新規登録 → 確認メール受信。
2. メールのリンクを押す → **アプリが開く**。
3. アプリ内で `/auth/setup-profile` に進み、ログイン状態になっていること。

---

## 注意点・既知の落とし穴

1. **Gmailアプリ等のアプリ内ブラウザ**
   - iOSのGmailアプリはリンクを自前のアプリ内ブラウザで開くため、
     ユニバーサルリンクが発火せずアプリに飛ばないことがある。
     その場合はリンク長押し→標準ブラウザ、または端末標準メールアプリでは正常に発火する。
   - これは iOS/Gmail 側の仕様であり、完全には制御できない。
     一定数はブラウザ経由になる前提で、**ブラウザ側フローも壊さないこと**（現状 token_hash フォールバックで動作する）。
2. **セッションの所在**
   - ブラウザで開くとセッションがブラウザ側に作られ、アプリのWebViewは未ログインのまま、という
     体験のズレが起きうる。アプリで開ければこの問題は解消する（本対応の主目的の一つ）。
3. **AASA / assetlinks の反映タイミング**
   - iOS: 反映されない時はアプリ再インストール。
   - Android: `autoVerify` はインストール時検証。配置ミスがあると無言で失敗するので
     `pm get-app-links` と Google の Digital Asset Links テスターで確認する。
4. **www / 独自ドメインの正規化**
   - メールリンクが `https://textnext.jp/...`（www無し）である前提。
     www有無やリダイレクトが混在すると検証が崩れる。
