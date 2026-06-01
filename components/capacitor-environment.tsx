"use client";

import { Capacitor } from "@capacitor/core";
import { useEffect } from "react";

export default function CapacitorEnvironment() {
  useEffect(() => {
    const root = document.documentElement;
    const isNative = Capacitor.isNativePlatform();

    root.classList.toggle("capacitor-native", isNative);
    root.dataset.capacitorPlatform = isNative ? Capacitor.getPlatform() : "web";

    return () => {
      root.classList.remove("capacitor-native");
      delete root.dataset.capacitorPlatform;
    };
  }, []);

  return null;
}
