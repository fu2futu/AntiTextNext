"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

type ActionStatus = "available" | "paused" | "deleted";

const actionLabels: Record<ActionStatus, string> = {
  available: "購入可にする",
  paused: "一時購入不可にする",
  deleted: "管理者削除（非表示）",
};

const reasonOptions = [
  { value: "reported_item", label: "通報対応" },
  { value: "prohibited_item", label: "禁止・不適切な出品" },
  { value: "duplicate", label: "重複出品" },
  { value: "inappropriate_price", label: "価格・表示の問題" },
  { value: "user_request", label: "ユーザー依頼" },
  { value: "suspicious", label: "不審な出品" },
  { value: "test_data", label: "テストデータ" },
  { value: "other", label: "その他" },
];

export default function AdminItemActions({
  itemId,
  currentStatus,
  activeTransactionCount,
  transactionCount,
}: {
  itemId: string;
  currentStatus: string;
  activeTransactionCount: number;
  transactionCount: number;
}) {
  const router = useRouter();
  const [reasonCode, setReasonCode] = useState("reported_item");
  const [note, setNote] = useState("");
  const [purgeReason, setPurgeReason] = useState("");
  const [purgeConfirm, setPurgeConfirm] = useState("");
  const [submitting, setSubmitting] = useState<ActionStatus | null>(null);
  const [purging, setPurging] = useState(false);
  const [error, setError] = useState("");

  const submit = async (status: ActionStatus) => {
    if (!note.trim()) {
      setError("管理者メモを入力してください");
      return;
    }

    if (status === "deleted" && !window.confirm("この出品を一般ユーザー画面から非表示にします。DB上の記録、画像、管理ログは保持されます。よろしいですか？")) {
      return;
    }

    if (activeTransactionCount > 0 && status !== "available" && !window.confirm("この出品には進行中の取引があります。購入者・出品者の取引画面には影響が出る可能性があります。続行しますか？")) {
      return;
    }

    setSubmitting(status);
    setError("");
    try {
      const response = await fetch("/api/admin/item-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, status, reasonCode, note }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "操作に失敗しました");
      }

      router.refresh();
    } catch (err: any) {
      setError(err.message || "操作に失敗しました");
    } finally {
      setSubmitting(null);
    }
  };

  const buttonClass = (status: ActionStatus) => {
    if (status === "deleted") return "bg-red-600 text-white hover:bg-red-700";
    if (status === "paused") return "bg-amber-500 text-white hover:bg-amber-600";
    return "bg-emerald-600 text-white hover:bg-emerald-700";
  };

  const purge = async () => {
    if (transactionCount > 0) {
      setError("関連取引履歴がある出品は完全削除できません。管理者削除（非表示）で対応してください。");
      return;
    }
    if (purgeConfirm !== "完全削除" || purgeReason.trim().length < 5) {
      setError("完全削除には確認文字と理由が必要です");
      return;
    }
    if (!window.confirm("DB関連データと画像を完全削除します。この操作は元に戻せません。続行しますか？")) return;
    if (!window.confirm("最終確認です。本当に完全削除しますか？")) return;

    setPurging(true);
    setError("");
    try {
      const response = await fetch("/api/admin/item-purge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, confirmationText: purgeConfirm, reason: purgeReason }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "完全削除に失敗しました");
      router.push("/admin/items");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "完全削除に失敗しました");
    } finally {
      setPurging(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-black text-slate-900">管理者操作</h2>
        <p className="mt-1 text-xs font-bold text-slate-500">現在の状態: {currentStatus}</p>
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-800">
          管理者削除（非表示）は物理削除ではありません。一般ユーザー画面から出品を隠し、DB上の記録・画像・通報確認用の証跡は保持します。
          R2画像の完全削除は通常運用では行いません。
        </div>
        {activeTransactionCount > 0 && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold leading-5 text-red-700">
            進行中の取引が {activeTransactionCount} 件あります。掲載停止や非表示を行う場合は、取引当事者への連絡状況も確認してください。
          </div>
        )}
        {transactionCount > 0 && (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold leading-5 text-slate-700">
            関連取引履歴が {transactionCount} 件あります。証跡保持のため、この出品は完全削除できません。
          </div>
        )}
      </div>
      <label className="mb-3 block">
        <span className="mb-1 block text-xs font-black text-slate-500">定型理由</span>
        <select
          value={reasonCode}
          onChange={(event) => setReasonCode(event.target.value)}
          className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-primary"
        >
          {reasonOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      <label className="mb-3 block">
        <span className="mb-1 block text-xs font-black text-slate-500">管理者メモ</span>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-primary"
          placeholder="通報対応、画像不適切、教材以外など"
        />
      </label>
      {error && <p className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {(["available", "paused", "deleted"] as ActionStatus[]).map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => submit(status)}
            disabled={Boolean(submitting) || currentStatus === status}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-black disabled:cursor-not-allowed disabled:opacity-40 ${buttonClass(status)}`}
          >
            {submitting === status && <Loader2 className="h-4 w-4 animate-spin" />}
            {actionLabels[status]}
          </button>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4">
        <div className="mb-3 flex items-start gap-2 text-red-800">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <h3 className="text-sm font-black">完全削除</h3>
            <p className="mt-1 text-xs font-bold leading-5">
              テストデータなど明確に不要な出品だけに使用してください。DBの出品・お気に入り・通知・通報・管理フラグ等と、R2/Supabase Storage画像を削除します。関連取引がある場合は実行できません。
            </p>
          </div>
        </div>
        <label className="mb-3 block">
          <span className="mb-1 block text-xs font-black text-red-700">完全削除理由</span>
          <textarea
            value={purgeReason}
            onChange={(event) => setPurgeReason(event.target.value)}
            rows={2}
            className="w-full rounded-xl border border-red-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-red-400"
            placeholder="例: テスト出品のため完全削除"
          />
        </label>
        <label className="mb-3 block">
          <span className="mb-1 block text-xs font-black text-red-700">確認文字</span>
          <input
            value={purgeConfirm}
            onChange={(event) => setPurgeConfirm(event.target.value)}
            className="w-full rounded-xl border border-red-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-red-400"
            placeholder="完全削除"
          />
        </label>
        <button
          type="button"
          onClick={purge}
          disabled={purging || transactionCount > 0}
          className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-3 text-sm font-black text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {purging && <Loader2 className="h-4 w-4 animate-spin" />}
          完全削除を実行
        </button>
      </div>
    </section>
  );
}
