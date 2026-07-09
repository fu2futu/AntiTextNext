"use client";

import { useMemo, useState } from "react";
import { CheckCircle, Loader2, Save, TrendingUp } from "lucide-react";

export default function HomeSettingsForm({
  initialRecommendedEnabled,
  initialUpdatedAt,
}: {
  initialRecommendedEnabled: boolean;
  initialUpdatedAt: string | null;
}) {
  const [recommendedEnabled, setRecommendedEnabled] = useState(initialRecommendedEnabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const updatedLabel = useMemo(() => {
    if (!initialUpdatedAt) return "未更新";
    return new Date(initialUpdatedAt).toLocaleString("ja-JP");
  }, [initialUpdatedAt]);

  const save = async () => {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const response = await fetch("/api/admin/home-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recommendedEnabled }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "保存に失敗しました");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      setError(err.message || "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5">
          <h2 className="text-lg font-black text-slate-950">セクション表示設定</h2>
          <p className="mt-1 text-sm font-bold text-slate-500">最終更新: {updatedLabel}</p>
        </div>

        <div className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start gap-3">
            <TrendingUp className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
            <div>
              <p className="text-sm font-black text-slate-900">あなたへのおすすめ</p>
              <p className="mt-1 text-xs font-bold text-slate-500">
                ホーム画面の「あなたへのおすすめ」セクションの表示可否です。オフにすると全ユーザーで非表示になります。
              </p>
            </div>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-2">
            <span className="text-sm font-black text-slate-700">{recommendedEnabled ? "表示" : "非表示"}</span>
            <input
              type="checkbox"
              checked={recommendedEnabled}
              onChange={(event) => setRecommendedEnabled(event.target.checked)}
              className="h-5 w-5 accent-slate-900"
            />
          </label>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
            {error}
          </div>
        )}
        {saved && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-700">
            <CheckCircle className="h-4 w-4" />
            保存しました
          </div>
        )}

        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          保存
        </button>
      </section>

      <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black text-slate-950">現在の状態</h2>
        <p className="mt-1 text-sm font-bold text-slate-500">
          「あなたへのおすすめ」は{recommendedEnabled ? "表示されます" : "表示されません"}。
        </p>
        <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <p className="text-xs font-bold leading-relaxed text-slate-500">
            変更は保存後、ユーザーが次にホームを開いたとき（または再読み込み時）に反映されます。
          </p>
        </div>
      </aside>
    </div>
  );
}
