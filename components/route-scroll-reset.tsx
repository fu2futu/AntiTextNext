"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

export default function RouteScrollReset() {
  const pathname = usePathname();
  const previousRouteRef = useRef<string | null>(null);

  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }

    const scrollToTop = () => {
      if (window.location.hash) return;
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
      const result = originalPushState.apply(this, args);
      if (window.location.href !== before) scrollToTop();
      return result;
    };

    window.history.replaceState = function patchedReplaceState(...args) {
      const before = window.location.href;
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
    previousRouteRef.current = routeKey;

    if (window.location.hash) return;

    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.scrollingElement?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  }, [pathname]);

  return null;
}
