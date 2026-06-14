import Link from "next/link";
import { ReactNode } from "react";
import {
  Activity,
  Ban,
  BookOpen,
  BookHeart,
  ClipboardList,
  FileWarning,
  Gauge,
  Gift,
  Inbox,
  Megaphone,
  Database,
  ScrollText,
  Users,
  UserX,
  Eye,
} from "lucide-react";

const navItems = [
  { href: "/admin", label: "ダッシュボード", icon: Gauge },
  { href: "/admin/access", label: "アクセス分析", icon: Eye },
  { href: "/admin/users", label: "ユーザー管理", icon: Users },
  { href: "/admin/deleted-accounts", label: "削除済みアカウント", icon: UserX },
  { href: "/admin/home-preview", label: "ホームSimulation", icon: Eye },
  { href: "/admin/demo-home", label: "スクショDemo", icon: Eye },
  { href: "/admin/demo-items", label: "デモ出品管理", icon: BookOpen },
  { href: "/admin/items", label: "出品管理", icon: BookOpen },
  { href: "/admin/transactions", label: "取引管理", icon: ClipboardList },
  { href: "/admin/reports", label: "通報管理", icon: FileWarning },
  { href: "/admin/inquiries", label: "問い合わせ管理", icon: Inbox },
  { href: "/admin/banner", label: "上部お知らせ", icon: Megaphone },
  { href: "/admin/book-requests", label: "本リクエスト管理", icon: BookHeart },
  { href: "/admin/restrictions", label: "BAN・制限管理", icon: Ban },
  { href: "/admin/rewards", label: "特典付与", icon: Gift },
  { href: "/admin/data-retention", label: "保存期間管理", icon: Database },
  { href: "/admin/logs", label: "操作ログ", icon: ScrollText },
  { href: "/admin/errors", label: "エラー/ログ", icon: Activity },
];

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-slate-200 bg-white px-4 py-6 lg:block">
        <Link href="/admin" className="mb-8 flex items-center gap-3 px-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
            <Gauge className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-black uppercase tracking-widest">TextNext</p>
            <p className="text-xs font-bold text-slate-500">Admin Console</p>
          </div>
        </Link>
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <Link
          href="/profile"
          className="absolute bottom-6 left-4 right-4 rounded-xl border border-slate-200 px-3 py-2.5 text-center text-sm font-bold text-slate-600 hover:border-slate-300"
        >
          マイページへ戻る
        </Link>
      </aside>
      <div className="lg:pl-64">
        <div className="border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
          <div className="flex gap-2 overflow-x-auto">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className="shrink-0 rounded-full bg-slate-100 px-3 py-2 text-xs font-bold">
                {item.label}
              </Link>
            ))}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

export function AdminPageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <header className="border-b border-slate-200 bg-white px-6 py-6">
      <h1 className="text-2xl font-black tracking-tight">{title}</h1>
      {description && <p className="mt-2 text-sm font-medium text-slate-500">{description}</p>}
    </header>
  );
}

export function StatusBadge({ value }: { value?: string | null }) {
  const label = value || "none";
  const tone =
    label.includes("ban") || label.includes("permanent") || label.includes("deleted")
      ? "border-red-200 bg-red-50 text-red-700"
      : label.includes("open") || label.includes("pending")
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : label.includes("completed") || label.includes("visible") || label === "none"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-slate-100 text-slate-700";

  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${tone}`}>{label}</span>;
}
