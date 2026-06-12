# App Review Demo Account

TextNext はログイン必須のため、App Store Review 用に専用デモアカウントを用意します。

## 方針

- Apple に渡すのは TextNext アプリ内ログイン用のメールアドレスとパスワードだけです。
- メール受信箱のログイン情報は渡しません。
- コード上では `app-review@textnext.jp` という文字列に依存しません。
- 判定は `profiles.is_app_review_demo = true` で行います。
- App Review 用アカウントに管理者権限は付けません。
- 管理者判定は従来通り `admin_emails` / `is_current_user_admin()` を使います。

## 作成手順

1. Supabase Dashboard の Authentication でユーザーを作成します。
   - Email: `app-review@textnext.jp`
   - Password: App Store Connect に記載する TextNext ログイン用パスワード
   - Email Confirmed: confirmed / 認証済みにします

2. TextNext の `profiles` にプロフィールを作成します。
   - 表示名: `TextNext Demo`
   - `is_app_review_demo = true`
   - 管理者メールリスト `admin_emails` には追加しません

3. または、通常の管理者画面から対象ユーザーを開き、`App Store審査用アカウント` を有効化します。

4. デモ出品を複数用意します。
   - `items.is_demo = true`
   - 通常ホーム・通常検索には表示されません
   - App Review 用アカウントのホーム・検索ではデモ出品中心に表示されます

5. 審査前に必要に応じて、管理者画面のユーザー詳細から `デモ取引をリセット` を実行します。

## App Store Connect Notes 例

```txt
Demo Account:
Email: app-review@textnext.jp
Password: <TextNext login password configured by the operator>

Notes:
This app requires sign-in. Please use the demo account above. This is a demo account for App Review. It can browse the app, view demo textbook listings, open product details, and test purchase requests, chat, handoff coordination, and rating flows using demo listings only. It cannot affect real listings or send purchase requests or messages to real users. Password reset is not required for this demo account.
```

## 制限

- App Review 用アカウントは実出品へ購入リクエストを送れません。
- App Review 用アカウントは実取引へメッセージ・評価を送れません。
- App Review 用アカウントの出品は自動的にデモ出品になります。
- App Review 用アカウントが実出品に関する通知・メールを送ろうとした場合はブロックされます。
- デモ評価は `ratings.is_demo = true` になり、通常評価集計には混ざりません。

## パスワード再設定

App Review 用アカウントでは、パスワード再設定は不要な運用です。

パスワード再設定画面で該当メールアドレスを入力した場合、メール送信は行わず、以下の案内を表示します。

```txt
このアカウントはApp Store審査用アカウントです。パスワード再設定は不要です。App Review情報に記載されたパスワードでログインしてください。
```
