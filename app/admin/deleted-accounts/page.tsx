import { AdminPageHeader } from "../_components/admin-shell";
import { formatAdminDate, requireAdmin } from "@/lib/admin-utils";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export default async function AdminDeletedAccountsPage() {
  const { supabase } = await requireAdmin();

  const { data: accounts, error } = await (supabase as any)
    .from("deleted_accounts")
    .select("*")
    .order("deleted_at", { ascending: false })
    .limit(200);

  const userIds = ((accounts ?? []) as any[]).map((account) => account.original_user_id);

  const [
    { data: itemSnapshots },
    { data: transactionSnapshots },
    { data: storageErrors },
    { data: inquiries },
    { data: reports },
    { data: restrictions },
    { data: adminLogs },
    { data: deletionIssues },
    { data: emailBans },
  ] = await Promise.all([
    userIds.length
      ? (supabase as any)
          .from("deleted_account_item_snapshots")
          .select("original_user_id,item_id,title,price,status,deleted_at")
          .in("original_user_id", userIds)
          .order("deleted_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    userIds.length
      ? (supabase as any)
          .from("deleted_account_transaction_snapshots")
          .select("original_user_id,transaction_id,item_id,status,created_at,completed_at")
          .in("original_user_id", userIds)
          .order("deleted_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    userIds.length
      ? (supabase as any)
          .from("account_deletion_storage_errors")
          .select("user_id,storage_provider,object_path,error_message,created_at")
          .in("user_id", userIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    userIds.length
      ? (supabase as any)
          .from("inquiries")
          .select("id,sender_user_id,category,status,created_at,updated_at")
          .in("sender_user_id", userIds)
          .order("updated_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    userIds.length
      ? (supabase as any)
          .from("reports")
          .select("id,reporter_id,reported_user_id,item_id,transaction_id,reason,status,created_at,updated_at")
          .or(buildUserOrFilter(["reporter_id", "reported_user_id"], userIds))
          .order("updated_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    userIds.length
      ? (supabase as any)
          .from("user_restrictions")
          .select("id,user_id,restriction_type,reason,starts_at,ends_at,lifted_at,created_at")
          .in("user_id", userIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    userIds.length
      ? (supabase as any)
          .from("admin_action_logs")
          .select("id,admin_user_id,action_type,target_type,target_id,reason,created_at")
          .or(buildUserOrFilter(["target_id", "admin_user_id"], userIds))
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    userIds.length
      ? (supabase as any)
          .from("account_deletion_issues")
          .select("id,user_id,issue_type,severity,message,resolved_at,created_at")
          .in("user_id", userIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    (supabase as any)
      .from("account_email_bans")
      .select("id,email_hash,reason,expires_at,lifted_at,created_at")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const itemMap = groupByUser(itemSnapshots ?? [], "original_user_id");
  const transactionMap = groupByUser(transactionSnapshots ?? [], "original_user_id");
  const errorMap = groupByUser(storageErrors ?? [], "user_id");
  const inquiryMap = groupByUser(inquiries ?? [], "sender_user_id");
  const reportMap = groupReportsByUser(reports ?? [], userIds);
  const restrictionMap = groupByUser(restrictions ?? [], "user_id");
  const adminLogMap = groupAdminLogsByUser(adminLogs ?? [], userIds);
  const deletionIssueMap = groupByUser(deletionIssues ?? [], "user_id");
  const unresolvedIssueCount = ((deletionIssues ?? []) as any[]).filter((issue) => !issue.resolved_at).length;

  return (
    <>
      <AdminPageHeader
        title="削除済みアカウント"
        description="ユーザー削除後に保持している最低限の運営対応用ログです。メールアドレスはハッシュのみ保存しています。"
      />
      <main className="space-y-5 p-6">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            {error.message}
          </div>
        )}

        {unresolvedIssueCount > 0 && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            未解決のアカウント削除関連問題が {unresolvedIssueCount} 件あります。該当ユーザーの「削除処理の問題」を確認してください。
          </div>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-black text-slate-900">再登録ブロック中のメールハッシュ</h2>
          <p className="mt-1 text-xs font-bold text-slate-500">
            大学メールでも、このリストにあるメールハッシュは新規登録できません。メールアドレス本文は保存しません。
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {((emailBans ?? []) as any[]).length === 0 ? (
              <p className="text-xs font-bold text-slate-400">登録ブロック中のメールハッシュはありません。</p>
            ) : (
              ((emailBans ?? []) as any[]).map((ban) => (
                <div key={ban.id} className="rounded-xl bg-slate-50 p-3 text-xs">
                  <p className="truncate font-mono font-black text-slate-700">{ban.email_hash}</p>
                  <p className="mt-1 font-bold text-slate-500">{ban.lifted_at ? "解除済み" : "有効"} / {ban.reason}</p>
                  <p className="text-slate-400">作成: {formatAdminDate(ban.created_at)}</p>
                  {ban.expires_at && <p className="text-slate-400">期限: {formatAdminDate(ban.expires_at)}</p>}
                </div>
              ))
            )}
          </div>
        </section>

        {((accounts ?? []) as any[]).length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm font-bold text-slate-500">
            削除済みアカウントはありません。
          </div>
        ) : (
          ((accounts ?? []) as any[]).map((account) => {
            const items = itemMap.get(account.original_user_id) ?? [];
            const transactions = transactionMap.get(account.original_user_id) ?? [];
            const errors = errorMap.get(account.original_user_id) ?? [];
            const userInquiries = inquiryMap.get(account.original_user_id) ?? [];
            const userReports = reportMap.get(account.original_user_id) ?? [];
            const userRestrictions = restrictionMap.get(account.original_user_id) ?? [];
            const userAdminLogs = adminLogMap.get(account.original_user_id) ?? [];
            const userDeletionIssues = deletionIssueMap.get(account.original_user_id) ?? [];

            return (
              <section key={account.original_user_id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="font-mono text-sm font-black text-slate-900">{account.original_user_id}</h2>
                      <p className="mt-1 font-mono text-xs font-bold text-slate-500">email_hash: {account.email_hash}</p>
                    </div>
                    <div className="text-right text-xs font-bold text-slate-500">
                      <p>削除: {formatAdminDate(account.deleted_at)}</p>
                      <p>保持期限: {formatAdminDate(account.retention_until)}</p>
                    </div>
                  </div>
                  {account.deletion_reason && <p className="mt-3 text-sm font-bold text-slate-600">理由: {account.deletion_reason}</p>}
                </div>

                <div className="grid gap-4 p-5 lg:grid-cols-3">
                  <SnapshotPanel title="商品控え" rows={items} empty="商品控えはありません" render={(row) => (
                    <>
                      <p className="truncate font-black">{row.title}</p>
                      <p className="font-mono text-xs text-slate-500">{row.item_id}</p>
                      <p className="text-xs font-bold text-slate-500">¥{Number(row.price ?? 0).toLocaleString()} / {row.status}</p>
                    </>
                  )} />
                  <SnapshotPanel title="取引控え" rows={transactions} empty="取引控えはありません" render={(row) => (
                    <>
                      <p className="font-mono text-xs font-black">{row.transaction_id}</p>
                      <p className="text-xs font-bold text-slate-500">{row.status} / {formatAdminDate(row.created_at)}</p>
                    </>
                  )} />
                  <SnapshotPanel title="画像削除エラー" rows={errors} empty="画像削除エラーはありません" render={(row) => (
                    <>
                      <p className="text-xs font-black text-red-700">{row.storage_provider}: {row.error_message}</p>
                      <p className="truncate font-mono text-xs text-slate-500">{row.object_path}</p>
                    </>
                  )} />
                  <SnapshotPanel title="削除処理の問題" rows={userDeletionIssues} empty="削除処理の問題はありません" render={(row) => (
                    <>
                      <p className={`text-xs font-black ${row.resolved_at ? "text-slate-500" : "text-red-700"}`}>
                        {row.severity}: {row.issue_type}
                      </p>
                      <p className="line-clamp-2 text-xs text-slate-500">{row.message}</p>
                      <p className="text-xs text-slate-400">{row.resolved_at ? `解決: ${formatAdminDate(row.resolved_at)}` : `未解決 / ${formatAdminDate(row.created_at)}`}</p>
                    </>
                  )} />
                </div>

                <div className="grid gap-4 border-t border-slate-100 p-5 lg:grid-cols-4">
                  <SnapshotPanel title="問い合わせ履歴" rows={userInquiries} empty="問い合わせ履歴はありません" render={(row) => (
                    <>
                      <p className="font-mono text-xs font-black">{row.id}</p>
                      <p className="text-xs font-bold text-slate-500">{row.category} / {row.status}</p>
                      <p className="text-xs text-slate-400">{formatAdminDate(row.updated_at ?? row.created_at)}</p>
                    </>
                  )} />
                  <SnapshotPanel title="通報関連" rows={userReports} empty="通報関連はありません" render={(row) => (
                    <>
                      <p className="font-mono text-xs font-black">{row.id}</p>
                      <p className="text-xs font-bold text-slate-500">{row.reason} / {row.status}</p>
                      <p className="text-xs text-slate-400">{formatAdminDate(row.updated_at ?? row.created_at)}</p>
                    </>
                  )} />
                  <SnapshotPanel title="利用制限ログ" rows={userRestrictions} empty="利用制限ログはありません" render={(row) => (
                    <>
                      <p className="text-xs font-black">{row.restriction_type}</p>
                      <p className="line-clamp-2 text-xs text-slate-500">{row.reason}</p>
                      <p className="text-xs text-slate-400">{formatAdminDate(row.created_at)}</p>
                    </>
                  )} />
                  <SnapshotPanel title="運営対応ログ" rows={userAdminLogs} empty="運営対応ログはありません" render={(row) => (
                    <>
                      <p className="text-xs font-black">{row.action_type}</p>
                      <p className="font-mono text-xs text-slate-500">{row.target_type}: {row.target_id}</p>
                      <p className="text-xs text-slate-400">{formatAdminDate(row.created_at)}</p>
                    </>
                  )} />
                </div>
              </section>
            );
          })
        )}
      </main>
    </>
  );
}

function buildUserOrFilter(columns: string[], userIds: string[]) {
  return userIds.flatMap((userId) => columns.map((column) => `${column}.eq.${userId}`)).join(",");
}

function groupByUser(rows: any[], key: string) {
  return rows.reduce<Map<string, any[]>>((map, row) => {
    const value = row[key];
    if (!value) return map;
    const current = map.get(value) ?? [];
    current.push(row);
    map.set(value, current);
    return map;
  }, new Map());
}

function groupReportsByUser(rows: any[], userIds: string[]) {
  const map = new Map<string, any[]>();
  for (const row of rows) {
    for (const userId of userIds) {
      if (row.reporter_id !== userId && row.reported_user_id !== userId) continue;
      const current = map.get(userId) ?? [];
      current.push(row);
      map.set(userId, current);
    }
  }
  return map;
}

function groupAdminLogsByUser(rows: any[], userIds: string[]) {
  const map = new Map<string, any[]>();
  for (const row of rows) {
    for (const userId of userIds) {
      if (row.target_id !== userId && row.admin_user_id !== userId) continue;
      const current = map.get(userId) ?? [];
      current.push(row);
      map.set(userId, current);
    }
  }
  return map;
}

function SnapshotPanel({
  title,
  rows,
  empty,
  render,
}: {
  title: string;
  rows: any[];
  empty: string;
  render: (row: any) => ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200">
      <div className="border-b border-slate-100 px-4 py-3 text-sm font-black">{title}</div>
      <div className="max-h-72 space-y-2 overflow-y-auto p-3">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-xs font-bold text-slate-400">{empty}</p>
        ) : (
          rows.map((row, index) => (
            <div key={row.id ?? row.item_id ?? row.transaction_id ?? `${title}-${index}`} className="rounded-lg bg-slate-50 p-3 text-sm">
              {render(row)}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
