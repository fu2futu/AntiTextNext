import Link from "next/link";
import { Activity, Ban, BookOpen, ClipboardList, Eye, FileWarning, Inbox, Users } from "lucide-react";
import { AdminPageHeader, StatusBadge } from "./_components/admin-shell";
import { formatAdminDate, requireAdmin } from "@/lib/admin-utils";

export const dynamic = "force-dynamic";

const cards = [
  { key: "todayAccess", label: "今日の訪問者数", href: "/admin/access", icon: Eye, tone: "border-sky-100 bg-sky-50 text-sky-700" },
  { key: "users", label: "登録ユーザー数", href: "/admin/users", icon: Users, tone: "border-blue-100 bg-blue-50 text-blue-700" },
  { key: "items", label: "出品数", href: "/admin/items", icon: BookOpen, tone: "border-emerald-100 bg-emerald-50 text-emerald-700" },
  { key: "activeTransactions", label: "取引中の件数", href: "/admin/transactions?status=active", icon: ClipboardList, tone: "border-amber-100 bg-amber-50 text-amber-700" },
  { key: "completedTransactions", label: "完了取引数", href: "/admin/transactions?status=completed", icon: ClipboardList, tone: "border-violet-100 bg-violet-50 text-violet-700" },
  { key: "reports", label: "通報件数", href: "/admin/reports", icon: FileWarning, tone: "border-red-100 bg-red-50 text-red-700" },
  { key: "openInquiries", label: "未対応のお問い合わせ数", href: "/admin/inquiries?status=unresolved", icon: Inbox, tone: "border-cyan-100 bg-cyan-50 text-cyan-700" },
  { key: "restrictedUsers", label: "BAN中のユーザー数", href: "/admin/users?restriction=restricted", icon: Ban, tone: "border-rose-100 bg-rose-50 text-rose-700" },
  { key: "errors", label: "エラー件数", href: "/admin/errors", icon: Activity, tone: "border-slate-200 bg-slate-100 text-slate-700" },
];

const ACTIVE_TRANSACTION_STATUSES = [
  "requested",
  "accepted",
  "scheduling",
  "scheduled",
  "awaiting_rating",
  "pending_approval",
  "pending",
  "confirmed",
];

export default async function AdminDashboardPage() {
  const { supabase } = await requireAdmin();
  const now = new Date().toISOString();

  const [
    todayAccess,
    users,
    items,
    activeTransactions,
    completedTransactions,
    reports,
    openInquiries,
    restrictedUsers,
    recentUsers,
    recentReports,
    recentInquiries,
    handoverMethods,
  ] = await Promise.all([
    (supabase as any).rpc("admin_get_today_access_count"),
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("items").select("*", { count: "exact", head: true }),
    supabase.from("transactions").select("*", { count: "exact", head: true }).in("status", ACTIVE_TRANSACTION_STATUSES),
    supabase.from("transactions").select("*", { count: "exact", head: true }).eq("status", "completed"),
    (supabase as any).from("reports").select("*", { count: "exact", head: true }),
    (supabase as any).from("inquiries").select("*", { count: "exact", head: true }).not("status", "in", "(completed,no_action)"),
    (supabase as any).from("user_restrictions").select("*", { count: "exact", head: true }).is("lifted_at", null).or(`ends_at.is.null,ends_at.gt.${now}`),
    supabase.from("profiles").select("user_id, nickname, department, created_at").order("created_at", { ascending: false }).limit(5),
    (supabase as any).from("reports").select("id, reason, status, created_at").order("created_at", { ascending: false }).limit(5),
    (supabase as any).from("inquiries").select("id, sender_name, category, status, created_at").order("created_at", { ascending: false }).limit(5),
    (supabase as any).from("transactions").select("handover_completion_method").not("handover_completion_method", "is", null),
  ]);

  const counts: Record<string, number> = {
    todayAccess: Number(todayAccess.data ?? 0),
    users: users.count ?? 0,
    items: items.count ?? 0,
    activeTransactions: activeTransactions.count ?? 0,
    completedTransactions: completedTransactions.count ?? 0,
    reports: reports.count ?? 0,
    openInquiries: openInquiries.count ?? 0,
    restrictedUsers: restrictedUsers.count ?? 0,
    errors: 0,
  };

  const handoverMethodCounts = ((handoverMethods.data ?? []) as Array<{ handover_completion_method: string | null }>).reduce(
    (acc, row) => {
      if (row.handover_completion_method === "qr") acc.qr += 1;
      if (row.handover_completion_method === "forget") acc.forget += 1;
      return acc;
    },
    { qr: 0, forget: 0 }
  );

  return (
    <>
      <AdminPageHeader title="管理者ダッシュボード" description="運営対応に必要な件数と最近の動きを確認します。" />
      <main className="space-y-4 p-4 sm:p-6">
        <section className="grid gap-2 md:grid-cols-3 xl:grid-cols-5">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <Link key={card.key} href={card.href} className={`rounded-lg border px-2.5 py-2 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${card.tone}`}>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] font-black">{card.label}</span>
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                </div>
                <p className="text-lg font-black leading-none">{counts[card.key].toLocaleString()}</p>
              </Link>
            );
          })}
        </section>

        <section className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
          <Panel title="取引終了法">
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
              <p className="text-xs font-black text-slate-700">QR: {handoverMethodCounts.qr.toLocaleString()}</p>
              <p className="mt-1 text-xs font-black text-slate-700">やり忘れ: {handoverMethodCounts.forget.toLocaleString()}</p>
            </div>
          </Panel>
          <Panel title="最近登録したユーザー">
            {(recentUsers.data ?? []).map((user: any) => (
              <Row
                key={user.user_id}
                title={user.nickname || "未設定"}
                meta={user.department || "-"}
                sub={formatAdminDate(user.created_at)}
                href={`/admin/users/${user.user_id}`}
              />
            ))}
          </Panel>
          <Panel title="最近の通報">
            {((recentReports.data ?? []) as any[]).map((report) => (
              <Row key={report.id} title={report.reason} meta={<StatusBadge value={report.status} />} sub={formatAdminDate(report.created_at)} />
            ))}
          </Panel>
          <Panel title="最近の問い合わせ">
            {((recentInquiries.data ?? []) as any[]).map((inquiry) => (
              <Row
                key={inquiry.id}
                title={inquiry.sender_name || "匿名"}
                meta={`${inquiry.category} / ${inquiry.status}`}
                sub={formatAdminDate(inquiry.created_at)}
                href={`/admin/inquiries/${inquiry.id}`}
              />
            ))}
          </Panel>
        </section>
      </main>
    </>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <h2 className="mb-2 text-sm font-black">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Row({ title, meta, sub, href }: { title: string; meta: React.ReactNode; sub: string; href?: string }) {
  const className = "block rounded-lg border border-slate-100 bg-slate-50 p-2 transition hover:border-slate-300 hover:bg-white";
  const content = (
    <>
      <p className="truncate text-xs font-black">{title}</p>
      <div className="mt-0.5 text-[11px] font-bold text-slate-600">{meta}</div>
      <p className="mt-0.5 text-[11px] text-slate-500">{sub}</p>
    </>
  );

  return href ? <Link href={href} className={className}>{content}</Link> : <div className={className}>{content}</div>;
}
