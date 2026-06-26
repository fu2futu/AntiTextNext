"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function UserNotificationActions({ userId }: { userId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("運営からのお知らせ");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const sendNotification = async () => {
    if (saving) return;
    if (!message.trim()) {
      setError("通知本文を入力してください");
      return;
    }

    if (!confirm("この内容でユーザーのお知らせに送信しますか？")) return;

    setSaving(true);
    setError("");
    setSent(false);

    try {
      const response = await fetch("/api/admin/user-notification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, title, message }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "通知の送信に失敗しました");

      setMessage("");
      setSent(true);
      router.refresh();
    } catch (err: any) {
      setError(err.message || "通知の送信に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-black">お知らせ送信</h2>
        <p className="mt-1 text-xs font-bold text-slate-500">
          このユーザーのお知らせ一覧に、運営からの任意メッセージを送信します。送信操作は管理者ログに残ります。
        </p>
      </div>

      <div className="grid gap-4">
        <label className="space-y-2">
          <span className="text-xs font-black text-slate-500">タイトル</span>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value.slice(0, 80))}
            maxLength={80}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold"
            placeholder="運営からのお知らせ"
          />
          <span className="block text-right text-[11px] font-bold text-slate-400">{title.length}/80</span>
        </label>

        <label className="space-y-2">
          <span className="text-xs font-black text-slate-500">本文</span>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value.slice(0, 1000))}
            rows={5}
            maxLength={1000}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold"
            placeholder="ユーザーに表示する文章を入力してください"
          />
          <span className="block text-right text-[11px] font-bold text-slate-400">{message.length}/1000</span>
        </label>
      </div>

      {error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}
      {sent && <p className="mt-3 rounded-xl border border-green-200 bg-green-50 p-3 text-sm font-bold text-green-700">お知らせを送信しました</p>}

      <div className="mt-4">
        <button
          type="button"
          onClick={sendNotification}
          disabled={saving || !message.trim()}
          className="rounded-xl bg-primary px-5 py-3 text-sm font-black text-white disabled:opacity-50"
        >
          {saving ? "送信中..." : "お知らせに送信"}
        </button>
      </div>
    </section>
  );
}
