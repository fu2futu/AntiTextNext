import Link from "next/link";
import { AdminPageHeader, StatusBadge } from "../../_components/admin-shell";
import { AdminUserLink } from "../../_components/admin-user-link";
import { formatAdminDate, maskEmail, requireAdmin } from "@/lib/admin-utils";
import InquiryActions from "./inquiry-actions";

export const dynamic = "force-dynamic";

export default async function AdminInquiryDetailPage({ params }: { params: { id: string } }) {
  const { supabase } = await requireAdmin();
  const { data: inquiry, error } = await (supabase as any)
    .from("inquiries")
    .select("*")
    .eq("id", params.id)
    .single();

  const { data: logs } = await (supabase as any)
    .from("admin_action_logs")
    .select("*")
    .eq("target_type", "inquiry")
    .eq("target_id", params.id)
    .order("created_at", { ascending: false })
    .limit(30);

  const { data: messages } = await (supabase as any)
    .from("inquiry_messages")
    .select("*")
    .eq("inquiry_id", params.id)
    .order("created_at", { ascending: true });

  const { data: senderProfile } = inquiry?.sender_user_id
    ? await supabase.from("profiles").select("user_id,nickname").eq("user_id", inquiry.sender_user_id).single()
    : { data: null };

  if (inquiry?.has_unread_user_message) {
    await (supabase as any)
      .from("inquiries")
      .update({ has_unread_user_message: false })
      .eq("id", params.id);
  }

  return (
    <>
      <AdminPageHeader title="問い合わせ詳細" description="内容全文、対応状態、管理者メモを確認できます。" />
      <main className="space-y-6 p-6">
        <Link href="/admin/inquiries" className="inline-flex rounded-xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-700 hover:border-slate-300">
          問い合わせ一覧へ戻る
        </Link>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error.message}</div>}

        {inquiry && (
          <>
            <InquiryActions
              inquiryId={inquiry.id}
              initialStatus={inquiry.status}
              initialAdminNote={inquiry.admin_note}
              senderUserId={inquiry.sender_user_id}
            />

            <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2">
              <Field label="問い合わせID" value={inquiry.id} />
              <Field label="状態" value={<StatusBadge value={inquiry.status} />} />
              <Field label="送信者" value={inquiry.sender_name || "-"} />
              <Field label="送信者ユーザー" value={<AdminUserLink id={inquiry.sender_user_id} name={(senderProfile as any)?.nickname || inquiry.sender_name} />} />
              <Field
                label={inquiry.sender_user_id ? "メールアドレス" : "返信先メールアドレス"}
                value={
                  inquiry.sender_user_id ? (
                    maskEmail(inquiry.email)
                  ) : inquiry.email ? (
                    <a className="text-primary hover:underline" href={`mailto:${inquiry.email}`}>
                      {inquiry.email}
                    </a>
                  ) : (
                    "-"
                  )
                }
              />
              <Field label="種別" value={inquiry.category} />
              <Field label="担当者" value={inquiry.assignee_id || "-"} />
              <Field label="作成/更新" value={`${formatAdminDate(inquiry.created_at)} / ${formatAdminDate(inquiry.updated_at)}`} />
              <Field className="md:col-span-2" label="問い合わせ内容" value={inquiry.content} />
              <Field className="md:col-span-2" label="管理者メモ" value={inquiry.admin_note || "-"} />
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-black">ユーザーとのやりとり</h2>
              {((messages ?? []) as any[]).length === 0 ? (
                <div className="flex justify-end">
                  <div className="max-w-[86%] rounded-2xl bg-slate-100 px-4 py-3 text-slate-900">
                    <p className="mb-1 text-[11px] font-black text-slate-500">ユーザー / {formatAdminDate(inquiry.created_at)}</p>
                    <p className="whitespace-pre-wrap break-words text-sm font-bold leading-6">{inquiry.content}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {((messages ?? []) as any[]).map((message) => {
                    const isAdmin = message.sender_role === "admin";
                    return (
                    <div key={message.id} className={`flex ${isAdmin ? "justify-start" : "justify-end"}`}>
                      <div className={`max-w-[86%] rounded-2xl px-4 py-3 ${isAdmin ? "bg-blue-50 text-blue-950" : "bg-slate-100 text-slate-900"}`}>
                        <p className="mb-1 text-[11px] font-black opacity-70">
                          {isAdmin ? "運営" : "ユーザー"} / {formatAdminDate(message.created_at)}
                        </p>
                        <p className="whitespace-pre-wrap break-words text-sm font-bold leading-6">{message.message}</p>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
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
