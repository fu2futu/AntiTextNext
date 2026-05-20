"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BADGE_COLOR_OPTIONS, type BadgeColor } from "@/lib/rewards";

export default function BadgeActions({ userId }: { userId: string }) {
  const router = useRouter();
  const [badgeType, setBadgeType] = useState("improvement");
  const [badgeColor, setBadgeColor] = useState<BadgeColor>("red");
  const [label, setLabel] = useState("改善提案");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const grantBadge = async () => {
    if (saving) return;
    setSaving(true);
    setError("");

    try {
      const response = await fetch("/api/admin/rewards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, badgeType, badgeColor, label, note }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "付与に失敗しました");
      setNote("");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "付与に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-black">バッジ特典</h2>
      <p className="mt-1 text-xs font-bold text-slate-500">バグ発見、改善提案などのバッジをこのユーザーへ付与します。</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-xs font-black text-slate-500">種別</span>
          <select
            value={badgeType}
            onChange={(event) => {
              setBadgeType(event.target.value);
              setLabel(event.target.value === "bug_report" ? "バグ発見" : event.target.value === "supporter" ? "運営協力" : "改善提案");
            }}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold"
          >
            <option value="improvement">改善提案</option>
            <option value="bug_report">バグ発見</option>
            <option value="supporter">運営協力</option>
          </select>
        </label>
        <label className="space-y-2">
          <span className="text-xs font-black text-slate-500">バッジ色</span>
          <select
            value={badgeColor}
            onChange={(event) => setBadgeColor(event.target.value as BadgeColor)}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold"
          >
            {BADGE_COLOR_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="space-y-2">
          <span className="text-xs font-black text-slate-500">表示名</span>
          <input value={label} onChange={(event) => setLabel(event.target.value)} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold" />
        </label>
        <label className="space-y-2 md:col-span-2">
          <span className="text-xs font-black text-slate-500">詳細</span>
          <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold" placeholder="吹き出しに表示する詳細" />
        </label>
      </div>
      {error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}
      <button type="button" onClick={grantBadge} disabled={saving || !label} className="mt-4 rounded-xl bg-primary px-5 py-3 text-sm font-black text-white disabled:opacity-50">
        バッジを付与
      </button>
    </section>
  );
}
