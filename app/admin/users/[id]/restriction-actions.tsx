"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function RestrictionActions({
  userId,
  activeRestriction,
}: {
  userId: string;
  activeRestriction?: string | null;
}) {
  const router = useRouter();
  const [restrictionType, setRestrictionType] = useState("warning");
  const [reason, setReason] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [userNotice, setUserNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const applyRestriction = async () => {
    if (saving) return;
    setSaving(true);
    setError("");

    try {
      const response = await fetch("/api/admin/user-restriction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, restrictionType, reason, endsAt, adminNote, userNotice }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "登録に失敗しました");

      setReason("");
      setEndsAt("");
      setAdminNote("");
      setUserNotice("");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "登録に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const liftRestrictions = async () => {
    if (saving) return;
    const liftReason = reason.trim() || "管理画面から制限解除";
    if (!confirm("このユーザーの有効なBAN/制限を解除しますか？")) return;

    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/admin/user-restriction", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, reason: liftReason }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "解除に失敗しました");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "解除に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black">BAN・制限操作</h2>
          <p className="mt-1 text-xs font-bold text-slate-500">
            操作はサーバー側で管理者確認し、操作ログに残します。永久BANはメールハッシュBANにも登録し、ログイン・再登録を制限します。
          </p>
        </div>
        <p className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-black text-slate-600">
          現在: {activeRestriction || "none"}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-xs font-black text-slate-500">制限種別</span>
          <select
            value={restrictionType}
            onChange={(event) => setRestrictionType(event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold"
          >
            <option value="warning">警告</option>
            <option value="temporary_suspend">一時停止</option>
            <option value="permanent_ban">永久BAN</option>
          </select>
        </label>
        <label className="space-y-2">
          <span className="text-xs font-black text-slate-500">期限（一時停止のみ）</span>
          <input
            type="datetime-local"
            value={endsAt}
            onChange={(event) => setEndsAt(event.target.value)}
            disabled={restrictionType !== "temporary_suspend"}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold disabled:bg-slate-100"
          />
        </label>
        <label className="space-y-2 md:col-span-2">
          <span className="text-xs font-black text-slate-500">理由</span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold"
            placeholder="制限または解除の理由"
          />
        </label>
        <label className="space-y-2">
          <span className="text-xs font-black text-slate-500">管理者メモ</span>
          <textarea value={adminNote} onChange={(event) => setAdminNote(event.target.value)} rows={3} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold" />
        </label>
        <label className="space-y-2">
          <span className="text-xs font-black text-slate-500">ユーザー向け通知文</span>
          <textarea value={userNotice} onChange={(event) => setUserNotice(event.target.value)} rows={3} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold" />
        </label>
      </div>

      {error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={applyRestriction} disabled={saving || !reason.trim()} className="rounded-xl bg-red-600 px-5 py-3 text-sm font-black text-white disabled:opacity-50">
          BAN/制限を登録
        </button>
        <button type="button" onClick={liftRestrictions} disabled={saving} className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-black text-slate-700 disabled:opacity-50">
          有効な制限を解除
        </button>
      </div>
    </section>
  );
}
