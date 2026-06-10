# TextNext Project Structure

このドキュメントは、TextNext のコードを読み始めるための現在の構造メモです。実装の詳細よりも、「どこに何があるか」「主要機能がどのファイルを通って動くか」を把握することを目的にしています。

## 主要ディレクトリ

- `app/`
  - Next.js App Router のページ、レイアウト、API Route を置く場所です。
  - 画面は `page.tsx`、サーバーAPIは `route.ts`、共通レイアウトは `layout.tsx` です。

- `components/`
  - 複数ページで使う UI コンポーネントやクライアント側の共通処理を置いています。
  - グローバルナビ、認証Provider、購入モーダル、商品カード、QRスキャナなどがあります。

- `lib/`
  - Supabase クライアント、画像処理、R2、メール、Web Push、管理者判定などの共通処理を置いています。

- `supabase/migrations/`
  - Supabase のテーブル、RLS、RPC 関数、インデックスを管理する SQL です。
  - 購入フロー、チャット、デモ出品、BAN、アカウント削除、アクセス集計などのDB側ロジックがあります。

- `public/`
  - PWA アイコン、Service Worker、静的画像などを置きます。

- `ios/`, `android/`
  - Capacitor アプリ用のネイティブプロジェクトです。
  - Web版 `https://textnext.jp` をアプリ内 WebView で表示する構成です。

- `locales/`
  - i18n 用の文言ファイルです。

- `docs/`
  - 設計メモや運用メモなどのドキュメント置き場です。

- `middleware.ts`
  - セキュリティヘッダー、管理者画面保護、アクセス計測を行います。

## app/ 配下のページ

### 通常画面

- `app/page.tsx`
  - ホーム画面です。
  - `items` から通常出品を取得し、`HomeClient` に渡します。

- `app/search/page.tsx`
  - 商品検索画面です。
  - TextNext 内の商品検索、サジェスト、分野フィルタ、図書館検索セクションを扱います。

- `app/product/[id]/page.tsx`
  - 商品詳細のサーバー側入口です。
  - 商品、出品者プロフィール、評価、バッジなどを取得して `client.tsx` に渡します。

- `app/product/[id]/client.tsx`
  - 商品詳細のクライアント側本体です。
  - お気に入り、購入リクエスト開始、出品者向け編集・削除・停止、取引中商品のチャット導線を扱います。

- `app/listing/page.tsx`
  - 出品画面です。
  - バーコード読み取り、ISBN検索、画像アップロード、価格チェック、出品登録を行います。

- `app/chat/page.tsx`
  - チャット一覧です。
  - `messages` と `transactions` から会話をまとめて表示します。

- `app/chat/[id]/page.tsx`
  - チャット詳細です。
  - メッセージ送受信、画像送信、日程調整、受け渡し完了、QR表示・読み取り、評価導線、終了済みチャットの閲覧を扱います。

- `app/transactions/page.tsx`
  - 予定管理・取引一覧です。
  - 進行中取引、日程確認、相談終了などの導線があります。

- `app/rating/[id]/page.tsx`
  - 取引後の評価画面です。

- `app/profile/page.tsx`
  - マイページです。
  - アカウント情報、出品中、過去の取引、お気に入り、お問い合わせ導線などを表示します。

- `app/profile/edit/page.tsx`
  - プロフィール編集画面です。

- `app/profile/inquiries/page.tsx`
  - 自分のお問い合わせ履歴一覧です。

- `app/profile/inquiries/[id]/page.tsx`
  - 自分のお問い合わせ詳細です。

- `app/seller/[id]/page.tsx`
  - 出品者情報ページです。
  - 他ユーザーから見える出品者情報、自分の場合はプロフィール編集導線を持ちます。

- `app/notifications/page.tsx`
  - お知らせ一覧です。

- `app/notifications/[id]/page.tsx`
  - お知らせ詳細・遷移処理です。

- `app/settings/page.tsx`
  - 設定トップです。
  - アカウント管理、通知設定、ポリシー類、アカウント削除などの入口です。

- `app/settings/password/page.tsx`
  - パスワード変更ページです。

- `app/settings/email-notifications/page.tsx`
  - メール通知設定です。

- `app/settings/watch-keywords/page.tsx`
  - 入荷通知キーワード設定です。

- `app/contact/page.tsx`
  - 未ログインでも使える問い合わせページです。

- `app/textbooks/page.tsx`, `app/textbooks/[isbn]/page.tsx`
  - 教科書・ISBN関連のページです。

- `app/suspended/page.tsx`
  - BAN・利用制限時に表示されるページです。

### 認証画面

- `app/auth/login/page.tsx`
  - ログインフォームです。
  - 実際のログイン処理は `/api/auth/login` に投げます。

- `app/auth/signup/page.tsx`
  - 新規登録フォームです。
  - 登録可能性チェック後、Supabase Auth の signup を使います。

- `app/auth/setup-profile/page.tsx`
  - 初回プロフィール設定です。

- `app/auth/callback/route.ts`
  - Supabase Auth のメールリンク・OAuth後のコールバック処理です。

- `app/auth/forgot-password/page.tsx`
  - パスワード再設定メール送信画面です。

- `app/auth/update-password/page.tsx`
  - パスワード再設定後の新パスワード入力画面です。

- `app/auth/link-error/page.tsx`
  - 認証リンク失敗時の画面です。

- `app/auth/add-to-home/page.tsx`
  - ホーム画面追加案内です。

### 管理者画面

- `app/admin/layout.tsx`
  - 管理者画面共通レイアウトです。

- `app/admin/_components/admin-shell.tsx`
  - 管理者画面のサイドバー、ヘッダー、ステータス表示などです。

- `app/admin/page.tsx`
  - 管理者ダッシュボードです。

- `app/admin/users/page.tsx`, `app/admin/users/[id]/page.tsx`
  - ユーザー一覧・ユーザー詳細です。

- `app/admin/items/page.tsx`, `app/admin/items/[id]/page.tsx`
  - 出品管理・出品詳細です。

- `app/admin/transactions/page.tsx`, `app/admin/transactions/[id]/page.tsx`
  - 取引管理・取引詳細です。

- `app/admin/inquiries/page.tsx`, `app/admin/inquiries/[id]/page.tsx`
  - お問い合わせ管理です。

- `app/admin/reports/page.tsx`, `app/admin/reports/[id]/page.tsx`
  - 通報管理です。

- `app/admin/restrictions/page.tsx`
  - BAN・利用制限管理です。

- `app/admin/rewards/page.tsx`
  - 特典・バッジ付与管理です。

- `app/admin/access/page.tsx`
  - アクセス分析です。

- `app/admin/data-retention/page.tsx`
  - データ保存期間管理です。

- `app/admin/deleted-accounts/page.tsx`
  - 削除済みアカウントの管理者確認画面です。

- `app/admin/home-preview/page.tsx`
  - 指定ユーザーとしてホーム表示をシミュレーションします。

- `app/admin/demo-home/page.tsx`
  - App Store スクショ用のデモホームです。

- `app/admin/demo-items/page.tsx`, `app/admin/demo-items/new/page.tsx`
  - デモ出品の一覧・作成です。

- `app/admin/logs/page.tsx`
  - 管理者操作ログです。

- `app/admin/errors/page.tsx`
  - エラー・画像アップロードログなどの確認画面です。

## app/api/ 配下のAPIルート

### 認証・アカウント

- `app/api/auth/login/route.ts`
  - ログインAPIです。
  - レート制限、BANリスト、Supabase Auth、利用制限、プロフィール有無を確認します。

- `app/api/auth/signup-eligibility/route.ts`
  - 新規登録可能かを確認します。
  - 大学メール、既存登録、BANリストを確認します。

- `app/api/auth/complete-registration/route.ts`
  - 登録完了時の補助処理です。

- `app/api/delete-account/route.ts`
  - アカウント削除処理のAPIです。
  - DB側RPC、ストレージ削除、Auth削除などと連携します。

- `app/api/check-username/route.ts`
  - ユーザー名の重複確認です。

### 出品・画像・書籍

- `app/api/books/isbn/route.ts`
  - ISBNから書誌情報を取得します。

- `app/api/item-images/upload/route.ts`
  - 商品画像をサーバー側でアップロードします。

- `app/api/item-images/delete/route.ts`
  - 商品画像の削除です。

- `app/api/items/purge-owned/route.ts`
  - 取引のない自分の出品を完全削除するAPIです。

- `app/api/listing/image-error-log/route.ts`
  - 出品画像の読み込み・形式・decode失敗ログを保存します。

- `app/api/subjects/sync/route.ts`
  - 教科書分類データの同期です。

### 検索・図書館

- `app/api/library/search/route.ts`
  - 検索結果に紐づく大学図書館情報を取得します。
  - Google Books / NDL / カーリル API をサーバー側で呼び、クライアントへ返します。

### チャット・通知・Push

- `app/api/notify/transaction/route.ts`
  - 取引関連通知、メール、チャット通知の送信補助です。

- `app/api/profile/inquiry-message/route.ts`
  - 問い合わせスレッドへのメッセージ追加です。

- `app/api/push/subscription/route.ts`
  - Web Push購読の登録・削除です。

- `app/api/push/test/route.ts`
  - Push通知のテスト送信です。

- `app/api/check-watch-keywords/route.ts`
  - 入荷通知キーワードのチェックです。

- `app/api/watch-keywords/route.ts`
  - 入荷通知キーワードのCRUDです。

- `app/api/cron/reminders/route.ts`
  - リマインダー送信用のcron APIです。

### 管理者API

- `app/api/admin/access/route.ts`
  - アクセス分析データ取得です。

- `app/api/admin/action/route.ts`
  - 管理者操作の共通実行・記録です。

- `app/api/admin/data-retention/route.ts`
  - 保存期間設定・実行です。

- `app/api/admin/demo-items/route.ts`
  - デモ出品管理です。

- `app/api/admin/demo-transactions/route.ts`
  - デモ取引作成です。

- `app/api/admin/inquiry/route.ts`
  - 問い合わせ管理です。

- `app/api/admin/item-purge/route.ts`
  - 管理者による出品完全削除です。

- `app/api/admin/item-status/route.ts`
  - 出品ステータス変更です。

- `app/api/admin/reveal-chat/route.ts`
  - 管理者向けチャット内容確認です。

- `app/api/admin/reveal-email/route.ts`
  - 管理者向けメールアドレス確認です。

- `app/api/admin/rewards/route.ts`
  - 特典・バッジ管理です。

- `app/api/admin/user-restriction/route.ts`
  - BAN・利用制限の作成・解除です。

### 外部決済・問い合わせ

- `app/api/contact/route.ts`
  - 問い合わせ送信です。

- `app/api/stripe/checkout/route.ts`
  - Stripe Checkout 作成です。

- `app/api/stripe/payment-intent/route.ts`
  - PaymentIntent 作成です。

- `app/api/stripe/webhook/route.ts`
  - Stripe webhook 受信です。

## components/ の主要コンポーネント

- `components/app-nav.tsx`
  - PC用ヘッダーとスマホ用ボトムナビをまとめる入口です。
  - 未読数の購読を1回だけ行い、両方のナビに渡します。

- `components/desktop-header.tsx`
  - PC版の上部ヘッダーです。
  - 検索窓、ナビゲーション、未読表示を持ちます。

- `components/bottom-nav.tsx`
  - スマホ版のホームインジケーター風ボトムナビです。

- `components/auth-provider.tsx`
  - Supabase Auth のセッション状態を React Context で配ります。
  - プロフィール未設定やBAN状態のチェックも行います。

- `components/providers.tsx`
  - i18n など、アプリ全体のProviderをまとめます。

- `components/home-item-card.tsx`
  - ホームや管理者プレビューで使う商品カードです。

- `components/PurchaseModal.tsx`
  - 購入リクエスト時の日程・場所・支払い方法選択モーダルです。

- `components/purchase-utils.ts`
  - 購入リクエスト用データ型と自動メッセージ生成処理です。

- `components/QrScanner.tsx`
  - QRコード読み取りコンポーネントです。

- `components/ListingTutorial.tsx`
  - 初回出品チュートリアルです。

- `components/ProfileRewardsTutorial.tsx`
  - マイページ特典説明チュートリアルです。

- `components/reward-avatar.tsx`
  - アバター枠、早期登録特典、バッジ表示です。

- `components/legal-footer.tsx`
  - 利用規約・プライバシーポリシー表示用パネルです。

- `components/login-required-prompt.tsx`
  - 未ログイン時にログインを促すUIです。

- `components/service-worker-register.tsx`
  - Service Worker 登録です。

- `components/capacitor-environment.tsx`
  - Capacitor アプリ内表示時の環境調整です。

- `components/mobile-gesture-guard.tsx`
  - 長押しやジェスチャーの誤動作を抑えるためのガードです。

- `components/route-scroll-reset.tsx`
  - ページ遷移時のスクロール位置調整です。

- `components/swipe-tab-navigation.tsx`
  - スワイプによるタブ遷移補助です。

- `components/navigation-loading-overlay.tsx`, `components/page-turn-loader.tsx`
  - ページ遷移中のローディング表示です。

- `components/trial-notice-banner.tsx`
  - 試験運用バナーです。

- `components/use-unread-counts.ts`
  - 未読チャット・通知数の取得と購読です。

## lib/ と共通処理

- `lib/supabase.ts`
  - ブラウザ用 Supabase クライアントです。
  - クライアントコンポーネントから `supabase` を直接使う入口です。

- `lib/supabase-server.ts`
  - サーバーコンポーネント・API Route用のSupabaseクライアントです。
  - Cookieベースのセッションを読みます。

- `lib/admin.ts`
  - 管理者判定やメール正規化など、管理者関連の軽量共通処理です。

- `lib/admin-utils.ts`
  - 管理者ページ/APIで使う `requireAdmin` などのサーバー側管理者補助処理です。

- `lib/database.types.ts`
  - Supabase の型定義です。

- `lib/image-storage.ts`
  - 画像形式チェック、magic number判定、ブラウザdecode、canvas圧縮、R2アップロード用補助処理です。

- `lib/r2-server.ts`
  - Cloudflare R2 へのサーバー側アップロード・削除処理です。

- `lib/input-limits.ts`
  - 入力文字数などの共通制限値です。

- `lib/utils.ts`
  - 価格計算などの汎用関数です。

- `lib/legal.ts`
  - 利用規約、プライバシーポリシー、出品時注意事項などの文言です。

- `lib/rewards.ts`
  - 早期登録特典や報酬判定です。

- `lib/email.ts`
  - メール送信処理です。

- `lib/web-push.ts`
  - サーバー側 Web Push 送信処理です。

- `lib/web-push-client.ts`
  - クライアント側 Push 購読処理です。

- `lib/server-rate-limit.ts`
  - サーバー側の簡易レート制限です。

- `lib/isbn-share.ts`
  - ISBN共有・正規化系の補助処理です。

- `lib/i18n.tsx`
  - 多言語文言のContextです。

## Supabaseと接続している箇所

主な入口は次の3つです。

- クライアント側
  - `lib/supabase.ts`
  - `components/auth-provider.tsx`
  - `app/search/page.tsx`
  - `app/listing/page.tsx`
  - `app/product/[id]/client.tsx`
  - `app/chat/[id]/page.tsx`
  - `app/profile/page.tsx`
  - `app/settings/*`

- サーバー側
  - `lib/supabase-server.ts`
  - `app/product/[id]/page.tsx`
  - `app/page.tsx`
  - 各 `app/api/**/route.ts`

- Middleware
  - `middleware.ts`
  - セッション確認、管理者画面保護、アクセス計測RPC `increment_site_access` を呼びます。

Service Role Key を使うAPIもあります。例:

- `app/api/auth/login/route.ts`
  - メールBANリスト確認など。

- `app/api/auth/signup-eligibility/route.ts`
  - 登録可否チェック。

- `app/api/delete-account/route.ts`
  - Auth削除や削除処理。

- `app/api/notify/transaction/route.ts`
  - 通知・メール送信。

- `app/api/item-images/*`
  - R2画像処理。

DBスキーマ、RLS、RPCは `supabase/migrations/` にあります。アプリ側の重要な操作は、直接 `from(...).insert/update/delete` するものと、`rpc(...)` でDB関数を呼ぶものが混在しています。

## 主要処理の流れ

### 認証

1. ユーザーが `app/auth/login/page.tsx` でメール・パスワードを入力します。
2. `/api/auth/login` にPOSTします。
3. `app/api/auth/login/route.ts` が以下を確認します。
   - レート制限
   - メールBANリスト
   - Supabase Auth のログイン
   - メール確認済みか
   - `user_restrictions` によるBAN・停止
   - `profiles` の存在と `is_deactivated`
4. 成功後、通常は `/`、プロフィール未設定なら `/auth/setup-profile` へ遷移します。
5. ログイン後のセッション状態は `components/auth-provider.tsx` が保持します。

### 出品

1. `app/listing/page.tsx` で商品名、価格、ISBN、画像を入力します。
2. バーコード読み取りは `@ericblade/quagga2` を使います。
3. ISBN検索は `/api/books/isbn` に問い合わせます。
4. 画像は `lib/image-storage.ts` で形式・先頭バイト・decode・圧縮を確認します。
5. 画像アップロードは R2 系の処理に流れます。
6. 出品データは `items` に保存されます。
7. 画像エラーは `/api/listing/image-error-log` 経由で `listing_image_error_logs` に残します。

### 購入リクエスト

1. ユーザーが `app/product/[id]/page.tsx` から商品詳細を開きます。
2. サーバー側で商品・出品者・評価などを取得し、`client.tsx` に渡します。
3. `app/product/[id]/client.tsx` で購入リクエストボタンを押します。
4. `acquire_item_lock` RPC で一時ロックを取得します。
5. `components/PurchaseModal.tsx` で日程・場所・支払い方法を入力します。
6. `check_purchase_eligibility` RPC で購入可能か確認します。
7. `submit_purchase_request` RPC で `transactions`、`messages`、`notifications`、`items.status = trading` などを作成・更新します。
8. 成功後、チャットへ遷移します。

### チャット

1. `app/chat/page.tsx` は `messages` をユーザー単位で取得し、商品・相手ごとに会話をまとめます。
2. `app/chat/[id]/page.tsx` は `item_id` と必要に応じて `tx` パラメータで対象取引を読みます。
3. `messages` で通常チャットを保存します。
4. `transactions` で日程、場所、完了状態、キャンセル状態、デモ取引かどうかを管理します。
5. 日程調整や受け渡し完了では、DB更新に加えて自動メッセージ・通知を作成します。
6. 完了済み・キャンセル済みチャットは閲覧専用表示になります。

### 管理者画面

1. `/admin` 配下へのアクセスは `middleware.ts` で保護されます。
2. Basic認証が設定されている場合はBasic認証も要求されます。
3. Supabaseセッションがなければログインへ飛ばします。
4. `isCurrentUserAdmin` で管理者か確認します。
5. 管理者ページでは `app/admin/_components/admin-shell.tsx` が共通ナビを表示します。
6. 管理者操作は `app/api/admin/**` のAPIやDB RPCを通して実行され、操作ログを残す設計です。

## 初学者向け: どのファイルから読むか

最初はこの順番で読むと、全体像をつかみやすいです。

1. `app/layout.tsx`
   - アプリ全体に何が常駐しているかを把握します。

2. `components/app-nav.tsx`
   - PC/スマホのナビがどう切り替わるかを見ます。

3. `components/auth-provider.tsx`
   - ログイン状態をアプリ全体にどう配っているかを見ます。

4. `lib/supabase.ts` と `lib/supabase-server.ts`
   - Supabase接続の基本入口を確認します。

5. `app/page.tsx`
   - ホームがどのテーブルから商品を取っているかを見ます。

6. `app/search/page.tsx`
   - 商品検索、外部図書館検索、サジェストの流れを見ます。

7. `app/listing/page.tsx`
   - 出品登録と画像アップロードの流れを見ます。

8. `app/product/[id]/page.tsx` と `app/product/[id]/client.tsx`
   - 商品詳細と購入リクエストの入口を見ます。

9. `components/PurchaseModal.tsx`
   - 購入リクエスト時にユーザーが入力する内容を見ます。

10. `app/chat/[id]/page.tsx`
    - 取引開始後の中心機能です。大きいファイルなので、先に型定義とデータ取得部分を読むのがおすすめです。

11. `supabase/migrations/`
    - アプリ側から呼んでいるRPCやテーブルの正体を確認します。特に購入・チャット・BAN・削除系はDB関数の理解が重要です。

12. `app/admin/_components/admin-shell.tsx` と `app/admin/page.tsx`
    - 管理者画面の全体入口を見ます。

大きな機能を調べるときは、画面の `page.tsx` から入り、そこで使われている `components/` と `lib/`、最後に `supabase/migrations/` のRPC・テーブル定義を見る流れが安全です。
