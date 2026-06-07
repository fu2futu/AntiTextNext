"use client";

import Image from "next/image";
import { Loader2, Search, MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type DemoBuyer = {
  user_id: string;
  nickname?: string | null;
  avatar_url?: string | null;
  department?: string | null;
  degree?: string | null;
  grade?: string | null;
  major?: string | null;
};

const defaultTimeSlots = ["2026-06-10_lunch", "2026-06-11_56period"];
const defaultLocations = ["library", "taki_plaza"];

export default function DemoTransactionForm({ itemId, itemTitle }: { itemId: string; itemTitle: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<DemoBuyer[]>([]);
  const [selectedBuyer, setSelectedBuyer] = useState<DemoBuyer | null>(null);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const selectedLabel = useMemo(() => {
    if (!selectedBuyer) return "";
    return [selectedBuyer.department, selectedBuyer.degree, selectedBuyer.grade ? `${selectedBuyer.grade}年` : null, selectedBuyer.major]
      .filter(Boolean)
      .join(" / ");
  }, [selectedBuyer]);

  const searchUsers = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/demo-transactions?q=${encodeURIComponent(q)}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "検索に失敗しました");
      setUsers(payload.users || []);
    } catch (err: any) {
      setError(err.message || "検索に失敗しました");
    } finally {
      setSearching(false);
    }
  };

  const createTransaction = async () => {
    if (!selectedBuyer || creating) return;
    setCreating(true);
    setError("");
    try {
      const response = await fetch("/api/admin/demo-transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId,
          buyerId: selectedBuyer.user_id,
          paymentMethod: "other",
          timeSlots: defaultTimeSlots,
          locations: defaultLocations,
          autoMessage: `[デモ] ${selectedBuyer.nickname || "購入者"}さんから「${itemTitle}」への購入リクエストが届きました。\n\n受け渡し日時や場所をチャットで相談してください。`,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "デモ取引を作成できませんでした");
      router.push(`/chat/${itemId}?tx=${payload.transactionId}`);
    } catch (err: any) {
      setError(err.message || "デモ取引を作成できませんでした");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 font-black text-emerald-900">
        <MessageCircle className="h-4 w-4" />
        デモ購入者を選んでチャットを開始
      </div>
      <p className="mb-3 text-xs font-bold leading-relaxed text-emerald-700">
        デモ出品のsellerは現在の管理者です。購入者は既存ユーザーから検索して選択します。
      </p>

      <div className="flex gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              searchUsers();
            }
          }}
          placeholder="ニックネーム・学院・IDで検索"
          className="min-w-0 flex-1 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-300"
        />
        <button
          type="button"
          onClick={searchUsers}
          disabled={searching || !query.trim()}
          className="rounded-xl bg-emerald-700 px-3 py-2 text-sm font-black text-white disabled:opacity-40"
        >
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </button>
      </div>

      {users.length > 0 && (
        <div className="mt-3 max-h-48 overflow-y-auto rounded-xl border border-emerald-100 bg-white">
          {users.map((candidate) => (
            <button
              key={candidate.user_id}
              type="button"
              onClick={() => setSelectedBuyer(candidate)}
              className={`flex w-full items-center gap-3 px-3 py-2 text-left transition ${selectedBuyer?.user_id === candidate.user_id ? "bg-emerald-100" : "hover:bg-slate-50"}`}
            >
              <Avatar src={candidate.avatar_url} alt={candidate.nickname || "ユーザー"} />
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-slate-900">{candidate.nickname || "名称未設定"}</p>
                <p className="truncate text-[11px] font-bold text-slate-500">
                  {[candidate.department, candidate.degree, candidate.grade ? `${candidate.grade}年` : null, candidate.major].filter(Boolean).join(" / ") || candidate.user_id}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {selectedBuyer && (
        <div className="mt-3 rounded-xl bg-white p-3">
          <p className="text-[11px] font-black text-slate-400">選択中の購入者</p>
          <div className="mt-2 flex items-center gap-3">
            <Avatar src={selectedBuyer.avatar_url} alt={selectedBuyer.nickname || "ユーザー"} />
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-900">{selectedBuyer.nickname || "名称未設定"}</p>
              {selectedLabel && <p className="truncate text-xs font-bold text-slate-500">{selectedLabel}</p>}
            </div>
          </div>
        </div>
      )}

      {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error}</p>}

      <button
        type="button"
        onClick={createTransaction}
        disabled={!selectedBuyer || creating}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-black text-white shadow-sm transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
        デモチャットを開始
      </button>
    </div>
  );
}

function Avatar({ src, alt }: { src?: string | null; alt: string }) {
  const safeSrc = src && (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("/")) ? src : "";
  if (!safeSrc) return <div className="h-9 w-9 flex-shrink-0 rounded-full bg-slate-200" />;
  return <Image src={safeSrc} alt={alt} width={36} height={36} className="h-9 w-9 flex-shrink-0 rounded-full object-cover" />;
}
