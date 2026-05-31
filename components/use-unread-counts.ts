"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { supabase } from "@/lib/supabase";

/**
 * 未読通知数・未読チャット有無を取得し、リアルタイムで更新する共有フック。
 * ボトムナビとPCヘッダーで購読を二重化しないよう、必ず1箇所(AppNav)でのみ呼び出すこと。
 */
export function useUnreadCounts() {
  const pathname = usePathname();
  const { user } = useAuth();
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
      .channel('app-nav-notifications')
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
      .channel('app-nav-messages')
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

  // App Badge API (PWA) の更新
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

  return { unreadCount, hasUnreadMessages };
}
