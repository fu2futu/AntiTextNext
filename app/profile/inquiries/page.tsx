import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { ArrowLeft, ChevronRight, Inbox } from "lucide-react";

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

export default async function ProfileInquiriesPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: inquiries } = await (supabase as any)
    .from("inquiries")
    .select("id,category,content,status,created_at,updated_at")
    .eq("sender_user_id", user.id)
    .order("updated_at", { ascending: false });

  return (
    <div className="min-h-screen bg-white pb-28">
      <header className="bg-white px-6 pt-10 pb-8 rounded-b-[40px] shadow-sm">
        <div className="flex items-center gap-4">
          <Link href="/profile" className="rounded-full p-2 -ml-2 hover:bg-gray-100">
            <ArrowLeft className="h-6 w-6 text-gray-600" />
          </Link>
          <h1 className="text-3xl font-black text-gray-900">お問い合わせ履歴</h1>
        </div>
      </header>

      <main className="px-6 py-8">
        <div className="mx-auto max-w-2xl space-y-4">
          {((inquiries ?? []) as any[]).map((inquiry) => (
            <Link
              key={inquiry.id}
              href={`/profile/inquiries/${inquiry.id}`}
              className="flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-all active:scale-[0.98] hover:border-primary/20"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/5">
                <Inbox className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-gray-100 px-2 py-1 text-[11px] font-black text-gray-600">
                    {categoryLabels[inquiry.category] ?? inquiry.category}
                  </span>
                  <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-black text-primary">
                    {statusLabels[inquiry.status] ?? inquiry.status}
                  </span>
                </div>
                <p className="truncate text-sm font-black text-gray-900">
                  {String(inquiry.content || "").slice(0, 8)}
                  {String(inquiry.content || "").length > 8 ? "..." : ""}
                </p>
                <p className="mt-1 text-xs font-bold text-gray-400">
                  更新: {formatInquiryDate(inquiry.updated_at || inquiry.created_at)}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-300" />
            </Link>
          ))}

          {(!inquiries || inquiries.length === 0) && (
            <div className="rounded-3xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center">
              <Inbox className="mx-auto mb-3 h-9 w-9 text-gray-300" />
              <p className="text-sm font-bold text-gray-500">お問い合わせ履歴はまだありません。</p>
              <Link href="/contact" className="mt-5 inline-flex rounded-xl bg-primary px-5 py-3 text-sm font-black text-white">
                お問い合わせする
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
