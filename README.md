# TextNext

TextNext は、学内で教科書・教材を安全に循環させる C2C フリマサービスです。Web 版を Next.js / Vercel / Supabase で運用し、iOS / Android 版は Capacitor の WebView ラッパーとして同じ Web サービスを表示する構成です。

## 主な機能

- 大学メールアドレスによる認証
- 出品、画像アップロード、バーコード/ISBN検索
- 商品検索、分野フィルタ、大学図書館の蔵書・貸出状況表示
- お気に入り、入荷通知キーワード
- 購入リクエスト、相談中ロック、取引チャット
- 日程・場所調整、QRコードによる受け渡し確認
- 取引完了後の相互評価
- お知らせ、Web Push / PWA通知
- マイページ、プロフィール編集、お問い合わせ履歴
- 管理者画面
  - ユーザー、出品、取引、問い合わせ、通報、BAN/制限、特典、アクセス分析、保存期間、削除済みアカウント、デモ出品管理
- App Store / Google Play 向け Capacitor アプリ構成

## 技術スタック

- Next.js 14 App Router
- React 18
- TypeScript
- Tailwind CSS
- Supabase Auth / Database / RLS / RPC
- Cloudflare R2
- Stripe
- Web Push
- Google Books API / NDL Search / Calil API
- Capacitor iOS / Android

## 主要ディレクトリ

```txt
app/                    Next.js App Router のページ・API Route
components/             共通UI、Provider、ナビ、購入モーダル、商品カードなど
lib/                    Supabase、画像処理、R2、メール、Push、管理者処理など
supabase/migrations/    DBスキーマ、RLS、RPC、インデックス
public/                 PWAアイコン、Service Worker、静的ファイル
ios/                    Capacitor iOS プロジェクト
android/                Capacitor Android プロジェクト
locales/                i18n文言
docs/                   設計・構造ドキュメント
```

より詳しい構造は [docs/project-structure.md](docs/project-structure.md) を参照してください。

## セットアップ

### 1. 依存関係

```bash
npm install
```

### 2. 環境変数

主な環境変数:

```txt
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_APP_URL
SUPABASE_SERVICE_ROLE_KEY
ACCOUNT_DELETION_HASH_PEPPER

CLOUDFLARE_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME
R2_PUBLIC_BASE_URL
NEXT_PUBLIC_R2_PUBLIC_BASE_URL

GOOGLE_BOOKS_API_KEY
CALIL_APP_KEY
CALIL_SYSTEM_ID

STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET

NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY
WEB_PUSH_VAPID_PRIVATE_KEY
WEB_PUSH_CONTACT
```

### 3. 開発サーバー

```bash
npm run dev
```

### 4. ビルド

```bash
npm run build
npm start
```

## Supabase

DB定義、RLS、RPC は `supabase/migrations/` にあります。

主なテーブル・機能:

- `profiles`
- `items`
- `favorites`
- `transactions`
- `messages`
- `notifications`
- `ratings`
- `inquiries`
- `reports`
- `user_restrictions`
- `account_email_bans`
- `deleted_accounts`
- `web_push_subscriptions`
- `site_access_hourly_visitors`
- `listing_image_error_logs`

アプリ側の主要な接続入口:

- `lib/supabase.ts`: ブラウザ用 Supabase クライアント
- `lib/supabase-server.ts`: サーバー用 Supabase クライアント
- `middleware.ts`: セッション確認、管理者画面保護、アクセス計測
- `app/api/**/route.ts`: サーバーAPI

## 画像アップロード

商品画像は Cloudflare R2 を前提にしています。

- クライアント側の形式チェック、decode、圧縮: `lib/image-storage.ts`
- サーバー側R2処理: `lib/r2-server.ts`
- アップロードAPI: `app/api/item-images/upload/route.ts`
- 削除API: `app/api/item-images/delete/route.ts`
- 画像エラーログ: `app/api/listing/image-error-log/route.ts`

## 取引フロー

1. 出品者が `app/listing/page.tsx` から商品を出品
2. 購入者が `app/product/[id]/page.tsx` で商品詳細を開く
3. 購入リクエスト時に商品を一時ロック
4. `components/PurchaseModal.tsx` で支払い方法、候補日時、候補場所を入力
5. DB RPC `submit_purchase_request` で取引・チャット・通知を作成
6. `app/chat/[id]/page.tsx` で日程調整
7. QRコードで受け渡し確認
8. 双方が評価して取引終了

## 管理者画面

管理者画面は `/admin` 配下です。

- `middleware.ts` で保護
- `lib/admin.ts`, `lib/admin-utils.ts` で管理者判定
- `app/admin/_components/admin-shell.tsx` が管理画面の共通ナビ

主な管理機能:

- ユーザー管理
- 出品管理
- 取引管理
- 問い合わせ管理
- 通報管理
- BAN・利用制限管理
- 特典・バッジ付与
- アクセス分析
- データ保存期間管理
- 削除済みアカウント確認
- App Store スクショ用デモ出品・デモホーム

## Web Push / PWA

- Service Worker: `public/sw.js`
- 登録処理: `components/service-worker-register.tsx`
- クライアント側Push購読: `lib/web-push-client.ts`
- サーバー側Push送信: `lib/web-push.ts`
- 購読API: `app/api/push/subscription/route.ts`

## Capacitor アプリ

アプリ化取組中（6/11現在）。Capacitor関連の詳細は [CAPACITOR_APP.md](CAPACITOR_APP.md) を参照してください。

## ドキュメント

- [docs/project-structure.md](docs/project-structure.md)
  - プロジェクト構造、ページ/API、主要処理フロー
- [CAPACITOR_APP.md](CAPACITOR_APP.md)
  - iOS / Android アプリ化方針、アイコン、スプラッシュ、Xcode手順
- [docs/app-review-demo-account.md](docs/app-review-demo-account.md)
  - App Store審査用デモアカウントの作成・運用手順
- [SUPABASE_SETUP.md](SUPABASE_SETUP.md)
  - Supabase セットアップ関連
- [SECURITY_CHECKLIST_STRIPE.md](SECURITY_CHECKLIST_STRIPE.md)
  - Stripe セキュリティ確認
