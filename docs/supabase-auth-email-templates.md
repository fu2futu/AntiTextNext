# Supabase Auth メールテンプレート

Supabase Auth の認証メール本文はアプリコードではなく Supabase 管理画面で設定します。

設定場所: Supabase Dashboard → Authentication → Email Templates

---

## Confirm signup（登録確認メール）★重要

### 背景 / なぜ変更が必要か

デフォルトの `{{ .ConfirmationURL }}` は **PKCE（code）方式**のリンクを生成する。
PKCE は「登録を開始したブラウザに保存された検証キー(code verifier)」を必要とするため、
**アプリ内WebViewで登録 → メールのリンクを Safari 等の別ブラウザで開く**と検証キーが無く
`exchangeCodeForSession` が失敗し、`/auth/link-error`（「リンクを確認できません」）に飛ぶ。

これを回避するため、**token_hash（OTP）方式**に変更する。
`app/auth/callback/route.ts` は token_hash を受けて `verifyOtp` で検証する処理を実装済みで、
この方式なら検証キー不要＝**別ブラウザでも認証が通る**。

### 設定手順

Supabase Dashboard → Authentication → Email Templates → **Confirm signup** を開き、
本文（Message body）を以下に差し替える。ポイントはリンクを
`{{ .ConfirmationURL }}` ではなく **`{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=signup`** にすること。

件名（Subject）例:

```text
【TextNext】メールアドレスの確認
```

本文（HTML）:

```html
<h2>メールアドレスの確認</h2>
<p>TextNext へのご登録ありがとうございます。</p>
<p>以下のボタンをタップして、メールアドレスの確認を完了してください。</p>
<p>
  <a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=signup"
     style="display:inline-block;padding:12px 20px;background:#e60033;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;">
    メールアドレスを確認する
  </a>
</p>
<p style="color:#666;font-size:13px;">
  このリンクは一度のみ有効です。<br>
  ボタンが押せない場合は、次のURLをブラウザに貼り付けてください：<br>
  {{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=signup
</p>
<p style="color:#999;font-size:12px;">心当たりがない場合は、このメールを破棄してください。</p>
```

### 補足

- `{{ .RedirectTo }}` は signUp 時の `emailRedirectTo` の値が入る。
  本アプリはアプリ内登録なら `.../auth/callback?next=/auth/app-signup-complete`、
  web登録なら `.../auth/callback?next=/auth/setup-profile` を渡している。
  よって `&token_hash=...&type=signup` を後ろに足すだけで、アプリ/web双方の遷移先が保たれる。
- `emailRedirectTo` のURLは Authentication → URL Configuration の Redirect URLs 許可リストに
  含まれている必要がある（`https://textnext.jp/auth/callback`）。
- 変更後は、アプリ内登録 → 届いたメールのリンクを別ブラウザ(Safari)で開いても
  `/auth/app-signup-complete`（「アプリに戻ってログイン」画面）に到達すればOK。

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
