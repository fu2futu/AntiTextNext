"use client";

import { useMemo, useState } from "react";
import { CheckCircle, Loader2, Megaphone, Save } from "lucide-react";

export default function BannerSettingsForm({
  initialEnabled,
  initialMessage,
  initialUpdatedAt,
}: {
  initialEnabled: boolean;
  initialMessage: string;
  initialUpdatedAt: string | null;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [message, setMessage] = useState(initialMessage);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const normalizedMessage = message.trim();
  const actuallyVisible = enabled && normalizedMessage.length > 0;
  const updatedLabel = useMemo(() => {
    if (!initialUpdatedAt) return "未更新";
    return new Date(initialUpdatedAt).toLocaleString("ja-JP");
  }, [initialUpdatedAt]);

  const save = async () => {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const response = await fetch("/api/admin/banner", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, message }),
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
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-black text-slate-950">表示設定</h2>
            <p className="mt-1 text-sm font-bold text-slate-500">最終更新: {updatedLabel}</p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-3 rounded-full border border-slate-200 bg-slate-50 px-4 py-2">
            <span className="text-sm font-black text-slate-700">{enabled ? "表示" : "非表示"}</span>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
              className="h-5 w-5 accent-slate-900"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-sm font-black text-slate-800">お知らせ本文</span>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={8}
            maxLength={500}
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white p-4 text-sm font-bold leading-relaxed outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
            placeholder="例: 本日18:00頃から短時間のメンテナンスを予定しています。"
          />
        </label>
        <div className="mt-2 flex items-center justify-between gap-3 text-xs font-bold text-slate-500">
          <span>改行はそのまま表示されます。</span>
          <span>{message.length}/500</span>
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
        <h2 className="text-lg font-black text-slate-950">プレビュー</h2>
        <p className="mt-1 text-sm font-bold text-slate-500">
          現在の設定では{actuallyVisible ? "表示されます" : "表示されません"}。
        </p>
        <div className="mt-5 rounded-2xl border border-sky-100 bg-sky-50 p-4 text-sky-950">
          {actuallyVisible ? (
            <div className="flex items-start gap-3">
              <Megaphone className="mt-0.5 h-4 w-4 flex-shrink-0 text-sky-600" />
              <p className="whitespace-pre-wrap text-xs font-bold leading-relaxed">{normalizedMessage}</p>
            </div>
          ) : (
            <p className="text-sm font-bold text-slate-500">本文を入力し、表示をONにするとバナーが表示されます。</p>
          )}
        </div>
      </aside>
    </div>
  );
}
