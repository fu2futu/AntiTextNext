"use client";

import { usePathname } from "next/navigation";
import { BottomNav } from "@/components/bottom-nav";
import { DesktopHeader } from "@/components/desktop-header";
import { useUnreadCounts } from "@/components/use-unread-counts";

/**
 * グローバルナビゲーションのまとめ役。
 * 未読カウントの購読は本コンポーネントで1度だけ行い、
 * モバイル用ボトムバー(BottomNav, lg未満)とPC用ヘッダー(DesktopHeader, lg以上)へ
 * props で配布する（購読の二重化を防ぐ）。
 */
export function AppNav() {
  const pathname = usePathname();
  const { unreadCount, hasUnreadMessages } = useUnreadCounts();

  // チャット詳細ページでは全ナビを非表示
  if (pathname?.startsWith("/chat/")) {
    return null;
  }

  return (
    <>
      <DesktopHeader unreadCount={unreadCount} hasUnreadMessages={hasUnreadMessages} />
      <BottomNav unreadCount={unreadCount} hasUnreadMessages={hasUnreadMessages} />
    </>
  );
}
