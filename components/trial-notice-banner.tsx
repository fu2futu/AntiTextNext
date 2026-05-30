"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronUp, Info } from "lucide-react";

const STORAGE_KEY = "textnext-trial-notice-collapsed";

export default function TrialNoticeBanner() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);
  const [bannerHeight, setBannerHeight] = useState(64);
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEY) === "true");
    setReady(true);
  }, []);

  useEffect(() => {
    const banner = bannerRef.current;
    if (!banner) return;

    const updateHeight = () => {
      setBannerHeight(banner.getBoundingClientRect().height);
    };

    updateHeight();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateHeight);
      return () => window.removeEventListener("resize", updateHeight);
    }

    const observer = new ResizeObserver(updateHeight);
    observer.observe(banner);

    return () => observer.disconnect();
  }, [collapsed, ready]);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(STORAGE_KEY, String(next));
  };

  if (pathname?.startsWith("/chat/")) return null;

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
              <button
                type="button"
                onClick={toggle}
                className="flex flex-shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-black text-amber-700 hover:bg-amber-100"
                aria-expanded={!collapsed}
              >
                {collapsed ? "開く" : "閉じる"}
                {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
              </button>
            </div>
            <div className={`overflow-hidden transition-all duration-300 ease-in-out ${collapsed ? 'max-h-0 opacity-0' : 'max-h-40 opacity-100 mt-1'}`}>
              <p className="text-xs font-medium leading-relaxed text-amber-800">
                TextNext は現在、ベータ版として公開しています。表示や動作に不具合が見られた場合、「マイページ」→「お問い合わせ」からご報告いただけますと幸いです。
              </p>
            </div>
          </div>
        </div>
      </div>
      <div aria-hidden="true" style={{ height: bannerHeight }} />
    </>
  );
}
