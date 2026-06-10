"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Camera, ClipboardList, Bell, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

interface BottomNavProps {
  unreadCount: number;
  hasUnreadMessages: boolean;
}

export function BottomNav({ unreadCount, hasUnreadMessages }: BottomNavProps) {
  const pathname = usePathname();
  const { t } = useI18n();

  const navItems = [
    { href: "/", label: t("nav.home"), icon: Home },
    { href: "/notifications", label: t("nav.notifications"), icon: Bell, badge: unreadCount },
    { href: "/listing", label: t("nav.listing"), icon: Camera, special: true },
    { href: "/profile" , label: t("nav.mypage"), icon: User },
    { href: "/transactions", label: t("nav.schedule"), icon: ClipboardList, dot: hasUnreadMessages },
  ];

  return (
    <nav className="bottom-nav-shell fixed bottom-0 left-0 right-0 bg-gradient-to-b from-sky-50/95 via-cyan-50/95 to-blue-100/95 backdrop-blur-xl border-t border-sky-100 z-50 shadow-[0_-10px_32px_rgba(14,116,144,0.16)] [.hide-bottom-nav_&]:hidden lg:hidden">
      <div className="flex items-end justify-around h-[var(--bottom-nav-height)] max-w-screen-lg mx-auto px-2 pb-[var(--bottom-nav-inner-bottom-padding)]">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.href === "/"
            ? pathname === "/"
            : pathname?.startsWith(item.href);

          if (item.special) {
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                className="flex flex-col items-center justify-center"
              >
                <div className={cn(
                  "w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 translate-y-[var(--bottom-nav-listing-lift)] bg-red-500 ring-4 ring-red-100",
                  isActive
                    ? "scale-110 shadow-red-500/40 ring-red-200"
                    : "hover:bg-red-600 hover:scale-105 shadow-red-500/20"
                )}>
                  <Icon className="w-8 h-8 transition-colors text-white" strokeWidth={2.5} />
                </div>
                <span className={cn(
                  "text-[10px] font-bold -mt-2 translate-y-[var(--bottom-nav-listing-label-offset)] transition-colors",
                  isActive ? "text-primary" : "text-gray-400"
                )}>{item.label}</span>
              </Link>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full space-y-1 transition-all duration-200 relative",
                isActive
                  ? "text-primary translate-y-[-2px]"
                  : "text-gray-400 hover:text-primary/70"
              )}
            >
              <div className="relative">
                <Icon
                  className={cn("w-6 h-6 transition-all", isActive ? "scale-110" : "")}
                  strokeWidth={isActive ? 2.5 : 2}
                />
                {/* 未読バッジ */}
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 shadow-sm animate-in zoom-in-50 duration-200">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                )}
                {item.dot && (
                  <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white shadow-sm animate-in zoom-in-50 duration-200" />
                )}
              </div>
              <span className={cn(
                "text-[10px] font-bold tracking-tight",
                isActive ? "text-primary" : "text-gray-400"
              )}>{item.label}</span>
              {isActive && (
                <div className="w-1 h-1 bg-primary rounded-full absolute bottom-[var(--bottom-nav-active-dot-bottom)]" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
