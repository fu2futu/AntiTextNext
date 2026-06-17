"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const RESTORE_SCROLL_PATHS = new Set(["/notifications", "/profile", "/transactions"]);

const scrollKeyForPath = (path: string) => `textnext:scroll:${path}`;

const shouldRestoreScroll = (path: string) => RESTORE_SCROLL_PATHS.has(path);

const saveScrollPosition = (path: string) => {
  if (typeof window === "undefined" || !shouldRestoreScroll(path)) return;
  try {
    window.sessionStorage.setItem(scrollKeyForPath(path), String(window.scrollY || 0));
  } catch {
    // Ignore storage failures; scroll restoration is only a UX hint.
  }
};

const readScrollPosition = (path: string) => {
  if (typeof window === "undefined" || !shouldRestoreScroll(path)) return null;
  try {
    const raw = window.sessionStorage.getItem(scrollKeyForPath(path));
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
};

export default function RouteScrollReset() {
  const pathname = usePathname();
  const previousRouteRef = useRef<string | null>(null);

  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }

    const scrollToTop = () => {
      if (window.location.hash) return;
      const savedScroll = readScrollPosition(window.location.pathname);
      if (savedScroll !== null) return;
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
        document.scrollingElement?.scrollTo({ top: 0, left: 0, behavior: "auto" });
      });
    };

    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;

    scrollToTop();
    window.setTimeout(scrollToTop, 80);

    window.history.pushState = function patchedPushState(...args) {
      const before = window.location.href;
      saveScrollPosition(window.location.pathname);
      const result = originalPushState.apply(this, args);
      if (window.location.href !== before) scrollToTop();
      return result;
    };

    window.history.replaceState = function patchedReplaceState(...args) {
      const before = window.location.href;
      saveScrollPosition(window.location.pathname);
      const result = originalReplaceState.apply(this, args);
      if (window.location.href !== before) scrollToTop();
      return result;
    };

    window.addEventListener("popstate", scrollToTop);

    return () => {
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
      window.removeEventListener("popstate", scrollToTop);
    };
  }, []);

  useEffect(() => {
    const routeKey = pathname ?? "";

    if (previousRouteRef.current === null) {
      previousRouteRef.current = routeKey;
      return;
    }

    if (previousRouteRef.current === routeKey) return;
    saveScrollPosition(previousRouteRef.current);
    previousRouteRef.current = routeKey;

    if (window.location.hash) return;

    requestAnimationFrame(() => {
      const savedScroll = readScrollPosition(routeKey);
      const nextTop = savedScroll ?? 0;
      window.scrollTo({ top: nextTop, left: 0, behavior: "auto" });
      document.scrollingElement?.scrollTo({ top: nextTop, left: 0, behavior: "auto" });
    });
  }, [pathname]);

  return null;
}
