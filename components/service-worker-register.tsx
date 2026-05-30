"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const isLocalhost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
    if (process.env.NODE_ENV !== "production" && !isLocalhost) return;

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Service Workerは通知・PWA補助用。登録失敗時も通常利用は継続する。
    });
  }, []);

  return null;
}
