"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DemoItemsActions({ itemIds }: { itemIds: string[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deleteSelected = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0 || loading) return;
    if (!window.confirm(`選択したデモ出品 ${ids.length}件を削除します。通常データは対象外です。続行しますか？`)) return;

    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/demo-items", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds: ids }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "削除に失敗しました");
      setMessage(`${result.deleted ?? ids.length}件のデモ出品を削除しました`);
      setSelected(new Set());
      router.refresh();
    } catch (err: any) {
      setMessage(err.message || "削除に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-bold text-slate-600">選択中: {selected.size}件</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setSelected(new Set(itemIds))}
            className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-black text-slate-700"
          >
            すべて選択
          </button>
          <button
            type="button"
            onClick={deleteSelected}
            disabled={selected.size === 0 || loading}
            className="rounded-xl bg-red-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50"
          >
            {loading ? "削除中..." : "選択したデモ出品を削除"}
          </button>
        </div>
      </div>
      {message && <p className="text-sm font-bold text-slate-600">{message}</p>}
      <div className="mt-3 grid gap-2">
        {itemIds.map((id) => (
          <label key={id} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs font-mono text-slate-600">
            <input type="checkbox" checked={selected.has(id)} onChange={() => toggle(id)} />
            {id}
          </label>
        ))}
      </div>
    </div>
  );
}
