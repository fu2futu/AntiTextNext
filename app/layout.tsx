import type { Metadata, Viewport } from "next";
import dynamic from "next/dynamic";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";
import { Providers } from "@/components/providers";
import TrialNoticeBanner from "@/components/trial-notice-banner";
import NavigationLoadingOverlay from "@/components/navigation-loading-overlay";
import MobileGestureGuard from "@/components/mobile-gesture-guard";
import RouteScrollReset from "@/components/route-scroll-reset";
import ServiceWorkerRegister from "@/components/service-worker-register";
import CapacitorEnvironment from "@/components/capacitor-environment";
import PersistentHome from "@/components/persistent-home";
import AppMain from "@/components/app-main";
import StartupRecovery from "@/components/startup-recovery";

// グローバルナビ（モバイル=ボトムバー / PC=上部ヘッダー）を遅延読み込み（初期表示を高速化）
const AppNav = dynamic(() => import("@/components/app-nav").then(mod => ({ default: mod.AppNav })), {
  ssr: false,
});


export const metadata: Metadata = {
  title: "TextNext - 学内教科書フリマ",
  description: "学内限定で教科書が循環するC2Cフリマアプリ",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "TextNext",
  },
  icons: {
    icon: "/icons/icon-192x192.png",
    apple: "/icons/icon-192x192.png",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#2563eb",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://qbmxbkylelaixoxupfeq.supabase.co" />
        <link rel="dns-prefetch" href="https://qbmxbkylelaixoxupfeq.supabase.co" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&family=M+PLUS+Rounded+1c:wght@400;500;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-sans">
        {/* ステータスバー(時刻/バッテリー)領域の塗り。
            本体スクロールでコンテンツが透明なセーフエリアに透けるのを防ぐ。
            ブラウザでは --app-min-top-offset が 0px のため非表示、ネイティブのみ機能。
            お知らせバナー(z-80)より下なので、バナー表示中はバナーが優先される。 */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 top-0 z-[75] bg-white"
          style={{ height: "var(--app-min-top-offset)" }}
        />
        <Providers>
          <AuthProvider>
            <StartupRecovery />
            <TrialNoticeBanner />
            <NavigationLoadingOverlay />
            <MobileGestureGuard />
            <RouteScrollReset />
            <ServiceWorkerRegister />
            <CapacitorEnvironment />
            <PersistentHome />
            <AppMain>{children}</AppMain>
            <AppNav />
          </AuthProvider>
        </Providers>
      </body>
    </html>
  );
}
