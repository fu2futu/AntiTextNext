"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Info, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

type NoticeBanner = {
  enabled: boolean;
  message: string;
};

const DISMISS_PREFIX = "textnext-notice-banner-dismissed:";

export default function TrialNoticeBanner() {
  const pathname = usePathname();
  const bannerRef = useRef<HTMLDivElement>(null);
  const [banner, setBanner] = useState<NoticeBanner | null>(null);
  const [dismissKey, setDismissKey] = useState("");
  const [dismissed, setDismissed] = useState(false);

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

      const nextDismissKey = `${DISMISS_PREFIX}${data?.updated_at || "default"}`;
      setDismissKey(nextDismissKey);
      setDismissed(localStorage.getItem(nextDismissKey) === "true");
    };

    fetchBanner();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const shouldHide = pathname?.startsWith("/chat/") || !banner?.enabled || dismissed;

    if (shouldHide) {
      document.documentElement.style.setProperty("--app-top-offset", "0px");
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
        document.documentElement.style.setProperty("--app-top-offset", "0px");
      };
    }

    const observer = new ResizeObserver(updateHeight);
    if (bannerRef.current) observer.observe(bannerRef.current);

    return () => {
      observer.disconnect();
      document.documentElement.style.setProperty("--app-top-offset", "0px");
    };
  }, [banner?.enabled, banner?.message, dismissed, pathname]);

  const dismiss = () => {
    setDismissed(true);
    if (dismissKey) {
      localStorage.setItem(dismissKey, "true");
    }
  };

  if (pathname?.startsWith("/chat/") || !banner?.enabled || dismissed) {
    return null;
  }

  return (
    <div
      ref={bannerRef}
      className="fixed left-0 right-0 top-0 z-[80] border-b border-sky-100 bg-sky-50/95 px-4 py-2 text-sky-950 shadow-sm backdrop-blur-md [transform:translateZ(0)]"
      style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
    >
      <div className="mx-auto flex max-w-screen-lg items-start gap-3">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-sky-600" />
        <p className="min-w-0 flex-1 whitespace-pre-wrap text-xs font-bold leading-relaxed">
          {banner.message}
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="flex flex-shrink-0 rounded-full p-1 text-sky-700 transition hover:bg-sky-100"
          aria-label="お知らせを閉じる"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
