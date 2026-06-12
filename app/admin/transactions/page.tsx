import Link from "next/link";
import { AdminPageHeader, StatusBadge } from "../_components/admin-shell";
import { AdminUserLink } from "../_components/admin-user-link";
import { formatAdminDate, getStringParam, requireAdmin, type AdminSearchParams } from "@/lib/admin-utils";

export const dynamic = "force-dynamic";

const ACTIVE_TRANSACTION_STATUSES = [
  "requested",
  "accepted",
  "scheduling",
  "scheduled",
  "awaiting_rating",
  "pending_approval",
  "pending",
  "confirmed",
];

export default async function AdminTransactionsPage({ searchParams }: { searchParams: AdminSearchParams }) {
  const { supabase } = await requireAdmin();
  const status = getStringParam(searchParams, "status");
  let query = (supabase as any)
    .from("transactions")
    .select("id, item_id, seller_id, buyer_id, status, created_at, completed_at, cancelled_at, final_meetup_time, cancellation_reason, items(title), ratings(id)")
    .order("created_at", { ascending: false })
    .limit(200);

  if (status === "active") query = query.in("status", ACTIVE_TRANSACTION_STATUSES);
  if (status === "completed") query = query.eq("status", "completed");
  if (status === "cancelled") query = query.eq("status", "cancelled");

  const { data, error } = await query;
  const txIds = ((data ?? []) as any[]).map((tx) => tx.id);
  const itemIds = Array.from(new Set(((data ?? []) as any[]).map((tx) => tx.item_id).filter(Boolean)));
  const userIds = Array.from(new Set(((data ?? []) as any[]).flatMap((tx) => [tx.seller_id, tx.buyer_id]).filter(Boolean)));
  const [
    { data: reports },
    { data: profiles },
    { data: transactionMessages },
    { data: itemMessages },
  ] = await Promise.all([
    txIds.length ? (supabase as any).from("reports").select("transaction_id").in("transaction_id", txIds) : Promise.resolve({ data: [] }),
    userIds.length ? supabase.from("profiles").select("user_id,nickname").in("user_id", userIds) : Promise.resolve({ data: [] }),
    txIds.length
      ? (supabase as any).from("messages").select("transaction_id, item_id, created_at").in("transaction_id", txIds).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    itemIds.length
      ? (supabase as any).from("messages").select("transaction_id, item_id, created_at").in("item_id", itemIds).is("transaction_id", null).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);
  const reportedIds = new Set(((reports ?? []) as any[]).map((report) => report.transaction_id));
  const profileMap = new Map(((profiles ?? []) as any[]).map((profile) => [profile.user_id, profile.nickname]));
  const lastMessageByTransaction = new Map<string, string>();
  const lastMessageByItem = new Map<string, string>();
  for (const message of (transactionMessages ?? []) as any[]) {
    if (message.transaction_id && !lastMessageByTransaction.has(message.transaction_id)) {
      lastMessageByTransaction.set(message.transaction_id, message.created_at);
    }
  }
  for (const message of (itemMessages ?? []) as any[]) {
    if (message.item_id && !lastMessageByItem.has(message.item_id)) {
      lastMessageByItem.set(message.item_id, message.created_at);
    }
  }

  return (
    <>
      <AdminPageHeader title="取引管理" description="チャット全文は詳細画面で理由付き確認を行った場合のみ表示します。" />
      <main className="space-y-5 p-6">
        <form className="rounded-2xl border border-slate-200 bg-white p-4">
          <select name="status" defaultValue={status} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold">
            <option value="">すべて</option>
            <option value="active">取引中</option>
            <option value="completed">完了</option>
            <option value="cancelled">キャンセル</option>
          </select>
          <button className="ml-3 rounded-xl bg-slate-900 px-5 py-3 text-sm font-black text-white">絞り込み</button>
        </form>
        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error.message}</div>}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">取引ID</th>
                <th className="px-4 py-3">出品タイトル</th>
                <th className="px-4 py-3">出品者</th>
                <th className="px-4 py-3">購入者</th>
                <th className="px-4 py-3">ステータス</th>
                <th className="px-4 py-3">購入日時</th>
                <th className="px-4 py-3">最終チャット</th>
                <th className="px-4 py-3">通報</th>
                <th className="px-4 py-3">評価</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {((data ?? []) as any[]).map((tx) => {
                return (
                  <tr key={tx.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3"><Link href={`/admin/transactions/${tx.id}`} className="font-mono text-xs font-black text-primary">{tx.id}</Link></td>
                    <td className="px-4 py-3 font-black">{tx.items?.title ?? tx.item_id}</td>
                    <td className="px-4 py-3"><AdminUserLink id={tx.seller_id} name={profileMap.get(tx.seller_id) as string | undefined} /></td>
                    <td className="px-4 py-3"><AdminUserLink id={tx.buyer_id} name={profileMap.get(tx.buyer_id) as string | undefined} /></td>
                    <td className="px-4 py-3"><StatusBadge value={tx.status} /></td>
                    <td className="px-4 py-3 font-bold text-slate-600">{formatAdminDate(tx.created_at)}</td>
                    <td className="px-4 py-3 font-bold text-slate-600">
                      {formatAdminDate(lastMessageByTransaction.get(tx.id) ?? lastMessageByItem.get(tx.item_id))}
                    </td>
                    <td className="px-4 py-3">{reportedIds.has(tx.id) ? <StatusBadge value="通報あり" /> : "-"}</td>
                    <td className="px-4 py-3">{tx.ratings?.length ? <StatusBadge value="評価あり" /> : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
