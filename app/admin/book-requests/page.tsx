import Link from "next/link";
import { AdminPageHeader } from "../_components/admin-shell";
import { AdminUserLink } from "../_components/admin-user-link";
import { formatAdminDate, getStringParam, requireAdmin, type AdminSearchParams } from "@/lib/admin-utils";
import { statusLabel, statusTone } from "./status";

export const dynamic = "force-dynamic";

export default async function AdminBookRequestsPage({ searchParams }: { searchParams: AdminSearchParams }) {
  const { supabase } = await requireAdmin();
  const status = getStringParam(searchParams, "status");
  let query = (supabase as any).from("book_requests").select("*").order("updated_at", { ascending: false }).limit(200);
  if (status === "unresolved") {
    query = query.neq("status", "done").neq("status", "no_action");
  } else if (status) {
    query = query.eq("status", status);
  }
  const { data, error } = await query;
  const userIds = Array.from(
    new Set(((data ?? []) as any[]).flatMap((req) => [req.requester_id, req.assignee_id]).filter(Boolean))
  );
  const { data: profiles } = userIds.length ? await supabase.from("profiles").select("user_id,nickname").in("user_id", userIds) : { data: [] };
  const profileMap = new Map(((profiles ?? []) as any[]).map((profile) => [profile.user_id, profile.nickname]));

  return (
    <>
      <AdminPageHeader title="本リクエスト管理" description="ユーザーから届いた欲しい本のリクエスト。ステータスを切り替えてストーリー作成・対応状況を管理します。" />
      <main className="space-y-5 p-6">
        <form className="rounded-2xl border border-slate-200 bg-white p-4">
          <select name="status" defaultValue={status} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold">
            <option value="">すべて</option>
            <option value="unresolved">未対応（対応済み・対応不要以外）</option>
            <option value="open">未対応</option>
            <option value="posted">ストーリー投稿済み</option>
            <option value="done">対応済み</option>
            <option value="no_action">対応不要</option>
          </select>
          <button className="ml-3 rounded-xl bg-slate-900 px-5 py-3 text-sm font-black text-white">絞り込み</button>
        </form>
        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error.message}</div>}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
              <tr>{["ID", "送信日時", "リクエスト者", "本のタイトル", "著者・出版社", "授業名・教科", "状態", "担当者", "最終更新"].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {((data ?? []) as any[]).map((req) => (
                <tr key={req.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs font-black">
                    <Link className="text-primary hover:underline" href={`/admin/book-requests/${req.id}`}>{req.id.slice(0, 8)}</Link>
                  </td>
                  <td className="px-4 py-3 font-bold">{formatAdminDate(req.created_at)}</td>
                  <td className="px-4 py-3 font-bold">
                    {req.requester_id ? <AdminUserLink id={req.requester_id} name={profileMap.get(req.requester_id) as string | undefined} /> : req.requester_name || "-"}
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 font-bold">
                    <Link className="hover:text-primary hover:underline" href={`/admin/book-requests/${req.id}`}>{req.book_title}</Link>
                  </td>
                  <td className="px-4 py-3 font-bold">{req.author || "-"}</td>
                  <td className="px-4 py-3 font-bold">{req.course_name || "-"}</td>
                  <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${statusTone(req.status)}`}>{statusLabel(req.status)}</span></td>
                  <td className="px-4 py-3 font-bold"><AdminUserLink id={req.assignee_id} name={profileMap.get(req.assignee_id) as string | undefined} /></td>
                  <td className="px-4 py-3 font-bold">{formatAdminDate(req.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
