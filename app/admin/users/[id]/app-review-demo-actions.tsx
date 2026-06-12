"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AppReviewDemoActions({
  userId,
  enabled,
}: {
  userId: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState("");

  const updateFlag = async (nextEnabled: boolean) => {
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/admin/app-review-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          enabled: nextEnabled,
          reason: nextEnabled
            ? "App Store審査用アカウントとして有効化"
            : "App Store審査用アカウント設定を解除",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "更新できませんでした");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "更新できませんでした");
    } finally {
      setLoading(false);
    }
  };

  const resetDemoData = async () => {
    if (!window.confirm("このユーザーに紐づくデモ取引・デモ評価・デモ通知をリセットします。よろしいですか？")) {
      return;
    }

    setError("");
    setResetting(true);
    try {
      const response = await fetch("/api/admin/app-review-demo", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          reason: "App Store審査前のデモ状態リセット",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "リセットできませんでした");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "リセットできませんでした");
    } finally {
      setResetting(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-black text-slate-900">App Store審査用アカウント</h2>
        <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
          有効にすると、このユーザーはデモ出品・デモ取引だけを操作できます。管理者権限は付与されません。
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => updateFlag(!enabled)}
          disabled={loading}
          className={`rounded-xl px-4 py-2.5 text-sm font-black text-white disabled:opacity-50 ${
            enabled ? "bg-slate-600 hover:bg-slate-700" : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {loading ? "更新中..." : enabled ? "審査用設定を解除" : "審査用アカウントにする"}
        </button>
        <button
          type="button"
          onClick={resetDemoData}
          disabled={!enabled || resetting}
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-black text-amber-800 hover:bg-amber-100 disabled:opacity-50"
        >
          {resetting ? "リセット中..." : "デモ取引をリセット"}
        </button>
      </div>
      {enabled && (
        <p className="mt-3 rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700">
          現在、このユーザーはApp Store審査用アカウントとして扱われます。
        </p>
      )}
      {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error}</p>}
    </section>
  );
}
