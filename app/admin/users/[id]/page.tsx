import Link from "next/link";
import { AdminPageHeader, StatusBadge } from "../../_components/admin-shell";
import { RevealEmailButton } from "../../_components/reveal-email-button";
import { formatAdminDate, maskEmail, requireAdmin } from "@/lib/admin-utils";
import { RewardAvatar, RewardBadges } from "@/components/reward-avatar";
import { BADGE_COLOR_OPTIONS, normalizeBadgeColor, resolveEarlyRegistrationEligible } from "@/lib/rewards";
import RestrictionActions from "./restriction-actions";
import BadgeActions from "./badge-actions";
import EarlyRewardActions from "./early-reward-actions";
import { RevokeBadgeButton } from "./revoke-badge-button";

export const dynamic = "force-dynamic";

export default async function AdminUserDetailPage({ params }: { params: { id: string } }) {
  const { supabase } = await requireAdmin();
  const userId = params.id;

  const [profileResult, listResult, itemsResult, listingCountResult, buyerTxResult, sellerTxResult, ratingsResult, reportsAgainstResult, reportsByResult, restrictionsResult, badgesResult, rewardOverrideResult, rewardSettingResult, imageErrorLogsResult] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", userId).single(),
    (supabase as any).rpc("admin_list_users", { search_text: userId, ban_filter: null }),
    supabase.from("items").select("id, title, status, created_at, front_image_url").eq("seller_id", userId).order("created_at", { ascending: false }).limit(20),
    supabase.from("items").select("id", { count: "exact", head: true }).eq("seller_id", userId).neq("status", "deleted"),
    supabase.from("transactions").select("id, item_id, status, created_at").eq("buyer_id", userId).order("created_at", { ascending: false }).limit(20),
    supabase.from("transactions").select("id, item_id, status, created_at").eq("seller_id", userId).order("created_at", { ascending: false }).limit(20),
    (supabase as any).from("ratings").select("*").or(`rater_id.eq.${userId},rated_id.eq.${userId}`).order("created_at", { ascending: false }).limit(20),
    (supabase as any).from("reports").select("*").eq("reported_user_id", userId).order("created_at", { ascending: false }).limit(20),
    (supabase as any).from("reports").select("*").eq("reporter_id", userId).order("created_at", { ascending: false }).limit(20),
    (supabase as any).from("user_restrictions").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
    (supabase as any).from("user_badges").select("*").eq("user_id", userId).is("revoked_at", null).order("created_at", { ascending: false }).limit(20),
    (supabase as any).from("user_reward_overrides").select("*").eq("user_id", userId).maybeSingle(),
    (supabase as any).from("reward_settings").select("*").eq("id", "early_registration").single(),
    (supabase as any).from("listing_image_error_logs").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
  ]);

  const profile = profileResult.data as any;
  const badges = (badgesResult.data ?? []) as any[];
  const listingCount = listingCountResult.count ?? 0;
  const earlyRegistrationEligible = resolveEarlyRegistrationEligible(
    profile?.created_at,
    rewardSettingResult.data as any,
    rewardOverrideResult.data as any
  );
  const userSummary = ((listResult.data ?? []) as any[]).find((user) => user.user_id === userId);
  const maskedEmail = userSummary?.masked_email ?? maskEmail(null);
  const activeRestriction = ((restrictionsResult.data ?? []) as any[]).find((restriction) => {
    if (restriction.lifted_at) return false;
    if (!restriction.ends_at) return true;
    return new Date(restriction.ends_at).getTime() > Date.now();
  });

  return (
    <>
      <AdminPageHeader title="ユーザー詳細" description="大学メールアドレスは理由付き操作でのみ全文表示できます。" />
      <main className="space-y-6 p-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-5 md:flex-row md:items-start">
            <RewardAvatar
              src={profile?.avatar_url}
              alt={profile?.nickname ?? "ユーザー"}
              size={96}
              listingCount={listingCount}
              earlyRegistration={earlyRegistrationEligible}
            />
            <div className="grid flex-1 gap-4 md:grid-cols-2">
              <Field label="ユーザーネーム" value={profile?.nickname ?? "-"} />
              <Field label="アカウントID" value={userId} mono />
              <Field label="学院・課程・学年・系" value={[profile?.department, profile?.degree, profile?.grade ? `${profile.grade}年` : null, profile?.major].filter(Boolean).join(" / ") || "-"} />
              <Field label="登録日" value={formatAdminDate(profile?.created_at)} />
              <div>
                <p className="mb-1 text-xs font-black text-slate-500">大学メールアドレス</p>
                <RevealEmailButton userId={userId} maskedEmail={maskedEmail} />
              </div>
              <div>
                <p className="mb-1 text-xs font-black text-slate-500">BAN/制限状態</p>
                <StatusBadge value={userSummary?.restriction_status} />
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-black text-slate-900">ユーザー表示プレビュー</h2>
            <p className="mt-1 text-xs font-bold text-slate-500">
              通常ユーザーが見るアカウント写真・出品数の縁・早期特典・バッジ表示です。
            </p>
          </div>
          <div className="rounded-3xl border border-slate-100 bg-gradient-to-br from-white to-slate-50 p-5">
            <div className="flex items-center gap-5">
              <RewardAvatar
                src={profile?.avatar_url}
                alt={profile?.nickname ?? "ユーザー"}
                size={80}
                listingCount={listingCount}
                earlyRegistration={earlyRegistrationEligible}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xl font-black text-slate-900">{profile?.nickname ?? "未設定"}</p>
                <RewardBadges badges={badges} />
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-2xl bg-primary/5 px-3 py-2 text-center">
                    <p className="text-[10px] font-black text-primary/70">出品数</p>
                    <p className="text-lg font-black text-primary">{listingCount}件</p>
                  </div>
                  <div className="rounded-2xl bg-slate-100 px-3 py-2 text-center">
                    <p className="text-[10px] font-black text-slate-500">バッジ</p>
                    <p className="text-lg font-black text-slate-900">{badges.length}個</p>
                  </div>
                </div>
                {earlyRegistrationEligible && (
                  <p className="mt-3 text-xs font-bold text-amber-700">早期登録特典のスパークル表示が有効です。</p>
                )}
              </div>
            </div>
          </div>
        </section>

        <RestrictionActions userId={userId} activeRestriction={activeRestriction?.restriction_type ?? userSummary?.restriction_status} />
        <EarlyRewardActions
          userId={userId}
          initialOverride={(rewardOverrideResult.data as any)?.early_registration_override}
          initialNote={(rewardOverrideResult.data as any)?.note}
        />
        <BadgeActions userId={userId} />

        <Grid>
          <ImageErrorLogList logs={(imageErrorLogsResult.data ?? []) as any[]} />
          <BadgeList badges={badges} />
          <List title="出品一覧" rows={(itemsResult.data ?? []).map((item: any) => ({ href: `/admin/items?item=${item.id}`, title: item.title, meta: `${item.status} / ${formatAdminDate(item.created_at)}` }))} />
          <List title="購入履歴" rows={(buyerTxResult.data ?? []).map((tx: any) => ({ href: `/admin/transactions/${tx.id}`, title: tx.id, meta: `${tx.status} / ${formatAdminDate(tx.created_at)}` }))} />
          <List title="出品側取引履歴" rows={(sellerTxResult.data ?? []).map((tx: any) => ({ href: `/admin/transactions/${tx.id}`, title: tx.id, meta: `${tx.status} / ${formatAdminDate(tx.created_at)}` }))} />
          <List title="評価・コメント" rows={((ratingsResult.data ?? []) as any[]).map((rating) => ({ title: `${rating.rating ?? "-"} / ${rating.comment ?? ""}`, meta: formatAdminDate(rating.created_at) }))} />
          <List title="通報された履歴" rows={((reportsAgainstResult.data ?? []) as any[]).map((report) => ({ href: `/admin/reports/${report.id}`, title: report.reason, meta: `${report.status} / ${formatAdminDate(report.created_at)}` }))} />
          <List title="通報した履歴" rows={((reportsByResult.data ?? []) as any[]).map((report) => ({ href: `/admin/reports/${report.id}`, title: report.reason, meta: `${report.status} / ${formatAdminDate(report.created_at)}` }))} />
          <List title="BAN/制限履歴" rows={((restrictionsResult.data ?? []) as any[]).map((r) => ({ title: r.restriction_type, meta: `${r.reason} / ${formatAdminDate(r.created_at)}` }))} />
        </Grid>
      </main>
    </>
  );
}

function ImageErrorLogList({ logs }: { logs: any[] }) {
  const stageLabel: Record<string, string> = {
    mime_validation: "形式チェック",
    size_validation: "サイズチェック",
    browser_image_decode: "ブラウザ読み込み",
    canvas_context: "画像処理開始",
    canvas_encode: "圧縮/変換",
    r2_upload_request: "R2アップロード",
    unknown: "不明",
  };

  const formatSize = (bytes?: number | null) => {
    if (!bytes) return "-";
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
    return `${Math.round(bytes / 1024)}KB`;
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-1 text-lg font-black">出品画像エラー</h2>
      <p className="mb-4 text-xs font-bold text-slate-500">
        出品に失敗した画像だけの診断ログです。画像本体や元ファイル名は保存していません。
      </p>
      <div className="space-y-3">
        {logs.map((log) => (
          <div key={log.id} className="rounded-xl border border-rose-100 bg-rose-50/50 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-rose-100 px-2 py-1 text-[11px] font-black text-rose-700">
                {stageLabel[log.stage] ?? log.stage}
              </span>
              <span className="rounded-full bg-white px-2 py-1 text-[11px] font-black text-slate-600">
                {log.side === "front" ? "表紙" : log.side === "back" ? "裏表紙" : "不明"}
              </span>
              <span className="text-xs font-bold text-slate-500">{formatAdminDate(log.created_at)}</span>
            </div>
            <p className="mt-2 text-sm font-black text-slate-900">{log.message}</p>
            <p className="mt-1 text-xs font-bold text-slate-600">
              形式: {log.mime_type || "-"} / 拡張子: {log.extension || "-"} / サイズ: {formatSize(log.size_bytes)}
            </p>
            <p className="mt-1 text-xs font-bold text-slate-600">
              実体判定: {log.detected_format || "-"} / 先頭bytes: {log.magic_bytes || "-"}
            </p>
            <p className="mt-1 text-xs font-bold text-slate-600">
              decode: {log.decode_method || "-"} / objectURL: {log.object_url_decode_result || "-"} / dataURL: {log.data_url_decode_result || "-"} / bitmap: {log.create_image_bitmap_result || "-"}
            </p>
            {(log.decoded_width || log.decoded_height) && (
              <p className="mt-1 text-xs font-bold text-slate-600">
                画像サイズ: {log.decoded_width || "-"} x {log.decoded_height || "-"} px
              </p>
            )}
            {log.user_agent && (
              <p className="mt-1 truncate text-[11px] font-bold text-slate-400" title={log.user_agent}>
                UA: {log.user_agent}
              </p>
            )}
          </div>
        ))}
        {logs.length === 0 && <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm font-bold text-slate-500">画像エラーログはありません</p>}
      </div>
    </div>
  );
}

function BadgeList({ badges }: { badges: any[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-black">付与中のバッジ</h2>
      <div className="space-y-3">
        {badges.map((badge) => (
          <div key={badge.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-black">{badge.label}</p>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  {badge.badge_type} / {getBadgeColorLabel(badge.badge_color)} / {formatAdminDate(badge.created_at)}
                </p>
                {badge.note && <p className="mt-2 whitespace-pre-wrap text-xs font-bold text-slate-600">{badge.note}</p>}
              </div>
              <RevokeBadgeButton badgeId={badge.id} />
            </div>
          </div>
        ))}
        {badges.length === 0 && <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm font-bold text-slate-500">バッジはありません</p>}
      </div>
    </div>
  );
}

function getBadgeColorLabel(color?: string | null) {
  const normalizedColor = normalizeBadgeColor(color);
  return BADGE_COLOR_OPTIONS.find((option) => option.value === normalizedColor)?.label ?? "赤";
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="mb-1 text-xs font-black text-slate-500">{label}</p>
      <p className={`text-sm font-bold text-slate-900 ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <section className="grid gap-5 xl:grid-cols-2">{children}</section>;
}

function List({ title, rows }: { title: string; rows: Array<{ title: string; meta: string; href?: string }> }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-black">{title}</h2>
      <div className="space-y-3">
        {rows.map((row, index) => {
          const content = (
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="truncate text-sm font-black">{row.title}</p>
              <p className="mt-1 text-xs font-bold text-slate-500">{row.meta}</p>
            </div>
          );
          return row.href ? <Link key={`${row.title}-${index}`} href={row.href}>{content}</Link> : <div key={`${row.title}-${index}`}>{content}</div>;
        })}
        {rows.length === 0 && <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm font-bold text-slate-500">データがありません</p>}
      </div>
    </div>
  );
}
