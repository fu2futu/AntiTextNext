"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Camera, ClipboardList, Bell, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { useState, useEffect, useCallback, useRef } from "react";

export function BottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { t } = useI18n();
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const notificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasUnreadMessages = unreadMessageCount > 0;

  // 未読通知数の取得
  const fetchUnreadCount = useCallback(async () => {
    if (!user) {
      setUnreadCount(0);
      return;
    }
    try {
      const { count, error } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_read", false);

      if (!error && count !== null) {
        setUnreadCount((current) => current === count ? current : count);
      }
    } catch {
      // エラー時は無視
    }
  }, [user]);

  // 未読チャット有無の取得
  const fetchUnreadMessages = useCallback(async () => {
    if (!user) {
      setUnreadMessageCount(0);
      return;
    }
    try {
      const activeStatuses = ["requested", "pending_approval", "accepted", "scheduling", "scheduled", "pending", "confirmed", "awaiting_rating"];
      const [{ data: activeTransactions, error: txError }, { data: unreadMessages, error: msgError }] = await Promise.all([
        (supabase as any)
          .from("transactions")
          .select("item_id,buyer_id,seller_id,status")
          .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
          .in("status", activeStatuses),
        supabase
        .from("messages")
          .select("item_id,sender_id")
        .eq("receiver_id", user.id)
          .eq("is_read", false),
      ]);

      if (!txError && !msgError) {
        const activeMessageKeys = new Set(
          ((activeTransactions || []) as any[]).map((tx) => {
            const counterpartId = tx.buyer_id === user.id ? tx.seller_id : tx.buyer_id;
            return `${tx.item_id}:${counterpartId}`;
          })
        );
        const activeUnreadMessages = ((unreadMessages || []) as any[]).filter((message) =>
          activeMessageKeys.has(`${message.item_id}:${message.sender_id}`)
        );
        setUnreadMessageCount((current) => current === activeUnreadMessages.length ? current : activeUnreadMessages.length);
      }
    } catch {
      // エラー時は無視
    }
  }, [user]);

  const scheduleUnreadCountRefresh = useCallback(() => {
    if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current);
    notificationTimerRef.current = setTimeout(fetchUnreadCount, 250);
  }, [fetchUnreadCount]);

  const scheduleUnreadMessageRefresh = useCallback(() => {
    if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
    messageTimerRef.current = setTimeout(fetchUnreadMessages, 250);
  }, [fetchUnreadMessages]);

  useEffect(() => {
    fetchUnreadCount();

    if (!user) return;

    // リアルタイムで通知の変更を監視
    const channel = supabase
      .channel('bottom-nav-notifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        },
        () => {
          scheduleUnreadCountRefresh();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current);
    };
  }, [user, fetchUnreadCount, scheduleUnreadCountRefresh]);

  useEffect(() => {
    fetchUnreadMessages();

    if (!user) return;

    const channel = supabase
      .channel('bottom-nav-messages')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${user.id}`
        },
        () => {
          scheduleUnreadMessageRefresh();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
    };
  }, [user, fetchUnreadMessages, scheduleUnreadMessageRefresh]);

  // おしらせページに移動した時にカウントをリフレッシュ
  useEffect(() => {
    if (pathname === "/notifications") {
      // 少し遅延させて既読処理を待つ
      const timer = setTimeout(fetchUnreadCount, 1000);
      return () => clearTimeout(timer);
    }
  }, [pathname, fetchUnreadCount]);

  useEffect(() => {
    if (pathname === "/transactions") {
      const timer = setTimeout(fetchUnreadMessages, 1000);
      return () => clearTimeout(timer);
    }
  }, [pathname, fetchUnreadMessages]);

  useEffect(() => {
    const badgeTotal = user ? unreadCount + unreadMessageCount : 0;
    const badgeApi = navigator as Navigator & {
      setAppBadge?: (contents?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };

    if (!badgeApi.setAppBadge || !badgeApi.clearAppBadge) return;

    const updateAppBadge = async () => {
      try {
        if (badgeTotal > 0) {
          await badgeApi.setAppBadge(badgeTotal);
        } else {
          await badgeApi.clearAppBadge();
        }
      } catch {
        // バッジ表示は端末・ブラウザ・通知許可に依存するため、失敗しても通常利用は継続する。
      }
    };

    updateAppBadge();
  }, [user, unreadCount, unreadMessageCount]);

  // チャットページでは非表示
  if (pathname?.startsWith("/chat/")) {
    return null;
  }

  const navItems = [
    { href: "/", label: t("nav.home"), icon: Home },
    { href: "/notifications", label: t("nav.notifications"), icon: Bell, badge: unreadCount },
    { href: "/listing", label: t("nav.listing"), icon: Camera, special: true },
    { href: "/profile" , label: t("nav.mypage"), icon: User },
    { href: "/transactions", label: t("nav.schedule"), icon: ClipboardList, dot: hasUnreadMessages },
  ];

  return (
    <nav className="bottom-nav-shell fixed bottom-0 left-0 right-0 bg-gradient-to-b from-sky-50/95 via-cyan-50/95 to-blue-100/95 backdrop-blur-xl border-t border-sky-100 z-50 shadow-[0_-10px_32px_rgba(14,116,144,0.16)] [.hide-bottom-nav_&]:hidden">
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
                prefetch={true}
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
              prefetch={true}
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
