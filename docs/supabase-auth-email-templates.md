# Supabase Auth メールテンプレート

Supabase Auth の認証メール本文はアプリコードではなく Supabase 管理画面で設定します。

設定場所: Supabase Dashboard → Authentication → Email Templates

---

## Confirm signup（登録確認メール）★重要：OTPコード方式

### 背景 / なぜこの方式か

**リンク方式は使わない。** デフォルトの `{{ .ConfirmationURL }}`（およびtoken_hashリンク）は、
メールのリンクを踏む＝ブラウザに遷移する前提。アプリ内WebViewで登録した場合、
リンクは Safari 等の別ブラウザで開かれ、PKCEの検証キー不一致で認証が失敗する
（`/auth/link-error`「リンクを確認できません」に飛ぶ）など想定外の挙動が起きる。

そこで **ワンタイムパスワード（確認コード）方式**に統一する。
メールには **数字コード `{{ .Token }}` だけ**を載せ、ユーザーはアプリ内の入力欄に打ち込む。
アプリから一切出ないため、ブラウザ遷移・PKCE・クロスブラウザの問題がすべて消える。

アプリ側は実装済み（`app/auth/signup/page.tsx`）:
- `supabase.auth.signUp({ email, password })` でアカウント作成＋コードメール送信
- コード入力画面で `supabase.auth.verifyOtp({ email, token, type: "signup" })` を実行
- 成功するとアプリ内にセッションが確立し、`/auth/setup-profile` へ遷移

### 設定手順

Supabase Dashboard → Authentication → Email Templates → **Confirm signup** を開き、
本文（Message body）を以下に差し替える。**リンク（`{{ .ConfirmationURL }}`）は入れず、
必ず `{{ .Token }}`（確認コード）を載せる**こと。

件名（Subject）例:

```text
【TextNext】確認コード: {{ .Token }}
```

本文（HTML）:

```html
<h2>メールアドレスの確認</h2>
<p>TextNext へのご登録ありがとうございます。</p>
<p>アプリの画面に、以下の6桁の確認コードを入力してください。</p>
<p style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#e60033;margin:24px 0;">
  {{ .Token }}
</p>
<p style="color:#666;font-size:13px;">
  このコードの有効期限は1時間です。<br>
  心当たりがない場合は、このメールを破棄してください。
</p>
```

### 補足・注意

- **リンクは載せないこと。** `{{ .ConfirmationURL }}` を残すと、ユーザーがそちらを踏んで
  従来の（壊れる）リンク方式に逆戻りする。コードのみにする。
- `verifyOtp` の `type` は `"signup"`。アプリ側と一致させる。
- **コードの桁数はアプリUI（6桁）と揃える。** Authentication → Providers → Email の
  Email OTP Length を `6` に設定する（8桁等になっていると入力欄と桁数がズレて認証できない）。
- コードの有効期限は Supabase の OTP expiry 設定（Authentication → Providers → Email）に従う。
- 再送はアプリ側で `supabase.auth.resend({ type: "signup", email })` を使用（60秒クールダウン）。
- web（ブラウザ）からの登録も同じOTPコード方式で動作する（分岐不要）。

---

## Reset Password（パスワード再設定メール）

設定場所:

- Supabase Dashboard
- Authentication
- Email Templates
- Reset Password

パスワード再設定メールには、既存本文に加えて以下の注意書きを入れてください。

```text
このリンクは一度のみ使用できます。
うまく開けない場合は、もう一度パスワード再設定メールを送信してください。
スマートフォンでは、再設定を開始したブラウザと同じブラウザで開くと成功しやすい場合があります。
```

HTMLテンプレートで入れる場合:

```html
<p>このリンクは一度のみ使用できます。</p>
<p>うまく開けない場合は、もう一度パスワード再設定メールを送信してください。</p>
<p>スマートフォンでは、再設定を開始したブラウザと同じブラウザで開くと成功しやすい場合があります。</p>
```

リンク先は、TextNext 側から `redirectTo=/auth/callback?next=/auth/update-password` を指定しています。
