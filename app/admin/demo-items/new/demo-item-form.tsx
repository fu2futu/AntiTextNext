"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DemoItemForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const formData = new FormData(event.currentTarget);
      const response = await fetch("/api/admin/demo-items", {
        method: "POST",
        body: formData,
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "デモ出品を作成できませんでした");
      }
      router.push("/admin/demo-home");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "デモ出品を作成できませんでした");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1 md:col-span-2">
          <span className="text-xs font-black text-slate-500">タイトル</span>
          <input name="title" required maxLength={80} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold" />
        </label>

        <label className="grid gap-1">
          <span className="text-xs font-black text-slate-500">販売価格</span>
          <input name="sellingPrice" type="number" min={0} max={50000} step={1} required defaultValue={1200} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold" />
        </label>

        <label className="grid gap-1">
          <span className="text-xs font-black text-slate-500">定価</span>
          <input name="originalPrice" type="number" min={0} max={100000} step={1} required defaultValue={2400} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold" />
        </label>

        <label className="grid gap-1">
          <span className="text-xs font-black text-slate-500">ステータス</span>
          <select name="status" defaultValue="available" className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold">
            <option value="available">出品中</option>
            <option value="trading">取引中</option>
            <option value="sold">売却済み</option>
            <option value="paused">一時停止</option>
          </select>
        </label>

        <label className="grid gap-1">
          <span className="text-xs font-black text-slate-500">用途</span>
          <select name="demoPurpose" defaultValue="app_store_screenshot" className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold">
            <option value="app_store_screenshot">App Storeスクショ</option>
            <option value="flow_test">取引フロー検証</option>
            <option value="other">その他</option>
          </select>
        </label>

        <label className="grid gap-1 md:col-span-2">
          <span className="text-xs font-black text-slate-500">説明</span>
          <textarea name="description" maxLength={200} rows={4} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold" />
        </label>

        <label className="grid gap-1">
          <span className="text-xs font-black text-slate-500">表紙画像</span>
          <input name="frontImage" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold" />
        </label>

        <label className="grid gap-1">
          <span className="text-xs font-black text-slate-500">裏表紙画像</span>
          <input name="backImage" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold" />
        </label>
      </div>

      <div className="flex justify-end gap-3">
        <button type="button" onClick={() => router.back()} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-black text-slate-700">
          戻る
        </button>
        <button disabled={submitting} className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-black text-white disabled:opacity-50">
          {submitting ? "作成中..." : "デモ出品を作成"}
        </button>
      </div>
    </form>
  );
}
