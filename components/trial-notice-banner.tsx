"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronUp, Info } from "lucide-react";
import { supabase } from "@/lib/supabase";

type NoticeBanner = {
  enabled: boolean;
  message: string;
};

const COLLAPSE_PREFIX = "textnext-notice-banner-collapsed:";

export default function TrialNoticeBanner() {
  const pathname = usePathname();
  const bannerRef = useRef<HTMLDivElement>(null);
  const [banner, setBanner] = useState<NoticeBanner | null>(null);
  const [collapseKey, setCollapseKey] = useState("");
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchBanner = async () => {
      const { data } = await (supabase as any)
        .from("app_notice_banner")
        .select("enabled,message,updated_at")
        .eq("id", "global")
        .maybeSingle();

      if (cancelled) return;

      const nextMessage = String(data?.message || "").trim();
      const nextBanner = {
        enabled: Boolean(data?.enabled) && nextMessage.length > 0,
        message: nextMessage,
      };
      setBanner(nextBanner);

      const nextCollapseKey = `${COLLAPSE_PREFIX}${data?.updated_at || "default"}`;
      setCollapseKey(nextCollapseKey);
      setCollapsed(localStorage.getItem(nextCollapseKey) === "true");
    };

    fetchBanner();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const setMinimumTopOffset = () => {
      document.documentElement.style.setProperty("--app-top-offset", "var(--app-min-top-offset)");
    };

    const shouldHide = pathname?.startsWith("/chat/") || !banner?.enabled;

    if (shouldHide) {
      if (pathname?.startsWith("/chat/")) {
        document.documentElement.style.setProperty("--app-top-offset", "0px");
      } else {
        setMinimumTopOffset();
      }
      return;
    }

    const updateHeight = () => {
      const nextHeight = bannerRef.current?.getBoundingClientRect().height || 0;
      document.documentElement.style.setProperty("--app-top-offset", `${nextHeight}px`);
    };

    updateHeight();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateHeight);
      return () => {
        window.removeEventListener("resize", updateHeight);
        setMinimumTopOffset();
      };
    }

    const observer = new ResizeObserver(updateHeight);
    if (bannerRef.current) observer.observe(bannerRef.current);

    return () => {
      observer.disconnect();
      setMinimumTopOffset();
    };
  }, [banner?.enabled, banner?.message, collapsed, pathname]);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    if (collapseKey) {
      localStorage.setItem(collapseKey, String(next));
    }
  };

  if (pathname?.startsWith("/chat/") || !banner?.enabled) {
    return null;
  }

  return (
    <div
      ref={bannerRef}
      className="fixed left-0 right-0 top-0 z-[80] border-b border-amber-100 bg-amber-50/95 px-4 py-2 text-amber-950 shadow-sm backdrop-blur-md [transform:translateZ(0)]"
      style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
    >
      <div className="mx-auto flex max-w-screen-lg items-start gap-3">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black text-amber-900">お知らせ</p>
          <div className={`overflow-hidden transition-all duration-200 ${collapsed ? "max-h-0 opacity-0" : "mt-1 max-h-40 opacity-100"}`}>
            <p className="whitespace-pre-wrap text-xs font-bold leading-relaxed">
              {banner.message}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={toggleCollapsed}
          className="flex flex-shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-black text-amber-700 transition hover:bg-amber-100"
          aria-expanded={!collapsed}
        >
          {collapsed ? "開く" : "畳む"}
          {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}
