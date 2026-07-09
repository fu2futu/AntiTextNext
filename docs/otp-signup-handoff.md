# 登録のメール認証：OTPコード方式への切り替え（作業依頼）

## 何をするか（結論）

登録確認を **メールのリンクを踏む方式 → メールで届く確認コードをアプリに入力する方式** に変える。
（hinata案。アプリ↔ブラウザの遷移で認証が失敗する問題を根本から回避できる）

コード側の実装は**もう完了して main に入っている**。
**残りは Supabase ダッシュボードの設定だけ** なので、そこをお願いしたい。

---

## コード側でやったこと（済み・確認だけでOK）

- `app/auth/signup/page.tsx` を確認コード入力方式に変更
  - `supabase.auth.signUp` でアカウント作成＋コードメール送信
  - コード入力画面 → `supabase.auth.verifyOtp({ email, token, type: "signup" })` で検証
  - 成功したらアプリ内にログイン状態が確立し、そのまま `/auth/setup-profile` へ
  - 「コード再送」ボタン（`supabase.auth.resend`、60秒クールダウン）
- リンク方式の分岐・`emailRedirectTo`・不要画面は撤去済み

> ※ Resend（メール送信サービス）は使っていない。コードのメールは Supabase Auth が送る。

---

## お願いしたい作業：Supabase ダッシュボード

### 1. 確認メールのテンプレートを「確認コード」に変更 ★これが無いと動かない

**Supabase Dashboard → Authentication → Email Templates → Confirm signup**

本文（Message body）を下記に差し替える。
**ポイント：リンク（`{{ .ConfirmationURL }}`）は消して、`{{ .Token }}`（確認コード）を載せる。**

件名（Subject）:

```
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

> ⚠️ `{{ .ConfirmationURL }}` を残すと、そっちを踏んで壊れる旧方式に戻ってしまう。**リンクは入れないこと。**

### 2. コードの桁数を「6桁」に設定 ★重要

現状コードが **8桁** で届いている。アプリ側の入力欄は **6桁** に合わせてあるので、
Supabase 側も **6桁** に揃える必要がある（桁数がズレると認証できない）。

**Authentication → Providers（または Sign In / Providers）→ Email** の設定内にある
**Email OTP Length（コードの桁数）を `6` に変更**する。
※ ダッシュボードのバージョンにより場所/名称が異なる場合あり。「OTP」「桁数」「length」で探す。

### 3. OTPの有効期限を確認（任意）

同じく Email 設定の OTP expiry（コードの有効期限）を確認。
デフォルトのままでOK。テンプレの「1時間」の記載と合わせておくとベター。

---

## テスト手順（設定後）

1. アプリで新規登録（メール＋パスワード）
2. 登録したメール宛に **確認コード** が届く
3. アプリのコード入力画面にそのコードを入力
4. プロフィール設定画面に進めれば成功 🎉

> web（ブラウザ）からの登録も同じコード方式で動く。分岐は無い。

---

## 残タスク（テストが終わったら）

- **テスト用の学内メールバイパスを消す**
  `app/api/auth/signup-eligibility/route.ts` の
  `HARDCODED_TEST_ALLOWED_EMAILS = ["edamamemochi2004@gmail.com"]` を `[]` に戻す。
  → これは「学内メール(@m.isct.ac.jp)以外でも登録できる」テスト用の抜け穴なので、
    本番に残すと誰でも登録できてしまう。テスト完了後に必ず削除。

---

## 参考ファイル

- 実装: `app/auth/signup/page.tsx`
- 検証コールバック（パスワード再設定で使用）: `app/auth/callback/route.ts`
- メールテンプレート詳細: `docs/supabase-auth-email-templates.md`
