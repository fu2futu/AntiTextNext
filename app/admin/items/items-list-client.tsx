"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { AdminUserLink } from "../_components/admin-user-link";
import { StatusBadge } from "../_components/admin-shell";

function formatAdminDateClient(dateString: string | null) {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleString("ja-JP", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit"
  });
}

function Thumb({ src }: { src?: string | null }) {
  if (!src) return <div className="h-14 w-10 rounded-lg bg-slate-100" />;
  return <Image src={src} alt="" width={40} height={56} className="h-14 w-10 rounded-lg object-cover" />;
}

export default function ItemsListClient({
  items,
  reportedIds,
  profileMap,
}: {
  items: any[];
  reportedIds: string[];
  profileMap: Record<string, string>;
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
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map((i) => i.id)));
  };

  const deleteSelected = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0 || loading) return;

    // Client-side guard check for transactions
    const itemsWithTx = items.filter((i) => ids.includes(i.id) && i.transactions && i.transactions.length > 0);
    if (itemsWithTx.length > 0) {
      alert(`取引が関連付けられている出品（${itemsWithTx.length}件）が含まれています。\n取引のある出品は削除できません。選択を解除してください。`);
      return;
    }

    if (!window.confirm(`選択した出品 ${ids.length}件を完全削除します。関連する画像も削除されます。\n元に戻すことはできません。続行しますか？`)) return;

    setLoading(true);
    try {
      const response = await fetch("/api/admin/items-bulk-purge", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds: ids }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "削除に失敗しました");
      
      alert(`${result.deleted}件の出品を削除しました`);
      setSelected(new Set());
      router.refresh();
    } catch (err: any) {
      alert(err.message || "削除に失敗しました");
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
            onClick={deleteSelected}
            disabled={selected.size === 0 || loading}
            className="rounded-lg bg-red-600 px-4 py-2 text-xs font-black text-white transition hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? "削除中..." : "選択した出品を完全削除"}
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
                  checked={items.length > 0 && selected.size === items.length}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                />
              </th>
              <th className="px-4 py-3">出品</th>
              <th className="px-4 py-3">表紙</th>
              <th className="px-4 py-3">裏表紙</th>
              <th className="px-4 py-3">出品者</th>
              <th className="px-4 py-3">出品日時</th>
              <th className="px-4 py-3">状態</th>
              <th className="px-4 py-3">取引状態</th>
              <th className="px-4 py-3">通報</th>
              <th className="px-4 py-3">アクション</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => (
              <tr key={item.id} className={`hover:bg-slate-50 ${item.is_demo ? "bg-amber-50/40" : ""}`}>
                <td className="px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={() => toggle(item.id)}
                    className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1">
                    <Link href={`/admin/items/${item.id}`} className="font-black text-primary hover:underline">
                      {item.title}
                    </Link>
                    {item.is_demo && (
                      <span className="inline-flex w-max rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-700">
                        🏷️ デモ
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3"><Thumb src={item.front_thumbnail_url} /></td>
                <td className="px-4 py-3"><Thumb src={item.back_thumbnail_url} /></td>
                <td className="px-4 py-3"><AdminUserLink id={item.seller_id} name={profileMap[item.seller_id]} /></td>
                <td className="px-4 py-3 font-bold text-slate-600">{formatAdminDateClient(item.created_at)}</td>
                <td className="px-4 py-3"><StatusBadge value={item.status} /></td>
                <td className="px-4 py-3"><StatusBadge value={item.transactions?.[0]?.status ?? "未取引"} /></td>
                <td className="px-4 py-3">{reportedIds.includes(item.id) ? <StatusBadge value="通報あり" /> : "-"}</td>
                <td className="px-4 py-3">
                  <Link href={`/admin/items/${item.id}`} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">
                    詳細
                  </Link>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={10} className="p-8 text-center text-sm font-bold text-slate-500">
                  出品が見つかりません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
