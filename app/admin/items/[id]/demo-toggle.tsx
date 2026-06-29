"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ItemDemoToggleButton({
  itemId,
  isDemo,
}: {
  itemId: string;
  isDemo: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [currentIsDemo, setCurrentIsDemo] = useState(isDemo);
  const router = useRouter();

  const toggle = async () => {
    if (loading) return;
    const newValue = !currentIsDemo;
    const confirmMessage = newValue
      ? "この出品をデモとしてマークしますか？\n出品数のカウントから除外されます。関連する取引も連動してデモになります。"
      : "この出品を通常に戻しますか？\n出品数のカウントに含まれるようになります。関連する取引も連動して通常に戻ります。";

    if (!confirm(confirmMessage)) return;

    setLoading(true);
    try {
      const res = await fetch("/api/admin/demo-items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, isDemo: newValue }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "更新に失敗しました");

      setCurrentIsDemo(newValue);
      router.refresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      {currentIsDemo ? (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">
          🏷️ デモ出品
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
          通常出品
        </span>
      )}
      <button
        type="button"
        onClick={toggle}
        disabled={loading}
        className={`rounded-xl px-4 py-2 text-xs font-black transition disabled:opacity-50 ${
          currentIsDemo
            ? "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            : "border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
        }`}
      >
        {loading ? "処理中..." : currentIsDemo ? "通常出品に戻す" : "デモに切り替え"}
      </button>
    </div>
  );
}
