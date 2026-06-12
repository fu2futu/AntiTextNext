"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getItemImageUrl } from "@/lib/image-storage";
import { BOOK_REQUEST_STATUSES, BOOK_REQUEST_STATUS_LABELS } from "../status";

type ItemHit = {
  id: string;
  title: string;
  selling_price: number;
  status: string;
  front_image_url: string | null;
  front_thumbnail_url: string | null;
  front_image_storage_path: string | null;
  front_thumbnail_storage_path: string | null;
  image_storage_provider: string | null;
};

export default function BookRequestActions({
  requestId,
  initialStatus,
  initialAdminNote,
  requesterId,
  bookTitle,
}: {
  requestId: string;
  initialStatus: string;
  initialAdminNote?: string | null;
  requesterId?: string | null;
  bookTitle?: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [adminNote, setAdminNote] = useState(initialAdminNote ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [query, setQuery] = useState(bookTitle ?? "");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<ItemHit[]>([]);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<ItemHit | null>(null);
  const [notifying, setNotifying] = useState(false);
  const [notifyError, setNotifyError] = useState("");
  const [notifySuccess, setNotifySuccess] = useState("");

  const searchItems = async (raw?: string) => {
    const q = (raw ?? query).trim();
    if (!q || searching) return;
    setSearching(true);
    setNotifyError("");
    setNotifySuccess("");
    try {
      const { data, error: searchError } = await supabase
        .from("items")
        .select(
          "id, title, selling_price, status, front_image_url, front_thumbnail_url, front_image_storage_path, front_thumbnail_storage_path, image_storage_provider"
        )
        .in("status", ["available", "trading"])
        .ilike("title", `%${q}%`)
        .order("created_at", { ascending: false })
        .limit(20);
      if (searchError) throw searchError;
      setResults((data ?? []) as ItemHit[]);
      setSearched(true);
    } catch (err: any) {
      setNotifyError(err.message || "検索に失敗しました");
    } finally {
      setSearching(false);
    }
  };

  // 初期表示時にリクエストの本タイトルで自動検索
  useEffect(() => {
    if (requesterId && bookTitle?.trim()) {
      searchItems(bookTitle);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const notifyListing = async () => {
    if (notifying || !selected) return;
    setNotifying(true);
    setNotifyError("");
    setNotifySuccess("");

    try {
      const response = await fetch("/api/admin/book-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, itemRef: selected.id }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "通知の送信に失敗しました");

      setNotifySuccess(`「${selected.title}」の出品をリクエスト者へ通知しました。`);
      setSelected(null);
      router.refresh();
    } catch (err: any) {
      setNotifyError(err.message || "通知の送信に失敗しました");
    } finally {
      setNotifying(false);
    }
  };

  const save = async (nextStatus?: string) => {
    if (saving) return;
    const statusToSave = nextStatus ?? status;
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/admin/book-request", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          status: statusToSave,
          adminNote,
          reason: `本リクエストのステータスを「${BOOK_REQUEST_STATUS_LABELS[statusToSave] ?? statusToSave}」に変更`,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "更新に失敗しました");

      setStatus(statusToSave);
      setSuccess("保存しました。");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "更新に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-black">対応操作</h2>
      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <label className="space-y-2">
          <span className="text-xs font-black text-slate-500">ステータス</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold"
          >
            {BOOK_REQUEST_STATUSES.map((value) => (
              <option key={value} value={value}>{BOOK_REQUEST_STATUS_LABELS[value]}</option>
            ))}
          </select>
        </label>
        <label className="space-y-2">
          <span className="text-xs font-black text-slate-500">管理者メモ</span>
          <textarea
            value={adminNote}
            onChange={(event) => setAdminNote(event.target.value)}
            rows={4}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold"
            placeholder="対応内容や判断理由を残してください"
          />
        </label>
      </div>
      {error && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}
      {success && <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{success}</p>}
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => save()}
          disabled={saving}
          className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-black text-white disabled:opacity-50"
        >
          保存する
        </button>
        <button
          type="button"
          onClick={() => save("posted")}
          disabled={saving}
          className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white disabled:opacity-50"
        >
          ストーリー投稿済みにする
        </button>
        <button
          type="button"
          onClick={() => save("done")}
          disabled={saving}
          className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white disabled:opacity-50"
        >
          対応済みにする
        </button>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 p-4">
        <h3 className="text-sm font-black text-slate-900">出品をリクエスト者へ通知</h3>
        <p className="mt-1 text-xs font-bold text-slate-500">
          {requesterId
            ? "タイトルで出品を検索して該当の商品を選び、リクエスト者へ「出品されました」通知を送信します。"
            : "リクエスト者IDがないため通知できません。"}
        </p>

        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                searchItems();
              }
            }}
            disabled={!requesterId}
            placeholder="本のタイトルで検索"
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold disabled:bg-slate-100"
          />
          <button
            type="button"
            onClick={() => searchItems()}
            disabled={!requesterId || searching || !query.trim()}
            className="shrink-0 rounded-xl bg-slate-900 px-5 py-3 text-sm font-black text-white disabled:opacity-50"
          >
            {searching ? "検索中..." : "検索"}
          </button>
        </div>

        {searched && results.length === 0 && !searching && (
          <p className="mt-3 text-sm font-bold text-slate-500">一致する出品が見つかりませんでした。</p>
        )}

        {results.length > 0 && (
          <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
            {results.map((item) => {
              const isSelected = selected?.id === item.id;
              const thumb = getItemImageUrl(item, "front", "thumbnail");
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelected(item)}
                  className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                    isSelected ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="h-16 w-12 shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-slate-100">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt={item.title} className="h-full w-full object-cover" loading="lazy" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-slate-900">{item.title}</p>
                    <p className="text-sm font-bold text-primary">¥{item.selling_price?.toLocaleString()}</p>
                  </div>
                  {item.status === "trading" && (
                    <span className="shrink-0 rounded-full bg-slate-700 px-2 py-1 text-[10px] font-black text-white">取引中</span>
                  )}
                  {isSelected && <span className="shrink-0 text-xs font-black text-primary">選択中</span>}
                </button>
              );
            })}
          </div>
        )}

        {notifyError && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{notifyError}</p>}
        {notifySuccess && <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{notifySuccess}</p>}

        <button
          type="button"
          onClick={notifyListing}
          disabled={notifying || !requesterId || !selected}
          className="mt-3 rounded-xl bg-primary px-5 py-3 text-sm font-black text-white disabled:opacity-50"
        >
          {notifying ? "送信中..." : selected ? `「${selected.title}」の出品を通知する` : "商品を選択してください"}
        </button>
      </div>
    </section>
  );
}
