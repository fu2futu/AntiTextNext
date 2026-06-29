"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AdminUserLink } from "../_components/admin-user-link";
import { StatusBadge } from "../_components/admin-shell";

function formatAdminDateClient(dateString: string | null | undefined) {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleString("ja-JP", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit"
  });
}

export default function TransactionsListClient({
  transactions,
  reportedIds,
  profileMap,
  lastMessageByTransaction,
  lastMessageByItem,
}: {
  transactions: any[];
  reportedIds: string[];
  profileMap: Record<string, string>;
  lastMessageByTransaction: Record<string, string>;
  lastMessageByItem: Record<string, string>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === transactions.length) setSelected(new Set());
    else setSelected(new Set(transactions.map((t) => t.id)));
  };

  const toggleDemoSelected = async (targetIsDemo: boolean) => {
    const ids = Array.from(selected);
    if (ids.length === 0 || loading) return;

    const actionText = targetIsDemo ? "デモに切り替え" : "通常に戻し";
    if (!window.confirm(`選択した取引 ${ids.length}件を${actionText}ます。関連する出品も連動します。続行しますか？`)) return;

    setLoading(true);
    try {
      const response = await fetch("/api/admin/demo-transactions-bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionIds: ids, isDemo: targetIsDemo }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "変更に失敗しました");
      
      alert(`${result.updated}件の取引を${targetIsDemo ? "デモ" : "通常"}に設定しました`);
      setSelected(new Set());
      router.refresh();
    } catch (err: any) {
      alert(err.message || "変更に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="mb-4 flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="text-sm font-bold text-slate-700">
          選択中: <span className="text-primary">{selected.size}件</span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => toggleDemoSelected(true)}
            disabled={selected.size === 0 || loading}
            className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-black text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
          >
            {loading ? "処理中..." : "デモにする"}
          </button>
          <button
            type="button"
            onClick={() => toggleDemoSelected(false)}
            disabled={selected.size === 0 || loading}
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-black text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
          >
            {loading ? "処理中..." : "通常に戻す"}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 text-center">
                <input
                  type="checkbox"
                  checked={transactions.length > 0 && selected.size === transactions.length}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                />
              </th>
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
            {transactions.map((tx) => (
              <tr key={tx.id} className={`hover:bg-slate-50 ${tx.is_demo ? "bg-amber-50/40" : ""}`}>
                <td className="px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={selected.has(tx.id)}
                    onChange={() => toggle(tx.id)}
                    className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1">
                    <Link href={`/admin/transactions/${tx.id}`} className="font-mono text-xs font-black text-primary hover:underline">
                      {tx.id}
                    </Link>
                    {tx.is_demo && (
                      <span className="inline-flex w-max rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-700">
                        🏷️ デモ
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 font-black">{tx.items?.title ?? tx.item_id}</td>
                <td className="px-4 py-3"><AdminUserLink id={tx.seller_id} name={profileMap[tx.seller_id]} /></td>
                <td className="px-4 py-3"><AdminUserLink id={tx.buyer_id} name={profileMap[tx.buyer_id]} /></td>
                <td className="px-4 py-3"><StatusBadge value={tx.status} /></td>
                <td className="px-4 py-3 font-bold text-slate-600">{formatAdminDateClient(tx.created_at)}</td>
                <td className="px-4 py-3 font-bold text-slate-600">
                  {formatAdminDateClient(lastMessageByTransaction[tx.id] ?? lastMessageByItem[tx.item_id])}
                </td>
                <td className="px-4 py-3">{reportedIds.includes(tx.id) ? <StatusBadge value="通報あり" /> : "-"}</td>
                <td className="px-4 py-3">{tx.ratings?.length ? <StatusBadge value="評価あり" /> : "-"}</td>
              </tr>
            ))}
            {transactions.length === 0 && (
              <tr>
                <td colSpan={10} className="p-8 text-center text-sm font-bold text-slate-500">
                  取引が見つかりません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
