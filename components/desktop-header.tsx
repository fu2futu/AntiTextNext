"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, Camera, ClipboardList, Bell, User, Search, BookOpen, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";

interface DesktopHeaderProps {
  unreadCount: number;
  hasUnreadMessages: boolean;
}

export function DesktopHeader({ unreadCount, hasUnreadMessages }: DesktopHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const { user } = useAuth();
  const [searchValue, setSearchValue] = useState("");
  const isGuest = !user;

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
      {isGuest ? (
        <Link
          href="/auth/signup"
          className="flex-1 max-w-md"
        >
          <div className="relative group flex items-center">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
              <Lock className="w-4 h-4 text-gray-400 group-hover:text-primary transition-colors" />
            </div>
            <div className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-12 pr-12 text-sm font-bold text-gray-400 transition-all hover:border-primary/50 hover:bg-white cursor-pointer select-none">
              {t("home.search_placeholder")}
            </div>
          </div>
        </Link>
      ) : (
        <form
          className="flex-1 max-w-md"
          onSubmit={(event) => {
            event.preventDefault();
            const query = searchValue.trim();
            router.push(query ? `/search?q=${encodeURIComponent(query)}` : "/search");
          }}
        >
          <div className="relative group flex items-center">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
              <Search className="w-5 h-5 text-gray-400 group-focus-within:text-primary group-hover:text-primary transition-colors" />
            </div>
            <input
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder={t("home.search_placeholder")}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-12 pr-12 text-sm font-bold text-gray-700 outline-none transition-all placeholder:text-gray-400 hover:border-primary/50 hover:bg-white focus:border-primary focus:bg-white"
            />
            <button
              type="submit"
              aria-label="検索"
              className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-sky-50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              <Search className="h-4 w-4" />
            </button>
          </div>
        </form>
      )}

      {/* 分野から探す */}
      {isGuest ? (
        <Link
          href="/auth/signup"
          className="flex flex-shrink-0 items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold text-gray-400 hover:text-primary hover:bg-sky-50/60 transition-all"
        >
          <Lock className="w-4 h-4" />
          <span>分野</span>
        </Link>
      ) : (
        <Link
          href="/subjects"
          prefetch={true}
          className={cn(
            "flex flex-shrink-0 items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold transition-all",
            pathname?.startsWith("/subjects")
              ? "text-primary bg-sky-50"
              : "text-gray-500 hover:text-primary hover:bg-sky-50/60"
          )}
        >
          <BookOpen className="w-5 h-5" strokeWidth={pathname?.startsWith("/subjects") ? 2.5 : 2} />
          <span>分野</span>
        </Link>
      )}

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
