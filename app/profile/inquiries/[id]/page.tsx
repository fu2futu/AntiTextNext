import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { ArrowLeft, Inbox } from "lucide-react";
import InquiryReplyForm from "./reply-form";

export const dynamic = "force-dynamic";

const categoryLabels: Record<string, string> = {
  bug: "不具合・バグ報告",
  report: "通報",
  feature: "改善要望",
  account: "アカウント",
  other: "その他",
};

const statusLabels: Record<string, string> = {
  open: "未対応",
  checking: "確認中",
  replied: "返信済み",
  completed: "対応完了",
  no_action: "対応不要",
};

const formatInquiryDate = (value?: string | null) => {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
};

export default async function ProfileInquiryDetailPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: inquiry } = await (supabase as any)
    .from("inquiries")
    .select("*")
    .eq("id", params.id)
    .eq("sender_user_id", user.id)
    .single();

  if (!inquiry) notFound();

  const { data: messages } = await (supabase as any)
    .from("inquiry_messages")
    .select("*")
    .eq("inquiry_id", inquiry.id)
    .order("created_at", { ascending: true });

  const threadMessages = ((messages ?? []) as any[]).length > 0
    ? (messages ?? []) as any[]
    : [{
        id: "initial",
        sender_role: "user",
        message: inquiry.content,
        created_at: inquiry.created_at,
      }];

  return (
    <div className="min-h-screen bg-white pb-28">
      <header className="bg-white px-5 pt-7 pb-5 rounded-b-[32px] shadow-sm">
        <div className="flex items-center gap-4">
          <Link href="/profile/inquiries" className="rounded-full p-2 -ml-2 hover:bg-gray-100">
            <ArrowLeft className="h-6 w-6 text-gray-600" />
          </Link>
          <h1 className="text-2xl font-black text-gray-900">お問い合わせ詳細</h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-6 py-8">
        <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/5">
              <Inbox className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-gray-100 px-2 py-1 text-[11px] font-black text-gray-600">
                  {categoryLabels[inquiry.category] ?? inquiry.category}
                </span>
                <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-black text-primary">
                  {statusLabels[inquiry.status] ?? inquiry.status}
                </span>
              </div>
              <p className="text-xs font-bold text-gray-400">
                送信: {formatInquiryDate(inquiry.created_at)}
              </p>
              <p className="mt-1 text-xs font-bold text-gray-400">
                更新: {formatInquiryDate(inquiry.updated_at || inquiry.created_at)}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-black text-gray-900">やりとり</h2>
          <div className="space-y-4">
            {threadMessages.map((message: any) => {
              const isAdmin = message.sender_role === "admin";
              return (
                <div key={message.id} className={`flex ${isAdmin ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[86%] rounded-2xl px-4 py-3 ${isAdmin ? "bg-blue-50 text-blue-950" : "bg-gray-100 text-gray-900"}`}>
                    <p className="mb-1 text-[11px] font-black opacity-70">
                      {isAdmin ? "運営" : "あなた"} / {formatInquiryDate(message.created_at)}
                    </p>
                    <p className="whitespace-pre-wrap break-words text-sm font-bold leading-6">{message.message}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <InquiryReplyForm inquiryId={inquiry.id} />
      </main>
    </div>
  );
}
