"use client";

import Link from "next/link";
import { Search, BookOpen, TrendingUp, Users, ChevronDown, RefreshCw, Rows3, Grid2X2 } from "lucide-react";
import { useState, useCallback, useMemo, useEffect, useRef, TouchEvent as ReactTouchEvent } from "react";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { RewardAvatar } from "@/components/reward-avatar";
import { getItemImageUrl } from "@/lib/image-storage";
import { resolveEarlyRegistrationEligible, type RewardOverride, type RewardSetting } from "@/lib/rewards";
import { useLoginRequiredPrompt } from "@/components/login-required-prompt";
import { HomeItemCard, type HomeItem, type MobileHomeLayout } from "@/components/home-item-card";
import { BackgroundRefreshBanner } from "@/components/background-refresh-banner";
import { GuestGateOverlay, GuestSearchGate, GuestSubjectsGate } from "@/components/guest-gate-overlay";

type Item = HomeItem;

/** Maximum number of items to show to non-authenticated visitors. */
const GUEST_ITEM_LIMIT = 6;

const HOME_ITEM_PAGE_SIZE = 7;
const PC_ITEM_PAGE_SIZE = 16;
const TABLET_PORTRAIT_ITEM_PAGE_SIZE = 21; // iPad縦: 3列×7行
const HOME_SESSION_CACHE_VERSION = 2;
const HOME_SESSION_CACHE_TTL_MS = 10 * 60 * 1000;
const ACTIVE_TRANSACTION_STATUSES = [
  "requested",
  "accepted",
  "scheduling",
  "scheduled",
  "awaiting_rating",
  "pending_approval",
  "pending",
  "confirmed",
];

const getBoardSizeClass = (itemCount: number, targetCount: number, hasMore: boolean) =>
  itemCount < targetCount && !hasMore
    ? "max-h-[72dvh]"
    : "h-[70dvh] md:h-[56rem] md:max-h-[85vh] lg:h-[36rem] lg:max-h-[80vh]";

// 見出しの右に置く小さなスライドトグル（アイコンのみ）。スマホ専用。
const LAYOUT_TOGGLE_OPTIONS = [
  { value: "list" as const, icon: Rows3, label: "1列" },
  { value: "square" as const, icon: Grid2X2, label: "3列" },
];

function MobileLayoutToggle({
  value,
  onChange,
}: {
  value: MobileHomeLayout;
  onChange: (value: MobileHomeLayout) => void;
}) {
  const activeIndex = Math.max(0, LAYOUT_TOGGLE_OPTIONS.findIndex((o) => o.value === value));
  return (
    <div className="relative ml-auto flex items-center rounded-full border border-gray-200 bg-gray-100 p-0.5 md:hidden">
      <div
        className="absolute bottom-0.5 left-0.5 top-0.5 w-7 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out"
        style={{ transform: `translateX(${activeIndex * 100}%)` }}
        aria-hidden="true"
      />
      {LAYOUT_TOGGLE_OPTIONS.map((option) => {
        const Icon = option.icon;
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
              active ? "text-primary" : "text-gray-400"
            }`}
            aria-pressed={active}
            aria-label={option.label}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        );
      })}
    </div>
  );
}

function LoadMoreButton({
  loading,
  onClick,
  label,
  loadingLabel,
}: {
  loading: boolean;
  onClick: () => void;
  label: string;
  loadingLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="inline-flex h-10 w-32 items-center justify-center gap-2 rounded-full bg-white px-4 text-xs font-black text-gray-700 shadow-lg ring-1 ring-gray-200 transition hover:bg-gray-50 disabled:opacity-60"
    >
      {loading ? (
        <>
          <div className="h-4 w-4 rounded-full border-2 border-gray-300 border-t-primary animate-spin" />
          {loadingLabel}
        </>
      ) : (
        <>
          <ChevronDown className="h-4 w-4" />
          {label}
        </>
      )}
    </button>
  );
}

type HomeClientProps = {
  items: Item[];
  popularItems: Item[];
  totalPopularCount: number;
  demoPreview?: boolean;
  demoItemHrefPrefix?: string;
  appReviewDemo?: boolean;
  active?: boolean;
};

type HomeSessionCache = {
  version: number;
  savedAt: number;
  recommendedItems: Item[];
  popularItems: Item[];
  favorites: string[];
  hiddenTransactionItemIds: string[];
  totalVisiblePopularCount: number;
  totalRecommendedCount: number;
  hasMore: boolean;
  hasMoreRecommended: boolean;
};

const itemVisualKey = (item: Item) => [
  item.id,
  item.title,
  item.selling_price,
  item.status,
  item.seller_id || "",
  item.favorite_count ?? "",
  item.front_image_url || "",
  item.front_thumbnail_url || "",
  item.front_image_storage_path || "",
  item.front_thumbnail_storage_path || "",
  item.image_storage_provider || "",
].join("|");

const mergeStableItems = (current: Item[], next: Item[]) => {
  let changed = current.length !== next.length;
  const currentById = new Map(current.map((item) => [item.id, item]));
  const merged = next.map((nextItem, index) => {
    const currentItem = currentById.get(nextItem.id);
    if (current[index]?.id !== nextItem.id) changed = true;
    if (currentItem && itemVisualKey(currentItem) === itemVisualKey(nextItem)) {
      return currentItem;
    }
    changed = true;
    return nextItem;
  });

  return changed ? merged : current;
};

const homeCacheSignature = (cache: Omit<HomeSessionCache, "version" | "savedAt">) => JSON.stringify({
  recommendedItems: cache.recommendedItems.map(itemVisualKey),
  popularItems: cache.popularItems.map(itemVisualKey),
  favorites: [...cache.favorites].sort(),
  hiddenTransactionItemIds: [...cache.hiddenTransactionItemIds].sort(),
  totalVisiblePopularCount: cache.totalVisiblePopularCount,
  totalRecommendedCount: cache.totalRecommendedCount,
  hasMore: cache.hasMore,
  hasMoreRecommended: cache.hasMoreRecommended,
});

const sameStringArray = (a: string[], b: string[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

export default function HomeClient({ items: initialRecommendedItems, popularItems: initialPopularItems, totalPopularCount, demoPreview = false, demoItemHrefPrefix, appReviewDemo = false, active = true }: HomeClientProps) {
  const { user, avatarUrl, loading, profileReady, isAppReviewDemo } = useAuth();
  const { t } = useI18n();
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recommendedMobileLayout, setRecommendedMobileLayout] = useState<MobileHomeLayout>("square");
  const [popularMobileLayout, setPopularMobileLayout] = useState<MobileHomeLayout>("square");
  const isOfficialAdminHomeView = user?.email?.toLowerCase() === "textnextbbs@gmail.com";
  const shouldUseAdminAvatarFrame = demoPreview || isOfficialAdminHomeView;
  const itemDemoFilter = demoPreview ? true : (appReviewDemo || isAppReviewDemo);
  const homeDataReady = demoPreview || (!loading && profileReady);
  
  // 各アイテムの状態管理（サーバーのキャッシュを上書きできるようにState化）
  const [recommendedItems, setRecommendedItems] = useState<Item[]>(initialRecommendedItems);
  const [popularItems, setPopularItems] = useState<Item[]>(initialPopularItems);
  const [totalVisiblePopularCount, setTotalVisiblePopularCount] = useState(totalPopularCount);
  const [hiddenTransactionItemIds, setHiddenTransactionItemIds] = useState<Set<string>>(new Set());
  
  const [loadingRecommended, setLoadingRecommended] = useState(false);
  const [loadingMoreRecommended, setLoadingMoreRecommended] = useState(false);
  const [hasMoreRecommended, setHasMoreRecommended] = useState(false); // 初期はサーバーサイドの10件
  const [totalRecommendedCount, setTotalRecommendedCount] = useState(initialRecommendedItems.length);
  const [profileAvatar, setProfileAvatar] = useState<{
    listingCount: number;
    earlyRegistration: boolean;
  }>({
    listingCount: 0,
    earlyRegistration: false,
  });

  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(initialPopularItems.length < totalPopularCount);
  // ログインユーザー向けのクライアント側再取得中フラグ。
  // サーバー描画 → クライアント再取得への差し替えで「取引中/相談中」などがちらつくのを防ぐ。
  const [loadingPopular, setLoadingPopular] = useState(!demoPreview && initialPopularItems.length === 0);
  const [backgroundRefreshing, setBackgroundRefreshing] = useState(false);
  const [pendingHomeData, setPendingHomeData] = useState<Omit<HomeSessionCache, "version" | "savedAt"> | null>(null);
  const requestIdRef = useRef(0);
  const homeRefreshInFlightRef = useRef(false);
  const initialHomeTopAppliedRef = useRef(false);
  // 「もっと見る」連続発火の防止。loadingMore(state)は反映が非同期なため、
  // 同一レンダー連続でガードをすり抜け、同じ行を二重取得することがある。
  const loadingMoreRef = useRef(false);
  const loadingMoreRecommendedRef = useRef(false);

  useEffect(() => {
    if (!active || demoPreview || initialHomeTopAppliedRef.current) return;
    initialHomeTopAppliedRef.current = true;

    const scrollTop = () => {
      if (window.location.hash) return;
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.scrollingElement?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    };

    requestAnimationFrame(scrollTop);
    window.setTimeout(scrollTop, 120);
  }, [active, demoPreview]);

  // タブレット/PC(md=768px以上)判定。リスト表示の件数を 16(4×4) / モバイル=7 に出し分けるために使う。
  const [isPc, setIsPc] = useState(false);
  // iPad縦(md=768〜1023px)判定。3列×7行=21件に出し分けるために使う。
  const [isTabletPortrait, setIsTabletPortrait] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const mqTablet = window.matchMedia("(min-width: 768px) and (max-width: 1023px)");
    const update = () => {
      setIsPc(mq.matches);
      setIsTabletPortrait(mqTablet.matches);
    };
    update();
    mq.addEventListener("change", update);
    mqTablet.addEventListener("change", update);
    return () => {
      mq.removeEventListener("change", update);
      mqTablet.removeEventListener("change", update);
    };
  }, []);
  const pageSizeFor = (layout: MobileHomeLayout) => {
    // iPad/PC(md=768px以上)はレイアウト切替が非表示で、列数はグリッドで決まるため
    // 端末判定を優先する（iPad縦=21 / iPad横・PC=16）。
    if (isTabletPortrait) return TABLET_PORTRAIT_ITEM_PAGE_SIZE;
    if (isPc) return PC_ITEM_PAGE_SIZE;
    // スマホ(<md)のみレイアウト切替に応じた件数。
    if (layout === "image") return 12; // 3列×4行
    if (layout === "square") return 12; // 3列×4行
    return HOME_ITEM_PAGE_SIZE;
  };
  const homeCacheKey = useMemo(() => {
    if (demoPreview) return null;
    const ownerKey = user?.id ? `user:${user.id}` : "guest";
    const modeKey = itemDemoFilter ? "demo" : "normal";
    const viewportKey = isTabletPortrait ? "tablet" : isPc ? "pc" : "mobile";
    return [
      "textnext:home:v",
      HOME_SESSION_CACHE_VERSION,
      ownerKey,
      modeKey,
      viewportKey,
      recommendedMobileLayout,
      popularMobileLayout,
    ].join(":");
  }, [demoPreview, user?.id, itemDemoFilter, isPc, isTabletPortrait, recommendedMobileLayout, popularMobileLayout]);

  const readHomeCache = useCallback((): HomeSessionCache | null => {
    if (!homeCacheKey || typeof window === "undefined") return null;

    try {
      const raw = window.localStorage.getItem(homeCacheKey) ?? window.sessionStorage.getItem(homeCacheKey);
      if (!raw) return null;

      const parsed = JSON.parse(raw) as Partial<HomeSessionCache>;
      if (
        parsed.version !== HOME_SESSION_CACHE_VERSION ||
        typeof parsed.savedAt !== "number" ||
        Date.now() - parsed.savedAt > HOME_SESSION_CACHE_TTL_MS ||
        !Array.isArray(parsed.recommendedItems) ||
        !Array.isArray(parsed.popularItems)
      ) {
        window.localStorage.removeItem(homeCacheKey);
        window.sessionStorage.removeItem(homeCacheKey);
        return null;
      }

      return {
        version: HOME_SESSION_CACHE_VERSION,
        savedAt: parsed.savedAt,
        recommendedItems: parsed.recommendedItems as Item[],
        popularItems: parsed.popularItems as Item[],
        favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
        hiddenTransactionItemIds: Array.isArray(parsed.hiddenTransactionItemIds) ? parsed.hiddenTransactionItemIds : [],
        totalVisiblePopularCount: typeof parsed.totalVisiblePopularCount === "number" ? parsed.totalVisiblePopularCount : parsed.popularItems.length,
        totalRecommendedCount: typeof parsed.totalRecommendedCount === "number" ? parsed.totalRecommendedCount : parsed.recommendedItems.length,
        hasMore: Boolean(parsed.hasMore),
        hasMoreRecommended: Boolean(parsed.hasMoreRecommended),
      };
    } catch (err) {
      console.warn("Failed to read home cache:", err);
      window.localStorage.removeItem(homeCacheKey);
      window.sessionStorage.removeItem(homeCacheKey);
      return null;
    }
  }, [homeCacheKey]);

  const applyHomeCache = useCallback((cache: HomeSessionCache) => {
    setRecommendedItems((current) => mergeStableItems(current, cache.recommendedItems));
    setPopularItems((current) => mergeStableItems(current, cache.popularItems));
    setFavorites((current) => sameStringArray(current, cache.favorites) ? current : cache.favorites);
    setHiddenTransactionItemIds((current) => {
      const currentValues = Array.from(current).sort();
      const nextValues = [...cache.hiddenTransactionItemIds].sort();
      return sameStringArray(currentValues, nextValues) ? current : new Set(cache.hiddenTransactionItemIds);
    });
    setTotalVisiblePopularCount((current) => current === cache.totalVisiblePopularCount ? current : cache.totalVisiblePopularCount);
    setTotalRecommendedCount((current) => current === cache.totalRecommendedCount ? current : cache.totalRecommendedCount);
    setHasMore((current) => current === cache.hasMore ? current : cache.hasMore);
    setHasMoreRecommended((current) => current === cache.hasMoreRecommended ? current : cache.hasMoreRecommended);
    setLoadingRecommended(false);
    setLoadingPopular(false);
  }, []);

  const homeStateRef = useRef<Omit<HomeSessionCache, "version" | "savedAt">>({
    recommendedItems: initialRecommendedItems,
    popularItems: initialPopularItems,
    favorites: [],
    hiddenTransactionItemIds: [],
    totalVisiblePopularCount: totalPopularCount,
    totalRecommendedCount: initialRecommendedItems.length,
    hasMore: initialPopularItems.length < totalPopularCount,
    hasMoreRecommended: false,
  });

  useEffect(() => {
    homeStateRef.current = {
      recommendedItems,
      popularItems,
      favorites,
      hiddenTransactionItemIds: Array.from(hiddenTransactionItemIds),
      totalVisiblePopularCount,
      totalRecommendedCount,
      hasMore,
      hasMoreRecommended,
    };
  }, [
    recommendedItems,
    popularItems,
    favorites,
    hiddenTransactionItemIds,
    totalVisiblePopularCount,
    totalRecommendedCount,
    hasMore,
    hasMoreRecommended,
  ]);

  const applyPendingHomeData = useCallback(() => {
    if (!pendingHomeData) return;
    applyHomeCache({
      version: HOME_SESSION_CACHE_VERSION,
      savedAt: Date.now(),
      ...pendingHomeData,
    });
    setPendingHomeData(null);
  }, [applyHomeCache, pendingHomeData]);

  // Pull-to-Refresh
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const touchStartY = useRef(0);
  const isPulling = useRef(false);
  const PULL_START_TOLERANCE = 8;
  const PULL_THRESHOLD = 70;
  const PULL_MAX_DISTANCE = 128;

  // お気に入りセットをメモ化
  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);
  const visibleRecommendedItems = useMemo(
    () => recommendedItems.filter((item) => !hiddenTransactionItemIds.has(item.id)),
    [recommendedItems, hiddenTransactionItemIds]
  );
  const displayedPopularItems = useMemo(
    () => popularItems.filter((item) => !hiddenTransactionItemIds.has(item.id)),
    [popularItems, hiddenTransactionItemIds]
  );

  // Guest: limit both sections to GUEST_ITEM_LIMIT items
  const isGuest = !user && !demoPreview;
  const guestLimitedRecommendedItems = useMemo(
    () => (isGuest ? visibleRecommendedItems.slice(0, GUEST_ITEM_LIMIT) : visibleRecommendedItems),
    [isGuest, visibleRecommendedItems]
  );
  const guestLimitedPopularItems = useMemo(
    () => (isGuest ? displayedPopularItems.slice(0, GUEST_ITEM_LIMIT) : displayedPopularItems),
    [isGuest, displayedPopularItems]
  );
  const shouldAnimateFavorite = !backgroundRefreshing && !loadingPopular && !loadingRecommended;

  useEffect(() => {
    if (!active || demoPreview || typeof window === "undefined") return;
    if (document.documentElement.classList.contains("capacitor-native")) return;
    if (displayedPopularItems.length === 0 && visibleRecommendedItems.length === 0) return;

    const connection = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }).connection;
    if (connection?.saveData || ["slow-2g", "2g"].includes(connection?.effectiveType || "")) {
      return;
    }

    const isSmallScreen = window.matchMedia("(max-width: 767px)").matches;
    const preloadLimit = isSmallScreen ? 18 : 36;
    const urls = Array.from(new Set(
      [...visibleRecommendedItems, ...displayedPopularItems]
        .slice(0, preloadLimit)
        .map((item) => getItemImageUrl(item, "front", "thumbnail"))
        .filter((url): url is string => Boolean(url))
    ));
    if (urls.length === 0) return;

    const preload = () => {
      urls.forEach((url, index) => {
        window.setTimeout(() => {
          const image = new window.Image();
          image.decoding = "async";
          image.src = url;
        }, index * 45);
      });
    };

    if ("requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(preload, { timeout: 1600 });
      return () => window.cancelIdleCallback(idleId);
    }

    const timer = globalThis.setTimeout(preload, 600);
    return () => globalThis.clearTimeout(timer);
  }, [active, demoPreview, displayedPopularItems, visibleRecommendedItems]);

  useEffect(() => {
    if (!homeCacheKey || !homeDataReady || loadingPopular || loadingRecommended) return;
    if (recommendedItems.length === 0 && popularItems.length === 0) return;

    try {
      const payload: HomeSessionCache = {
        version: HOME_SESSION_CACHE_VERSION,
        savedAt: Date.now(),
        recommendedItems,
        popularItems,
        favorites,
        hiddenTransactionItemIds: Array.from(hiddenTransactionItemIds),
        totalVisiblePopularCount,
        totalRecommendedCount,
        hasMore,
        hasMoreRecommended,
      };
      const serialized = JSON.stringify(payload);
      window.localStorage.setItem(homeCacheKey, serialized);
      window.sessionStorage.setItem(homeCacheKey, serialized);
    } catch (err) {
      console.warn("Failed to save home cache:", err);
    }
  }, [
    homeCacheKey,
    homeDataReady,
    loadingPopular,
    loadingRecommended,
    recommendedItems,
    popularItems,
    favorites,
    hiddenTransactionItemIds,
    totalVisiblePopularCount,
    totalRecommendedCount,
    hasMore,
    hasMoreRecommended,
  ]);

  useEffect(() => {
    if (demoPreview) {
      setProfileAvatar({ listingCount: 0, earlyRegistration: false });
      return;
    }

    if (!user) {
      setProfileAvatar({ listingCount: 0, earlyRegistration: false });
      return;
    }

    const loadProfileAvatarRewards = async () => {
      try {
        const [
          { count: listingCount },
          { data: rewardSetting },
          { data: rewardOverride },
        ] = await Promise.all([
          supabase
            .from("items")
            .select("*", { count: "exact", head: true })
            .eq("seller_id", user.id)
            .neq("status", "deleted")
            .eq("is_demo", false),
          (supabase as any)
            .from("reward_settings")
            .select("*")
            .eq("id", "early_registration")
            .single(),
          (supabase as any)
            .from("user_reward_overrides")
            .select("early_registration_override")
            .eq("user_id", user.id)
            .maybeSingle(),
        ]);

        setProfileAvatar({
          listingCount: listingCount ?? 0,
          earlyRegistration: resolveEarlyRegistrationEligible(
            user.created_at,
            rewardSetting as RewardSetting | null,
            rewardOverride as RewardOverride | null
          ),
        });
      } catch (err) {
        console.error("Error loading profile avatar rewards:", err);
      }
    };

    void loadProfileAvatarRewards();
  }, [user, demoPreview]);

  // 初期表示時にお気に入り & パーソナライズされたおすすめをロード
  useEffect(() => {
    if (homeRefreshInFlightRef.current) return;

    const requestId = ++requestIdRef.current;
    let cancelled = false;
    homeRefreshInFlightRef.current = true;

    const fetchData = async () => {
      try {
        if (!homeDataReady) {
          setLoadingPopular(true);
          setBackgroundRefreshing(false);
          return;
        }

        if (demoPreview) {
          setFavorites([]);
          setRecommendedItems((current) => mergeStableItems(current, initialRecommendedItems));
          setPopularItems((current) => mergeStableItems(current, initialPopularItems));
          setTotalVisiblePopularCount(totalPopularCount);
          setHasMore(false);
          setHasMoreRecommended(false);
          setTotalRecommendedCount(initialRecommendedItems.length);
          setHiddenTransactionItemIds((current) => current.size === 0 ? current : new Set());
          setLoadingRecommended(false);
          setLoadingPopular(false);
          setBackgroundRefreshing(false);
          return;
        }

        const cachedHome = readHomeCache();
        const cachedHomeApplied = Boolean(cachedHome);
        const displayedHome = cachedHome
          ? {
              recommendedItems: cachedHome.recommendedItems,
              popularItems: cachedHome.popularItems,
              favorites: cachedHome.favorites,
              hiddenTransactionItemIds: cachedHome.hiddenTransactionItemIds,
              totalVisiblePopularCount: cachedHome.totalVisiblePopularCount,
              totalRecommendedCount: cachedHome.totalRecommendedCount,
              hasMore: cachedHome.hasMore,
              hasMoreRecommended: cachedHome.hasMoreRecommended,
            }
          : homeStateRef.current;

        if (cachedHome) {
          applyHomeCache(cachedHome);
          setBackgroundRefreshing(true);
        } else {
          setBackgroundRefreshing(false);
        }

        const stageIfNeeded = (next: Omit<HomeSessionCache, "version" | "savedAt">) => {
          if (!cachedHomeApplied) {
            applyHomeCache({
              version: HOME_SESSION_CACHE_VERSION,
              savedAt: Date.now(),
              ...next,
            });
            setPendingHomeData(null);
            return;
          }

          if (homeCacheSignature(displayedHome) !== homeCacheSignature(next)) {
            setPendingHomeData(next);
          } else {
            setPendingHomeData(null);
          }
        };

        // ログインユーザーは「みんなの出品」をクライアント側で再取得するため、
        // 完了までスピナーを表示してサーバー描画データのちらつきを隠す。
        if (user && !cachedHomeApplied) {
          setLoadingPopular(true);
        }

        if (!user) {
          setFavorites([]);
          setRecommendedItems([]);
          setHasMoreRecommended(false);
          setTotalRecommendedCount(0);
          setHiddenTransactionItemIds((current) => current.size === 0 ? current : new Set());
          setLoadingRecommended(false);

          if (!cachedHomeApplied) {
            setLoadingPopular(true);
          }
          const initialVisiblePopularCount = pageSizeFor(popularMobileLayout);
          const { data: visiblePopular, count: visiblePopularCount, error: visiblePopularError } = await supabase
            .from("items")
            .select("id, title, selling_price, status, front_image_url, front_thumbnail_url, front_image_storage_path, front_thumbnail_storage_path, image_storage_provider, seller_id, favorites(count)", { count: "exact" })
            .in("status", ["available", "trading"])
            .eq("is_demo", itemDemoFilter)
            .order("created_at", { ascending: false })
            .range(0, initialVisiblePopularCount - 1);

          if (cancelled || requestId !== requestIdRef.current) return;

          if (!visiblePopularError && visiblePopular) {
            const mapped = (visiblePopular as any[]).map(item => ({
              ...item,
              favorite_count: item.favorites?.[0]?.count || 0,
              favorites: undefined,
            })) as Item[];
            stageIfNeeded({
              recommendedItems: [],
              popularItems: mapped,
              favorites: [],
              hiddenTransactionItemIds: [],
              totalVisiblePopularCount: visiblePopularCount || 0,
              totalRecommendedCount: 0,
              hasMore: mapped.length < (visiblePopularCount || 0),
              hasMoreRecommended: false,
            });
          } else {
            stageIfNeeded({
              recommendedItems: [],
              popularItems: [],
              favorites: [],
              hiddenTransactionItemIds: [],
              totalVisiblePopularCount: 0,
              totalRecommendedCount: 0,
              hasMore: false,
              hasMoreRecommended: false,
            });
          }

          setLoadingPopular(false);
          setBackgroundRefreshing(false);
          return;
        }

        // 1. お気に入り状態のロード & 最新カウントの取得
        const itemIds = [
          ...displayedHome.recommendedItems.map(i => i.id),
          ...displayedHome.popularItems.map(i => i.id)
        ];
      
        const countPromise = itemIds.length > 0
          ? supabase
            .from("items")
            .select("id, favorites(count)")
            .in("id", itemIds)
            .in("status", ["available", "trading"]) // 削除済み・売却済みは除外し、相談中は表示継続
            .eq("is_demo", itemDemoFilter)
          : Promise.resolve(null);

      const shouldLoadPersonalData = user && !isOfficialAdminHomeView;
      if (shouldLoadPersonalData && !cachedHomeApplied) {
        setLoadingRecommended(true);
      }

      const favoritesPromise = shouldLoadPersonalData
        ? supabase
          .from("favorites")
          .select("item_id")
          .eq("user_id", user.id)
        : Promise.resolve(null);

      const profilePromise = shouldLoadPersonalData
        ? supabase
          .from("profiles")
          .select("department, major")
          .eq("user_id", user.id)
          .single()
        : Promise.resolve(null);

      const [countRes, favRes, profileRes] = await Promise.all([
        countPromise,
        favoritesPromise,
        profilePromise,
      ]) as any[];
      if (cancelled || requestId !== requestIdRef.current) return;

      let nextRecommendedItems = displayedHome.recommendedItems;
      let nextPopularItems = displayedHome.popularItems;
      let nextFavorites = displayedHome.favorites;
      let nextHiddenTransactionItemIds = displayedHome.hiddenTransactionItemIds;
      let nextTotalVisiblePopularCount = displayedHome.totalVisiblePopularCount;
      let nextTotalRecommendedCount = displayedHome.totalRecommendedCount;
      let nextHasMore = displayedHome.hasMore;
      let nextHasMoreRecommended = displayedHome.hasMoreRecommended;

      // カウントの反映 & 削除されたアイテムのフィルタリング
      if (countRes?.data) {
        const validItemIds = new Set((countRes.data as any[]).map((i: any) => i.id));
        const countMap = new Map((countRes.data as any[]).map((i: any) => [i.id, i.favorites?.[0]?.count || 0]));
        
        const updateItemCounts = (prev: Item[]) => prev
          .filter(item => validItemIds.has(item.id)) // 削除されたアイテムを除外
          .map(item => {
            const nextFavoriteCount = countMap.get(item.id) ?? item.favorite_count;
            return nextFavoriteCount === item.favorite_count
              ? item
              : { ...item, favorite_count: nextFavoriteCount };
          });
        
        nextRecommendedItems = updateItemCounts(nextRecommendedItems);
        nextPopularItems = updateItemCounts(nextPopularItems);
      }

      // お気に入り状態の反映
      if (user && favRes?.data && Array.isArray(favRes.data)) {
        nextFavorites = favRes.data.map((f: any) => f.item_id);
      } else if (!user) {
        nextFavorites = [];
        nextRecommendedItems = [];
        nextHasMoreRecommended = false;
        nextTotalRecommendedCount = 0;
        nextPopularItems = mergeStableItems(nextPopularItems, initialPopularItems);
        nextTotalVisiblePopularCount = totalPopularCount;
        nextHasMore = initialPopularItems.length < totalPopularCount;
        setLoadingRecommended(false);
      }

      if (user) {
        const { data: activeTransactions, error: activeTransactionsError } = await (supabase
          .from("transactions") as any)
          .select("item_id")
          .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
          .in("status", ACTIVE_TRANSACTION_STATUSES);

        if (!cancelled && requestId === requestIdRef.current && !activeTransactionsError) {
          nextHiddenTransactionItemIds = (activeTransactions ?? []).map((tx: any) => tx.item_id).filter(Boolean);
        }

        let popularQuery = supabase
          .from("items")
          .select("id, title, selling_price, status, front_image_url, front_thumbnail_url, front_image_storage_path, front_thumbnail_storage_path, image_storage_provider, seller_id, favorites(count)", { count: "exact" })
          .in("status", ["available", "trading"])
          .eq("is_demo", itemDemoFilter)
          .order("created_at", { ascending: false });
        if (!appReviewDemo) {
          popularQuery = popularQuery.neq("seller_id", user.id);
        }

        const initialVisiblePopularCount = pageSizeFor(popularMobileLayout);
        const { data: visiblePopular, count: visiblePopularCount, error: visiblePopularError } = await popularQuery.range(0, initialVisiblePopularCount - 1);

        if (!visiblePopularError && visiblePopular) {
          if (cancelled || requestId !== requestIdRef.current) return;
          const mapped = (visiblePopular as any[]).map(item => ({
            ...item,
            favorite_count: item.favorites?.[0]?.count || 0,
            favorites: undefined,
          })) as Item[];
          nextPopularItems = mergeStableItems(nextPopularItems, mapped);
          nextTotalVisiblePopularCount = visiblePopularCount || 0;
          nextHasMore = mapped.length < (visiblePopularCount || 0);
        }
      }

      // 2. パーソナライズされたおすすめの取得
      if (isOfficialAdminHomeView) {
        nextRecommendedItems = [];
        nextHasMoreRecommended = false;
        nextTotalRecommendedCount = 0;
        setLoadingRecommended(false);
      } else if (user && profileRes?.data) {
        const { department, major } = profileRes.data as any;
        
        let query = supabase
          .from("items")
            .select("id, title, selling_price, status, front_image_url, front_thumbnail_url, front_image_storage_path, front_thumbnail_storage_path, image_storage_provider, favorites(count), profiles!inner(department, major)", { count: 'exact' })
          .in("status", ["available", "trading"])
          .eq("is_demo", itemDemoFilter)
          .eq("profiles.department", department);
        if (!appReviewDemo) {
          query = query.neq("seller_id", user.id);
        }
        
        if (major) {
          query = query.eq("profiles.major", major);
        }
        
        const { data: majorData, count, error } = await query
          .order("created_at", { ascending: false })
          .limit(HOME_ITEM_PAGE_SIZE);

        if (!error && majorData) {
          if (cancelled || requestId !== requestIdRef.current) return;

          const personalized = (majorData as any[]).map(item => ({
            ...item,
            favorite_count: item.favorites?.[0]?.count || 0
          })) as Item[];
          
          nextRecommendedItems = mergeStableItems(nextRecommendedItems, personalized);
          nextTotalRecommendedCount = count || 0;
          nextHasMoreRecommended = (count || 0) > personalized.length;
        }
      }

      if (user) {
        stageIfNeeded({
          recommendedItems: nextRecommendedItems,
          popularItems: nextPopularItems,
          favorites: nextFavorites,
          hiddenTransactionItemIds: nextHiddenTransactionItemIds,
          totalVisiblePopularCount: nextTotalVisiblePopularCount,
          totalRecommendedCount: nextTotalRecommendedCount,
          hasMore: nextHasMore,
          hasMoreRecommended: nextHasMoreRecommended,
        });
        setLoadingRecommended(false);
        setLoadingPopular(false);
        setBackgroundRefreshing(false);
      }
      } finally {
        homeRefreshInFlightRef.current = false;
      }
    };

    fetchData();
    return () => {
      cancelled = true;
      homeRefreshInFlightRef.current = false;
    };
  }, [
    user,
    homeDataReady,
    itemDemoFilter,
    initialRecommendedItems,
    initialPopularItems,
    totalPopularCount,
    isOfficialAdminHomeView,
    appReviewDemo,
    demoPreview,
    popularMobileLayout,
    readHomeCache,
    applyHomeCache,
  ]); // userが変わった時（ログイン/ログアウト）に再実行

  const favoriteStateRef = useRef<Set<string>>(new Set(favorites));
  const favoriteSyncTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const loginPrompt = useLoginRequiredPrompt();
  const [loginPromptItemId, setLoginPromptItemId] = useState<string | null>(null);

  useEffect(() => {
    favoriteStateRef.current = new Set(favorites);
  }, [favorites]);

  const toggleFavorite = useCallback((id: string) => {
    if (!user) {
      setLoginPromptItemId(id);
      loginPrompt.show();
      return;
    }

    const wasFavorite = favoriteStateRef.current.has(id);
    const shouldFavorite = !wasFavorite;

    if (shouldFavorite) {
      favoriteStateRef.current.add(id);
    } else {
      favoriteStateRef.current.delete(id);
    }

    // 楽観的UI更新
    setFavorites(prev => 
      shouldFavorite
        ? (prev.includes(id) ? prev : [...prev, id])
        : prev.filter(favId => favId !== id)
    );

    // カウントの見た目上の調整
    const delta = shouldFavorite ? 1 : -1;
    const updateCount = (prev: Item[]) => prev.map(item => {
      if (item.id === id) {
        return {
          ...item,
          favorite_count: Math.max(0, (item.favorite_count || 0) + delta)
        };
      }
      return item;
    });

    setRecommendedItems(prev => updateCount(prev));
    setPopularItems(prev => updateCount(prev));

    const existingTimer = favoriteSyncTimersRef.current.get(id);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(async () => {
      try {
        if (shouldFavorite) {
          await (supabase
            .from("favorites") as any)
            .upsert({ user_id: user.id, item_id: id }, { onConflict: 'user_id,item_id' });
        } else {
          await (supabase
            .from("favorites") as any)
            .delete()
            .match({ user_id: user.id, item_id: id });
        }
      } catch (err) {
        console.error("Favorite sync failed:", err);
        if (favoriteStateRef.current.has(id) === shouldFavorite) {
          if (wasFavorite) {
            favoriteStateRef.current.add(id);
          } else {
            favoriteStateRef.current.delete(id);
          }
          setFavorites(prev =>
            wasFavorite
              ? (prev.includes(id) ? prev : [...prev, id])
              : prev.filter(favId => favId !== id)
          );
          const rollbackDelta = wasFavorite ? 1 : -1;
          const rollbackCount = (prev: Item[]) => prev.map(item =>
            item.id === id
              ? { ...item, favorite_count: Math.max(0, (item.favorite_count || 0) + rollbackDelta) }
              : item
          );
          setRecommendedItems(prev => rollbackCount(prev));
          setPopularItems(prev => rollbackCount(prev));
        }
      } finally {
        favoriteSyncTimersRef.current.delete(id);
      }
    }, 220);

    favoriteSyncTimersRef.current.set(id, timer);
  }, [user, loginPrompt]);

  const loadMoreRecommended = async (requestedCount = pageSizeFor(recommendedMobileLayout)) => {
    if (loadingMoreRecommendedRef.current || loadingMoreRecommended || !hasMoreRecommended || !user) return;

    loadingMoreRecommendedRef.current = true;
    setLoadingMoreRecommended(true);
    try {
      const currentLength = recommendedItems.length;
      
      // ユーザーの所属情報を再取得（またはStateから持ってくる）
      const { data: profile } = await supabase
        .from("profiles")
        .select("department, major")
        .eq("user_id", user.id)
        .single();

      if (profile) {
        let query = supabase
          .from("items")
          .select("id, title, selling_price, status, front_image_url, front_thumbnail_url, front_image_storage_path, front_thumbnail_storage_path, image_storage_provider, favorites(count), profiles!inner(department, major)")
          .in("status", ["available", "trading"])
          .eq("is_demo", itemDemoFilter)
          .eq("profiles.department", (profile as any).department);
        if (!appReviewDemo) {
          query = query.neq("seller_id", user.id);
        }
        
        if ((profile as any).major) {
          query = query.eq("profiles.major", (profile as any).major);
        }

        const { data, error } = await query
          .order("created_at", { ascending: false })
          .range(currentLength, currentLength + requestedCount - 1);

        if (!error && data) {
          const newItems = (data as any[]).map(item => ({
            ...item,
            favorite_count: item.favorites?.[0]?.count || 0
          })) as Item[];
          setRecommendedItems(prev => {
            const existing = new Set(prev.map(item => item.id));
            const deduped = newItems.filter(item => !existing.has(item.id));
            return [...prev, ...deduped];
          });
          if (currentLength + newItems.length >= totalRecommendedCount || newItems.length < requestedCount) {
            setHasMoreRecommended(false);
          }
        }
      }
    } catch (err) {
      console.error("Error loading more recommended items:", err);
    } finally {
      loadingMoreRecommendedRef.current = false;
      setLoadingMoreRecommended(false);
    }
  };

  const loadMorePopular = async (requestedCount = pageSizeFor(popularMobileLayout)) => {
    if (loadingMoreRef.current || loadingMore || !hasMore) return;

    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const currentLength = popularItems.length;
      let query = supabase
        .from("items")
        .select("id, title, selling_price, status, front_image_url, front_thumbnail_url, front_image_storage_path, front_thumbnail_storage_path, image_storage_provider, seller_id, favorites(count)")
        .in("status", ["available", "trading"])
        .eq("is_demo", itemDemoFilter)
        .order("created_at", { ascending: false });

      if (user && !appReviewDemo) {
        query = query.neq("seller_id", user.id);
      }

      const { data, error } = await query.range(currentLength, currentLength + requestedCount - 1);

      if (!error && data) {
        const newItems = (data as any[]).map(item => ({
          ...item,
          favorite_count: item.favorites?.[0]?.count || 0
        })) as Item[];
        setPopularItems(prev => {
          const existing = new Set(prev.map(item => item.id));
          const deduped = newItems.filter(item => !existing.has(item.id));
          return [...prev, ...deduped];
        });
        if (currentLength + newItems.length >= totalVisiblePopularCount || newItems.length < requestedCount) {
          setHasMore(false);
        }
      }
    } catch (err) {
      console.error("Error loading more items:", err);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    const recommendedTargetCount = pageSizeFor(recommendedMobileLayout);
    const popularTargetCount = pageSizeFor(popularMobileLayout);

    if (
      user &&
      !isOfficialAdminHomeView &&
      recommendedItems.length > 0 &&
      visibleRecommendedItems.length < recommendedTargetCount &&
      hasMoreRecommended &&
      !loadingMoreRecommended
    ) {
      void loadMoreRecommended(recommendedTargetCount - visibleRecommendedItems.length);
    }

    if (displayedPopularItems.length < popularTargetCount && hasMore && !loadingMore) {
      void loadMorePopular(popularTargetCount - displayedPopularItems.length);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    recommendedMobileLayout,
    popularMobileLayout,
    user?.id,
    isOfficialAdminHomeView,
    recommendedItems.length,
    popularItems.length,
    visibleRecommendedItems.length,
    displayedPopularItems.length,
    hasMoreRecommended,
    hasMore,
    loadingMoreRecommended,
    loadingMore,
    isPc,
    isTabletPortrait,
  ]);

  // Pull-to-Refresh handlers
  const handleTouchStart = useCallback((e: ReactTouchEvent) => {
    // スクロール可能なボード内で始まったジェスチャーは、ボード自身のスクロール。
    // ここで pull-to-refresh を起動すると、ボード内スクロール中に
    // 一覧が1ページ目へ再取得され「もっと見る」が巻き戻るため除外する。
    if ((e.target as HTMLElement | null)?.closest("[data-home-board]")) return;
    if (window.scrollY <= PULL_START_TOLERANCE && !isRefreshing) {
      touchStartY.current = e.touches[0].clientY;
      isPulling.current = true;
    }
  }, [isRefreshing]);

  const handleTouchMove = useCallback((e: ReactTouchEvent) => {
    if (!isPulling.current || isRefreshing) return;
    const diff = e.touches[0].clientY - touchStartY.current;
    if (diff > 0 && window.scrollY <= PULL_START_TOLERANCE) {
      if (diff > 6) {
        e.preventDefault();
      }
      const easedDistance = Math.min(PULL_MAX_DISTANCE, Math.pow(diff, 0.88) * 0.72);
      setPullDistance(easedDistance);
    } else if (diff <= 0) {
      setPullDistance(0);
    }
  }, [isRefreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling.current) return;
    isPulling.current = false;

    if (pullDistance >= PULL_THRESHOLD && !isRefreshing) {
      setIsRefreshing(true);
      setPullDistance(PULL_THRESHOLD);

      try {
        // みんなの出品を再取得
        let popularQuery = supabase
          .from("items")
          .select("id, title, selling_price, status, front_image_url, front_thumbnail_url, front_image_storage_path, front_thumbnail_storage_path, image_storage_provider, seller_id, favorites(count)", { count: "exact" })
          .in("status", ["available", "trading"])
          .eq("is_demo", itemDemoFilter)
          .order("created_at", { ascending: false });

        if (user && !appReviewDemo) {
          popularQuery = popularQuery.neq("seller_id", user.id);
        }

        const refreshCount = pageSizeFor(popularMobileLayout);
        const { data: freshPopular, count: freshPopularCount } = await popularQuery.range(0, refreshCount - 1);

        if (freshPopular) {
          const mapped = (freshPopular as any[]).map(item => ({
            ...item,
            favorite_count: item.favorites?.[0]?.count || 0,
            favorites: undefined
          })) as Item[];
          setPopularItems((current) => mergeStableItems(current, mapped));
          setTotalVisiblePopularCount(freshPopularCount || 0);
          setHasMore(mapped.length < (freshPopularCount || 0));
        }
      } catch (err) {
        console.error("Refresh error:", err);
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, isRefreshing, user, popularMobileLayout]);

  return (
    <div
      className="min-h-screen bg-white pb-4 font-gentle touch-pan-y"
      onTouchStart={demoPreview || !active ? undefined : handleTouchStart}
      onTouchMove={demoPreview || !active ? undefined : handleTouchMove}
      onTouchEnd={demoPreview || !active ? undefined : handleTouchEnd}
      aria-hidden={!active}
    >
      <BackgroundRefreshBanner
        visible={backgroundRefreshing && !isRefreshing}
        hasUpdate={Boolean(pendingHomeData)}
        onApplyUpdate={applyPendingHomeData}
      />

      {/* Pull-to-Refresh Indicator */}
      {!demoPreview && (
        <div
          className="flex items-center justify-center overflow-hidden will-change-[height,opacity]"
          style={{
            height: pullDistance > 0 ? `${pullDistance}px` : '0px',
            opacity: Math.min(pullDistance / PULL_THRESHOLD, 1),
          }}
        >
          <RefreshCw
            className={`w-6 h-6 text-primary transition-transform duration-200 ${isRefreshing ? 'animate-spin' : ''}`}
            style={{
              transform: isRefreshing ? undefined : `rotate(${pullDistance * 3}deg)`,
            }}
          />
          <span className="ml-2 text-sm text-gray-500 font-medium">
            {isRefreshing ? t('home.refreshing') : pullDistance >= PULL_THRESHOLD ? t('home.pull_to_refresh') : t('home.pull_to_refresh')}
          </span>
        </div>
      )}

      {/* CSS for animations */}
      <style jsx global>{`
        @keyframes slideInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-slide-in-up {
          animation: slideInUp 0.4s ease-out forwards;
          opacity: 0;
        }
        ${demoPreview || !active ? "" : `
        :root {
          --home-snap-extra-offset: 0rem;
        }
        /* ホーム表示中のみ、ページ全体（親レイアウト）のスクロールもセクション単位でスナップ吸着させる。
           styled-jsx の global はこのコンポーネントのマウント中だけ html に適用され、離脱時に解除される。
           固定ヘッダー分は scroll-padding-top で吸収する。 */
        html {
          scroll-snap-type: y mandatory;
          scroll-padding-top: calc(var(--app-top-offset) + var(--home-snap-extra-offset));
          scroll-behavior: smooth;
        }
        html.capacitor-native {
          --home-snap-extra-offset: 3.0rem;/* 値を大きくすればみんなの出品周辺固定位置が下がる */
          scroll-snap-type: y proximity;
          scroll-padding-top: calc(var(--app-top-offset) + var(--home-snap-extra-offset));
        }
        html.capacitor-native [data-home-board] {
          scroll-snap-type: y proximity;
          -webkit-overflow-scrolling: touch;
          scroll-padding-top: 0.75rem;
        }
        /* PC(lg以上)は固定の共通ヘッダー分(h-20=5rem)も吸着位置に加算し、
           セクション見出しがヘッダー裏に隠れないようにする。 */
        @media (min-width: 1024px) {
          html {
            scroll-padding-top: calc(var(--app-top-offset) + 5rem + var(--home-snap-extra-offset));
          }
        }
        `}
      `}</style>

      {/* Header（PCでは共通のDesktopHeaderに集約するため非表示） */}
      <header className={`${demoPreview ? "" : "lg:hidden"} bg-white px-6 pt-6 pb-4 border-b snap-start`}>
        <div className="flex items-end justify-between mb-4">
          <div className="flex flex-col">
            <h1 className="text-2xl font-bold gradient-text-blue leading-none tracking-tight">
              TextNext
            </h1>
            <div className="flex items-center gap-1 text-primary/80 mt-1">
              <BookOpen className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold tracking-tight">東工大生のための教科書フリマ</span>
            </div>
          </div>
          <div className="flex-shrink-0">
            {loading ? (
              <div className="w-10 h-10 bg-gray-100 rounded-full animate-pulse" />
            ) : user ? (
              <Link href="/profile" className="block transition-transform active:scale-95">
                <RewardAvatar
                  src={avatarUrl}
                  alt="プロフィール"
                  size={40}
                  listingCount={profileAvatar.listingCount}
                  earlyRegistration={profileAvatar.earlyRegistration}
                  adminFrame={shouldUseAdminAvatarFrame}
                />
              </Link>
            ) : (
              <Link
                href="/auth/login"
                className="px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 transition-all shadow-sm active:scale-95 whitespace-nowrap block"
              >
                {t('auth.login')}
              </Link>
            )}
          </div>
        </div>

        {/* Search Bar */}
        {isGuest ? (
          <GuestSearchGate placeholder={t('home.search_placeholder')} />
        ) : (
          <Link href="/search" className="block">
            <div className="relative group">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                <Search className="w-5 h-5 text-gray-400 group-hover:text-primary transition-colors" />
              </div>
              <input
                type="text"
                placeholder={t('home.search_placeholder')}
                className="w-full py-2 pl-12 pr-4 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none hover:border-primary/50 hover:bg-white transition-all cursor-pointer"
                readOnly
              />
            </div>
          </Link>
        )}

        {/* 分野から探す */}
        {isGuest ? (
          <GuestSubjectsGate />
        ) : (
          <Link
            href="/subjects"
            className="mt-2 flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 transition-all hover:border-primary/40 hover:bg-primary/10 active:scale-[0.99]"
          >
            <BookOpen className="h-5 w-5 flex-shrink-0 text-primary" />
            <span className="flex-1 text-sm font-bold text-gray-800">分野から探す</span>
            <span className="text-xs font-medium text-primary">学院・系で絞り込み ›</span>
          </Link>
        )}
      </header>

      {/* おすすめの教材 */}
      {((demoPreview && visibleRecommendedItems.length > 0) || (user && !isOfficialAdminHomeView) || (isGuest && guestLimitedRecommendedItems.length > 0)) && (
        <div className="px-6 py-8 snap-start">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold text-gray-900">
              {t('home.recommended')}
            </h2>
            {!isGuest && <MobileLayoutToggle value={recommendedMobileLayout} onChange={setRecommendedMobileLayout} />}
          </div>

          {loadingRecommended ? (
            <div className="text-center py-12">
              <div className="w-6 h-6 border-2 border-gray-200 border-t-primary rounded-full animate-spin mx-auto mb-3" />
              <p className="text-gray-500">おすすめを読み込み中...</p>
            </div>
          ) : visibleRecommendedItems.length === 0 && !hasMoreRecommended ? (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-4">同じ所属の出品はまだありません</p>
              {!isGuest && (
                <Link
                  href="/listing"
                  className="inline-block px-6 py-3 gradient-btn-blue rounded-xl font-semibold transition-all"
                >
                  最初の出品者になる
                </Link>
              )}
            </div>
          ) : (
            <>
              <div className="relative">
              <div data-home-board className={`${isGuest ? 'max-h-[60dvh]' : getBoardSizeClass(visibleRecommendedItems.length, pageSizeFor(recommendedMobileLayout), hasMoreRecommended)} overflow-y-auto rounded-2xl border border-gray-200 bg-gray-50/80 p-3 shadow-inner overscroll-contain ${isGuest ? 'overflow-hidden' : 'snap-y snap-mandatory scroll-pt-3 scroll-smooth'}`}>
                <div className={`grid gap-3 md:grid-cols-2 xl:grid-cols-4 ${
                  recommendedMobileLayout === "image" ? "grid-cols-3" : recommendedMobileLayout === "square" ? "grid-cols-3" : "grid-cols-1"
                }`}>
                  {guestLimitedRecommendedItems.map((item, index) => {
                    const showLoadMoreHere = !isGuest && hasMoreRecommended && index === guestLimitedRecommendedItems.length - 1;
                    return (
                    <div key={item.id} className="relative min-w-0 snap-start">
                      <HomeItemCard
                        item={item}
                        isFavorite={favoriteSet.has(item.id)}
                        animateFavorite={shouldAnimateFavorite}
                        onToggleFavorite={toggleFavorite}
                        showLoginPrompt={loginPrompt.visible && loginPromptItemId === item.id}
                        index={index}
                        mobileLayout={recommendedMobileLayout}
                        href={demoItemHrefPrefix ? `${demoItemHrefPrefix}/${item.id}/preview` : undefined}
                      />
                      {showLoadMoreHere && (
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-1/2 rounded-b-xl bg-gradient-to-t from-white/95 via-white/80 to-transparent lg:hidden" />
                      )}
                    </div>
                  )})}
                </div>
                {!isGuest && hasMoreRecommended && visibleRecommendedItems.length > 0 && (
                  <div className="relative z-30 -mt-12 lg:mt-6 flex justify-center pb-3 pointer-events-none">
                    <div className="pointer-events-auto">
                      <LoadMoreButton
                        loading={loadingMoreRecommended}
                        onClick={() => loadMoreRecommended()}
                        label={t('home.load_more')}
                        loadingLabel={t('home.loading')}
                      />
                    </div>
                  </div>
                )}
                {!isGuest && visibleRecommendedItems.length === 0 && hasMoreRecommended && (
                  <div className="flex h-full items-center justify-center">
                    <LoadMoreButton
                      loading={loadingMoreRecommended}
                      onClick={() => loadMoreRecommended()}
                      label={t('home.load_more')}
                      loadingLabel={t('home.loading')}
                    />
                  </div>
                )}
              </div>
              {/* Guest overlay for recommended section */}
              {isGuest && guestLimitedRecommendedItems.length > 0 && (
                <GuestGateOverlay />
              )}
              </div>
            </>
          )}
        </div>
      )}

      {/* みんなの出品 */}
      {(displayedPopularItems.length > 0 || hasMore || loading || loadingPopular || !homeDataReady) && (
        <div className="px-6 py-8 bg-gray-50 snap-start">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold text-gray-900">
              {t('home.everyones_listings')}
            </h2>
            <MobileLayoutToggle value={popularMobileLayout} onChange={setPopularMobileLayout} />
          </div>

          {(loading || loadingPopular || !homeDataReady) ? (
            <div className="text-center py-12">
              <div className="w-6 h-6 border-2 border-gray-200 border-t-primary rounded-full animate-spin mx-auto mb-3" />
              <p className="text-gray-500">出品を読み込み中...</p>
            </div>
          ) : (
            <>
              {/* 見出しとコンテナの間のスナップ吸着ポイント（コンテナ先頭に吸着）。 */}
              <div aria-hidden="true" className="snap-start scroll-mt-[var(--app-top-offset)]" />
              <div className="relative">
              <div data-home-board className={`${isGuest ? 'max-h-[60dvh]' : getBoardSizeClass(displayedPopularItems.length, pageSizeFor(popularMobileLayout), hasMore)} overflow-y-auto rounded-2xl border border-gray-200 bg-white p-3 shadow-inner overscroll-contain ${isGuest ? 'overflow-hidden' : 'snap-y snap-mandatory scroll-pt-3 scroll-smooth'}`}>
                <div className={`grid gap-3 md:grid-cols-3 lg:grid-cols-4 ${
                  popularMobileLayout === "image" ? "grid-cols-3" : popularMobileLayout === "square" ? "grid-cols-3" : "grid-cols-1"
                }`}>
                  {guestLimitedPopularItems.map((item, index) => {
                    return (
                    <div key={`popular-${item.id}`} className="relative min-w-0 snap-start">
                      <HomeItemCard
                        item={item}
                        isFavorite={favoriteSet.has(item.id)}
                        animateFavorite={shouldAnimateFavorite}
                        onToggleFavorite={toggleFavorite}
                        showLoginPrompt={loginPrompt.visible && loginPromptItemId === item.id}
                        index={index}
                        mobileLayout={popularMobileLayout}
                        href={demoItemHrefPrefix ? `${demoItemHrefPrefix}/${item.id}/preview` : undefined}
                      />
                    </div>
                  )})}
                </div>
                {!isGuest && displayedPopularItems.length === 0 && hasMore && (
                  <div className="flex h-full items-center justify-center">
                    <LoadMoreButton
                      loading={loadingMore}
                      onClick={() => loadMorePopular()}
                      label={t('home.load_more')}
                      loadingLabel={t('home.loading')}
                    />
                  </div>
                )}
              </div>
              {/* Guest overlay for popular section */}
              {isGuest && guestLimitedPopularItems.length > 0 && (
                <GuestGateOverlay message="すべての出品を見るには会員登録が必要です" />
              )}
              {!isGuest && hasMore && displayedPopularItems.length > 0 && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex items-end justify-center rounded-b-2xl bg-gradient-to-t from-white from-50% via-white/90 to-transparent px-3 pb-3 pt-12">
                  <div className="pointer-events-auto">
                    <LoadMoreButton
                      loading={loadingMore}
                      onClick={() => loadMorePopular()}
                      label={t('home.load_more')}
                      loadingLabel={t('home.loading')}
                    />
                  </div>
                </div>
              )}
              </div>
            </>
          )}

          {/* もっと見る / 出品物は以上です */}
          {!isGuest && (
            <div className="mt-8 text-center">
              {!hasMore && (
                <p className="text-gray-500 py-4">
                  出品物は以上です...!
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
