import type { Metadata, Viewport } from "next";
import { Inter, M_PLUS_Rounded_1c } from "next/font/google";
import dynamic from "next/dynamic";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";
import { Providers } from "@/components/providers";
import TrialNoticeBanner from "@/components/trial-notice-banner";
import SwipeTabNavigation from "@/components/swipe-tab-navigation";
import NavigationLoadingOverlay from "@/components/navigation-loading-overlay";
import MobileGestureGuard from "@/components/mobile-gesture-guard";
import RouteScrollReset from "@/components/route-scroll-reset";
import ServiceWorkerRegister from "@/components/service-worker-register";
import CapacitorEnvironment from "@/components/capacitor-environment";

// グローバルナビ（モバイル=ボトムバー / PC=上部ヘッダー）を遅延読み込み（初期表示を高速化）
const AppNav = dynamic(() => import("@/components/app-nav").then(mod => ({ default: mod.AppNav })), {
  ssr: false,
});

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  preload: true,
  variable: "--font-inter",
});

const mplusRounded = M_PLUS_Rounded_1c({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
  preload: true,
  variable: "--font-mplus-rounded",
  adjustFontFallback: false,
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
      </head>
      <body className={`${inter.variable} ${mplusRounded.variable} ${inter.className}`}>
        <Providers>
          <AuthProvider>
            <TrialNoticeBanner />
            <SwipeTabNavigation />
            <NavigationLoadingOverlay />
            <MobileGestureGuard />
            <RouteScrollReset />
            <ServiceWorkerRegister />
            <CapacitorEnvironment />
            <main className="app-main">{children}</main>
            <AppNav />
          </AuthProvider>
        </Providers>
      </body>
    </html>
  );
}
