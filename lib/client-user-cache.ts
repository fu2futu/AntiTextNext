"use client";

const USER_CACHE_PREFIXES = [
  "textnext:home:",
  "textnext:profile:",
  "textnext:profile-ui:",
  "textnext:transactions:",
  "textnext:transactions-ui:",
  "textnext:notifications:",
  "textnext:scroll:",
];

const removeMatchingKeys = (storage: Storage, userId: string) => {
  const keysToRemove: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key) continue;
    const isTextNextCache = USER_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix));
    if (!isTextNextCache) continue;
    if (key.includes(`user:${userId}`) || key.startsWith("textnext:scroll:")) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => storage.removeItem(key));
};

export function clearUserLocalCaches(userId: string | null | undefined) {
  if (!userId || typeof window === "undefined") return;

  try {
    removeMatchingKeys(window.localStorage, userId);
    removeMatchingKeys(window.sessionStorage, userId);
  } catch {
    // Local cache cleanup is best-effort.
  }
}
