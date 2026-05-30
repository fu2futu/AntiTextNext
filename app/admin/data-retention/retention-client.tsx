"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Loader2, Play, RotateCw, Save } from "lucide-react";

type RetentionSetting = {
  id: string;
  label: string;
  retention_days: number;
  enabled: boolean;
  description?: string | null;
};

type RetentionPreview = {
  setting_id: string;
  label: string;
  retention_days: number;
  enabled: boolean;
  matched_count: number;
  action_summary: string;
};

export default function DataRetentionClient({
  settings,
  preview,
}: {
  settings: RetentionSetting[];
  preview: RetentionPreview[];
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState(() =>
    Object.fromEntries(settings.map((setting) => [
      setting.id,
      { days: String(setting.retention_days), enabled: setting.enabled },
    ]))
  );
  const [savingId, setSavingId] = useState<string | null>(null);
  const [running, setRunning] = useState<"dry" | "run" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const previewMap = useMemo(
    () => new Map(preview.map((row) => [row.setting_id, row])),
    [preview]
  );

  const updateSetting = async (settingId: string) => {
    const draft = drafts[settingId];
    const days = Number(draft?.days);
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      setError("保存期間は1日以上3650日以下で指定してください");
      return;
    }

    setSavingId(settingId);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/data-retention", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_setting",
          settingId,
          retentionDays: days,
          enabled: Boolean(draft?.enabled),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "保存期間設定の更新に失敗しました");
      setMessage("保存期間設定を更新しました");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "保存期間設定の更新に失敗しました");
    } finally {
      setSavingId(null);
    }
  };

  const runRetention = async (dryRun: boolean) => {
    if (!dryRun && !window.confirm("期限切れデータの削除・匿名化を実行します。この操作は元に戻せません。続行しますか？")) {
      return;
    }

    setRunning(dryRun ? "dry" : "run");
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/data-retention", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run", dryRun }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "保存期間処理に失敗しました");
      setMessage(dryRun ? `プレビューを取得しました: ${JSON.stringify(payload.result)}` : `保存期間処理を実行しました: ${JSON.stringify(payload.result)}`);
      router.refresh();
    } catch (err: any) {
      setError(err.message || "保存期間処理に失敗しました");
    } finally {
      setRunning(null);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-900">保存期間設定</h2>
          <p className="mt-1 text-sm font-bold text-slate-500">日数を変更すると、次回の自動実行・手動実行に反映されます。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => runRetention(true)}
            disabled={Boolean(running)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {running === "dry" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
            プレビュー
          </button>
          <button
            type="button"
            onClick={() => runRetention(false)}
            disabled={Boolean(running)}
            className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-black text-white hover:bg-red-800 disabled:opacity-50"
          >
            {running === "run" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            期限切れを処理
          </button>
        </div>
      </div>

      {error && <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}
      {message && <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{message}</p>}

      <div className="overflow-hidden rounded-2xl border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">対象</th>
              <th className="px-4 py-3">保存期間</th>
              <th className="px-4 py-3">有効</th>
              <th className="px-4 py-3">対象件数</th>
              <th className="px-4 py-3">処理内容</th>
              <th className="px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {settings.map((setting) => {
              const row = previewMap.get(setting.id);
              const draft = drafts[setting.id] ?? { days: String(setting.retention_days), enabled: setting.enabled };
              return (
                <tr key={setting.id} className="align-top">
                  <td className="px-4 py-3">
                    <p className="font-black text-slate-900">{setting.label}</p>
                    <p className="mt-1 max-w-xs text-xs font-bold leading-5 text-slate-500">{setting.description}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <input
                        value={draft.days}
                        onChange={(event) => setDrafts((current) => ({
                          ...current,
                          [setting.id]: { ...draft, days: event.target.value },
                        }))}
                        inputMode="numeric"
                        className="w-24 rounded-xl border border-slate-200 px-3 py-2 text-sm font-black outline-none focus:border-primary"
                      />
                      <span className="text-xs font-black text-slate-500">日</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <label className="inline-flex items-center gap-2 text-xs font-black text-slate-700">
                      <input
                        type="checkbox"
                        checked={draft.enabled}
                        onChange={(event) => setDrafts((current) => ({
                          ...current,
                          [setting.id]: { ...draft, enabled: event.target.checked },
                        }))}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      有効
                    </label>
                  </td>
                  <td className="px-4 py-3 font-black text-slate-900">{row?.matched_count ?? 0}</td>
                  <td className="px-4 py-3 text-xs font-bold leading-5 text-slate-600">{row?.action_summary ?? "-"}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => updateSetting(setting.id)}
                      disabled={savingId === setting.id}
                      className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-black text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                      {savingId === setting.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      保存
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
