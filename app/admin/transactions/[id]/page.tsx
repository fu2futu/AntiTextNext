import { AdminPageHeader, StatusBadge } from "../../_components/admin-shell";
import { AdminUserLink } from "../../_components/admin-user-link";
import { RevealChatButton } from "../../_components/reveal-chat-button";
import { DemoToggleButton } from "./demo-toggle";
import { formatAdminDate, requireAdmin } from "@/lib/admin-utils";

export const dynamic = "force-dynamic";

export default async function AdminTransactionDetailPage({ params }: { params: { id: string } }) {
  const { supabase } = await requireAdmin();
  const { data: tx, error } = await (supabase as any)
    .from("transactions")
    .select("*, items(id,title,status,front_image_url), ratings(*)")
    .eq("id", params.id)
    .single();
  const userIds = [tx?.seller_id, tx?.buyer_id].filter(Boolean);
  const { data: profiles } = userIds.length ? await supabase.from("profiles").select("user_id,nickname").in("user_id", userIds) : { data: [] };
  const profileMap = new Map(((profiles ?? []) as any[]).map((profile) => [profile.user_id, profile.nickname]));

  return (
    <>
      <AdminPageHeader title="取引詳細" description="チャット全文は初期表示しません。必要時のみ理由を記録して表示します。" />
      <main className="space-y-6 p-6">
        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error.message}</div>}
        {tx && (
          <>
            {/* Demo toggle section */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 text-xs font-black uppercase text-slate-500">デモ管理</h2>
              <DemoToggleButton transactionId={tx.id} isDemo={Boolean(tx.is_demo)} />
            </section>

            <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2">
              <Field label="商品" value={tx.items?.title ?? tx.item_id} />
              <Field label="取引ステータス" value={<StatusBadge value={tx.status} />} />
              <Field label="出品者" value={<AdminUserLink id={tx.seller_id} name={profileMap.get(tx.seller_id) as string | undefined} />} />
              <Field label="購入者" value={<AdminUserLink id={tx.buyer_id} name={profileMap.get(tx.buyer_id) as string | undefined} />} />
              <Field label="購入日時" value={formatAdminDate(tx.created_at)} />
              <Field label="受け渡し日時" value={`${tx.final_meetup_time || "未確定"} / ${tx.final_meetup_location || "-"}`} />
              <Field label="候補日時" value={(tx.meetup_time_slots ?? []).join(", ") || "-"} />
              <Field label="候補場所" value={(tx.meetup_locations ?? []).join(", ") || "-"} />
              <Field label="キャンセル理由" value={tx.cancellation_reason || "-"} />
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-black">取引チャット</h2>
              <RevealChatButton transactionId={tx.id} />
            </section>
          </>
        )}
      </main>
    </>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-black text-slate-500">{label}</p>
      <div className="text-sm font-bold text-slate-900">{value}</div>
    </div>
  );
}
