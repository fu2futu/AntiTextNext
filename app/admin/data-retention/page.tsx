import { AdminPageHeader } from "../_components/admin-shell";
import { formatAdminDate, requireAdmin } from "@/lib/admin-utils";
import DataRetentionClient from "./retention-client";

export const dynamic = "force-dynamic";

export default async function AdminDataRetentionPage() {
  const { supabase } = await requireAdmin();
  const [{ data: settings, error: settingsError }, { data: preview, error: previewError }] = await Promise.all([
    (supabase as any)
      .from("data_retention_settings")
      .select("id,label,retention_days,enabled,description,updated_at")
      .order("id", { ascending: true }),
    (supabase as any).rpc("admin_get_data_retention_preview"),
  ]);

  return (
    <>
      <AdminPageHeader
        title="保存期間管理"
        description="個人情報・チャット・アクセスログの保存期間を管理します。実行前に必ずプレビュー件数を確認してください。"
      />
      <main className="space-y-6 p-6">
        {(settingsError || previewError) && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            {settingsError?.message || previewError?.message}
          </div>
        )}

        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-bold leading-7 text-amber-900">
          <p>
            初期方針は、アカウント情報・評価情報は退会後1年、取引チャットは取引終了後1か月、通報・違反対応記録は対応終了後1年、アクセスログは取得後1か月です。
          </p>
          <p className="mt-2">
            取引や通報の整合性を壊さないため、退会済みアカウントはまずプロフィールを匿名化します。Supabase Auth上のユーザー物理削除は、外部キー設計の確認後に別段階で扱います。
          </p>
        </section>

        <DataRetentionClient
          settings={(settings ?? []) as any[]}
          preview={(preview ?? []) as any[]}
        />

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black text-slate-900">補足</h2>
          <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
            {((settings ?? []) as any[]).map((setting) => (
              <div key={setting.id} className="rounded-xl bg-slate-50 p-4">
                <dt className="font-black text-slate-800">{setting.label}</dt>
                <dd className="mt-1 text-xs font-bold leading-5 text-slate-500">{setting.description || "-"}</dd>
                <dd className="mt-2 text-xs font-bold text-slate-400">最終更新: {formatAdminDate(setting.updated_at)}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>
    </>
  );
}
