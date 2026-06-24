"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";

const STARTUP_RELOAD_KEY = "textnext:startup-reload-at";
const STARTUP_WATCHDOG_MS = 5000;
const STARTUP_RELOAD_COOLDOWN_MS = 60 * 1000;

export default function StartupRecovery() {
  const { loading, profileReady } = useAuth();
  const [visible, setVisible] = useState(true);
  const [progress, setProgress] = useState(12);
  const isReady = !loading && profileReady;

  useEffect(() => {
    if (isReady) {
      setProgress(100);
      const hideTimer = window.setTimeout(() => setVisible(false), 240);
      return () => window.clearTimeout(hideTimer);
    }

    setVisible(true);
    const startedAt = Date.now();
    const progressTimer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const next = Math.min(88, 12 + Math.floor(elapsed / 85));
      setProgress((current) => Math.max(current, next));
    }, 120);

    const watchdogTimer = window.setTimeout(() => {
      if (!document.documentElement.classList.contains("capacitor-native")) return;

      try {
        const lastReloadAt = Number(window.sessionStorage.getItem(STARTUP_RELOAD_KEY) || "0");
        if (Number.isFinite(lastReloadAt) && Date.now() - lastReloadAt < STARTUP_RELOAD_COOLDOWN_MS) {
          return;
        }
        window.sessionStorage.setItem(STARTUP_RELOAD_KEY, String(Date.now()));
      } catch {
        // Storage failure should not block the one-shot recovery.
      }

      window.location.reload();
    }, STARTUP_WATCHDOG_MS);

    return () => {
      window.clearInterval(progressTimer);
      window.clearTimeout(watchdogTimer);
    };
  }, [isReady]);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[120] h-1 bg-transparent"
      style={{ bottom: "calc(var(--bottom-nav-height) + max(var(--bottom-nav-safe-padding-min), env(safe-area-inset-bottom)))" }}
    >
      <div
        className="h-full rounded-r-full bg-primary transition-[width] duration-200 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
