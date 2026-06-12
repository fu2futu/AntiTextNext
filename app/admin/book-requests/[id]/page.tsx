import Link from "next/link";
import { AdminPageHeader } from "../../_components/admin-shell";
import { AdminUserLink } from "../../_components/admin-user-link";
import { formatAdminDate, requireAdmin } from "@/lib/admin-utils";
import BookRequestActions from "./book-request-actions";
import { statusLabel, statusTone } from "../status";

export const dynamic = "force-dynamic";

export default async function AdminBookRequestDetailPage({ params }: { params: { id: string } }) {
  const { supabase } = await requireAdmin();
  const { data: request, error } = await (supabase as any)
    .from("book_requests")
    .select("*")
    .eq("id", params.id)
    .single();

  const { data: logs } = await (supabase as any)
    .from("admin_action_logs")
    .select("*")
    .eq("target_type", "book_request")
    .eq("target_id", params.id)
    .order("created_at", { ascending: false })
    .limit(30);

  const { data: requesterProfile } = request?.requester_id
    ? await supabase.from("profiles").select("user_id,nickname").eq("user_id", request.requester_id).single()
    : { data: null };

  return (
    <>
      <AdminPageHeader title="本リクエスト詳細" description="リクエスト内容と対応状態、管理者メモを確認できます。" />
      <main className="space-y-6 p-6">
        <Link href="/admin/book-requests" className="inline-flex rounded-xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-700 hover:border-slate-300">
          一覧へ戻る
        </Link>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error.message}</div>}

        {request && (
          <>
            <BookRequestActions
              requestId={request.id}
              initialStatus={request.status}
              initialAdminNote={request.admin_note}
              requesterId={request.requester_id}
              bookTitle={request.book_title}
            />

            <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2">
              <Field label="リクエストID" value={request.id} />
              <Field label="状態" value={<span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${statusTone(request.status)}`}>{statusLabel(request.status)}</span>} />
              <Field label="本のタイトル" value={request.book_title} />
              <Field label="著者・出版社" value={request.author || "-"} />
              <Field label="授業名・教科" value={request.course_name || "-"} />
              <Field label="リクエスト者" value={<AdminUserLink id={request.requester_id} name={(requesterProfile as any)?.nickname || request.requester_name} />} />
              <Field label="担当者" value={<AdminUserLink id={request.assignee_id} />} />
              <Field label="作成/更新" value={`${formatAdminDate(request.created_at)} / ${formatAdminDate(request.updated_at)}`} />
              <Field className="md:col-span-2" label="管理者メモ" value={request.admin_note || "-"} />
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-black">対応履歴</h2>
              {((logs ?? []) as any[]).length === 0 ? (
                <p className="text-sm font-bold text-slate-500">対応履歴はまだありません。</p>
              ) : (
                <div className="space-y-3">
                  {((logs ?? []) as any[]).map((log) => (
                    <div key={log.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-black">{log.action_type}</p>
                        <p className="text-xs font-bold text-slate-500">{formatAdminDate(log.created_at)}</p>
                      </div>
                      {log.reason && <p className="mt-2 whitespace-pre-wrap text-sm font-bold text-slate-700">{log.reason}</p>}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </>
  );
}

function Field({ label, value, className = "" }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="mb-1 text-xs font-black text-slate-500">{label}</p>
      <div className="whitespace-pre-wrap break-words text-sm font-bold text-slate-900">{value}</div>
    </div>
  );
}
