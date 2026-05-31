"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Camera, ClipboardList, Bell, User, Search, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

interface DesktopHeaderProps {
  unreadCount: number;
  hasUnreadMessages: boolean;
}

export function DesktopHeader({ unreadCount, hasUnreadMessages }: DesktopHeaderProps) {
  const pathname = usePathname();
  const { t } = useI18n();

  const navItems = [
    { href: "/", label: t("nav.home"), icon: Home },
    { href: "/notifications", label: t("nav.notifications"), icon: Bell, badge: unreadCount },
    { href: "/transactions", label: t("nav.schedule"), icon: ClipboardList, dot: hasUnreadMessages },
    { href: "/profile", label: t("nav.mypage"), icon: User },
  ];

  return (
    <header className="hidden lg:flex fixed top-[var(--app-top-offset)] left-0 right-0 z-50 h-20 items-center gap-6 px-8 bg-white/95 backdrop-blur-xl border-b border-sky-100 shadow-[0_4px_24px_rgba(14,116,144,0.08)]">
      {/* ブランディング（ホームヘッダーと同じ見た目） */}
      <Link href="/" prefetch={true} className="flex-shrink-0 flex flex-col transition-opacity hover:opacity-80">
        <span className="text-2xl font-bold gradient-text-blue leading-none tracking-tight">
          TextNext
        </span>
        <div className="flex items-center gap-1 text-primary/80 mt-1">
          <BookOpen className="w-3.5 h-3.5" />
          <span className="text-[10px] font-bold tracking-tight">東工大生のための教科書フリマ</span>
        </div>
      </Link>

      {/* 検索バー */}
      <Link href="/search" prefetch={true} className="flex-1 max-w-md">
        <div className="relative group">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
            <Search className="w-5 h-5 text-gray-400 group-hover:text-primary transition-colors" />
          </div>
          <div className="w-full py-2.5 pl-12 pr-4 bg-gray-50 rounded-xl border border-gray-200 text-sm text-gray-400 group-hover:border-primary/50 group-hover:bg-white transition-all cursor-pointer">
            {t("home.search_placeholder")}
          </div>
        </div>
      </Link>

      {/* ナビゲーション（ヘッダー右側の空白に配置） */}
      <nav className="flex items-center gap-1 ml-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.href === "/"
            ? pathname === "/"
            : pathname?.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={true}
              className={cn(
                "relative flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold transition-all",
                isActive
                  ? "text-primary bg-sky-50"
                  : "text-gray-500 hover:text-primary hover:bg-sky-50/60"
              )}
            >
              <span className="relative">
                <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 shadow-sm">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                )}
                {item.dot && (
                  <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white shadow-sm" />
                )}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}

        {/* 出品ボタン（アクセント） */}
        <Link
          href="/listing"
          prefetch={true}
          className={cn(
            "flex items-center gap-2 ml-2 px-4 py-2 rounded-xl text-sm font-bold text-white shadow-sm transition-all active:scale-95",
            pathname?.startsWith("/listing")
              ? "bg-red-600 shadow-red-500/40"
              : "bg-red-500 hover:bg-red-600 shadow-red-500/20"
          )}
        >
          <Camera className="w-5 h-5" strokeWidth={2.5} />
          <span>{t("nav.listing")}</span>
        </Link>
      </nav>
    </header>
  );
}
