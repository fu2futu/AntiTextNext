"use client";

const APP_IMAGE_CACHE_NAME = "textnext-app-images-v1";

const isNativeApp = () => {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("capacitor-native");
};

export async function cacheImageUrls(urls: string[], limit = 24) {
  if (typeof window === "undefined") return;
  if (!isNativeApp()) return;
  if (!("caches" in window)) return;

  const uniqueUrls = Array.from(new Set(urls.filter(Boolean))).slice(0, limit);
  if (uniqueUrls.length === 0) return;

  try {
    const cache = await window.caches.open(APP_IMAGE_CACHE_NAME);
    await Promise.allSettled(
      uniqueUrls.map(async (url) => {
        const cached = await cache.match(url);
        if (cached) return;

        const response = await fetch(url, {
          cache: "force-cache",
          credentials: "omit",
        });
        if (!response || (!response.ok && response.type !== "opaque")) return;
        await cache.put(url, response.clone());
      })
    );
  } catch {
    // Image caching is only a performance hint. Rendering must never depend on it.
  }
}

export async function clearAppImageCache() {
  if (typeof window === "undefined") return;
  if (!("caches" in window)) return;

  try {
    await window.caches.delete(APP_IMAGE_CACHE_NAME);
  } catch {
    // Cache cleanup is best-effort.
  }
}
