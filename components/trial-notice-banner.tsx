"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronUp, Info, X } from "lucide-react";

const STORAGE_KEY = "textnext-trial-notice-collapsed";
const DISMISS_KEY = "textnext-trial-notice-dismissed";

export default function TrialNoticeBanner() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [ready, setReady] = useState(false);
  const [bannerHeight, setBannerHeight] = useState(64);
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEY) === "true");
    setDismissed(localStorage.getItem(DISMISS_KEY) === "true");
    setReady(true);
  }, []);

  useEffect(() => {
    if (pathname?.startsWith("/chat/") || dismissed) {
      document.documentElement.style.setProperty("--app-top-offset", "0px");
      return;
    }

    const banner = bannerRef.current;
    if (!banner) return;

    const updateHeight = () => {
      const nextHeight = banner.getBoundingClientRect().height;
      setBannerHeight(nextHeight);
      document.documentElement.style.setProperty("--app-top-offset", `${nextHeight}px`);
    };

    updateHeight();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateHeight);
      return () => {
        window.removeEventListener("resize", updateHeight);
        document.documentElement.style.setProperty("--app-top-offset", "0px");
      };
    }

    const observer = new ResizeObserver(updateHeight);
    observer.observe(banner);

    return () => {
      observer.disconnect();
      document.documentElement.style.setProperty("--app-top-offset", "0px");
    };
  }, [collapsed, ready, pathname, dismissed]);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(STORAGE_KEY, String(next));
  };

  const dismiss = () => {
    setDismissed(true);
    localStorage.setItem(DISMISS_KEY, "true");
  };

  const restore = () => {
    setDismissed(false);
    localStorage.setItem(DISMISS_KEY, "false");
  };

  if (pathname?.startsWith("/chat/")) return null;

  if (dismissed) {
    return (
      <button
        type="button"
        onClick={restore}
        className={`fixed right-3 z-[60] flex h-9 w-9 items-center justify-center rounded-full border border-amber-200 bg-amber-50/95 text-amber-700 shadow-md backdrop-blur-md transition-opacity duration-300 hover:bg-amber-100 bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom)+0.75rem)] lg:bottom-4 ${!ready ? 'opacity-0' : 'opacity-100'}`}
        aria-label="試験運用のお知らせを開く"
        title="試験運用のお知らせ"
      >
        <Info className="h-4 w-4" />
      </button>
    );
  }

  return (
    <>
      <div
        ref={bannerRef}
        className={`fixed left-0 right-0 top-0 z-[80] border-b border-amber-200 bg-amber-50/95 px-4 py-2 backdrop-blur-md transition-opacity duration-300 [transform:translateZ(0)] ${!ready ? 'opacity-0' : 'opacity-100'}`}
        style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
      >
        <div className="mx-auto flex max-w-screen-lg items-start gap-3">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-black text-amber-900">試験運用中のお知らせ</p>
              <div className="flex flex-shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={toggle}
                  className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-black text-amber-700 hover:bg-amber-100"
                  aria-expanded={!collapsed}
                >
                  {collapsed ? "開く" : "閉じる"}
                  {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={dismiss}
                  className="flex items-center rounded-full p-1 text-amber-700 hover:bg-amber-100"
                  aria-label="お知らせを閉じる"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className={`overflow-hidden transition-all duration-300 ease-in-out ${collapsed ? 'max-h-0 opacity-0' : 'max-h-40 opacity-100 mt-1'}`}>
              <p className="text-xs font-medium leading-relaxed text-amber-800">
                表示や動作に不具合が見られた場合、「マイページ」→「お問い合わせ」からご報告いただけますと幸いです。
                また分野から探す機能も作り途中です。しばしお待ちください。
              </p>
            </div>
          </div>
        </div>
      </div>
      <div aria-hidden="true" className="hidden" style={{ height: bannerHeight }} />
    </>
  );
}
