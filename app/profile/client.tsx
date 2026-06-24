"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
    Star,
    History,
    BookOpen,
    Heart,
    Inbox,
    ChevronRight,
    ArrowRight,
    Settings,
    Shield,
    HelpCircle
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/lib/i18n";
import { ProfileSkeleton } from "./edit/skeleton";
import { getItemImageUrl } from "@/lib/image-storage";
import { supabase } from "@/lib/supabase";
import { RewardAvatar, RewardBadges } from "@/components/reward-avatar";
import ProfileRewardsTutorial from "@/components/ProfileRewardsTutorial";
import { LegalLinksPanel } from "@/components/legal-footer";
import { resolveEarlyRegistrationEligible, type UserBadge } from "@/lib/rewards";
import { BackgroundRefreshBanner } from "@/components/background-refresh-banner";

type Profile = {
    user_id?: string;
    nickname: string;
    department: string;
    avatar_url: string | null;
    created_at?: string;
    is_app_review_demo?: boolean;
};

type Item = {
    id: string;
    title: string;
    selling_price: number;
    front_image_url: string | null;
    front_thumbnail_url?: string | null;
    front_image_storage_path?: string | null;
    front_thumbnail_storage_path?: string | null;
    image_storage_provider?: string | null;
    status: string;
    transaction_id?: string | null;
    transaction_status?: string | null;
};

type MypageClientProps = {
    initialProfile: Profile | null;
    initialListingItems: Item[];
    initialPastItems: Item[];
    initialFavoriteItems: Item[];
    averageRating: number;
    listingCount: number;
    transactionCount: number;
    earlyRegistrationEligible: boolean;
    badges: UserBadge[];
    isAdmin: boolean;
};

type ProfileLocalCache = {
    version: number;
    savedAt: number;
    profile: Profile | null;
    listingItems: Item[];
    pastItems: Item[];
    favoriteItems: Item[];
    averageRating: number;
    listingCount: number;
    transactionCount: number;
    earlyRegistrationEligible: boolean;
    badges: UserBadge[];
    isAdmin: boolean;
};

const PROFILE_CACHE_VERSION = 2;
const PROFILE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const itemVisualKey = (item: Item) => [
    item.id,
    item.title,
    item.selling_price,
    item.status,
    item.transaction_id || "",
    item.transaction_status || "",
    item.front_image_url || "",
    item.front_thumbnail_url || "",
    item.front_image_storage_path || "",
    item.front_thumbnail_storage_path || "",
    item.image_storage_provider || "",
].join("|");

const mergeStableItems = (current: Item[], next: Item[]) => {
    let changed = current.length !== next.length;
    const currentById = new Map(current.map((item) => [item.transaction_id || item.id, item]));
    const merged = next.map((nextItem, index) => {
        const key = nextItem.transaction_id || nextItem.id;
        const currentItem = currentById.get(key);
        if ((current[index]?.transaction_id || current[index]?.id) !== key) changed = true;
        if (currentItem && itemVisualKey(currentItem) === itemVisualKey(nextItem)) {
            return currentItem;
        }
        changed = true;
        return nextItem;
    });

    return changed ? merged : current;
};

const readProfileCache = (cacheKey: string | null): ProfileLocalCache | null => {
    if (!cacheKey || typeof window === "undefined") return null;

    try {
        const raw = window.localStorage.getItem(cacheKey) ?? window.sessionStorage.getItem(cacheKey);
        if (!raw) return null;

        const parsed = JSON.parse(raw) as Partial<ProfileLocalCache>;
        if (
            parsed.version !== PROFILE_CACHE_VERSION ||
            typeof parsed.savedAt !== "number" ||
            Date.now() - parsed.savedAt > PROFILE_CACHE_TTL_MS ||
            !parsed.profile ||
            !Array.isArray(parsed.favoriteItems) ||
            !Array.isArray(parsed.listingItems) ||
            !Array.isArray(parsed.pastItems)
        ) {
            window.localStorage.removeItem(cacheKey);
            window.sessionStorage.removeItem(cacheKey);
            return null;
        }

        return {
            version: PROFILE_CACHE_VERSION,
            savedAt: parsed.savedAt,
            profile: parsed.profile ?? null,
            listingItems: parsed.listingItems as Item[],
            pastItems: parsed.pastItems as Item[],
            favoriteItems: parsed.favoriteItems as Item[],
            averageRating: typeof parsed.averageRating === "number" ? parsed.averageRating : 0,
            listingCount: typeof parsed.listingCount === "number" ? parsed.listingCount : 0,
            transactionCount: typeof parsed.transactionCount === "number" ? parsed.transactionCount : 0,
            earlyRegistrationEligible: Boolean(parsed.earlyRegistrationEligible),
            badges: Array.isArray(parsed.badges) ? parsed.badges as UserBadge[] : [],
            isAdmin: Boolean(parsed.isAdmin),
        };
    } catch (err) {
        console.warn("Failed to read profile cache:", err);
        window.localStorage.removeItem(cacheKey);
        window.sessionStorage.removeItem(cacheKey);
        return null;
    }
};

const saveProfileCache = (cacheKey: string, cache: Omit<ProfileLocalCache, "version" | "savedAt">) => {
    if (typeof window === "undefined") return;

    try {
        const payload = JSON.stringify({
            version: PROFILE_CACHE_VERSION,
            savedAt: Date.now(),
            ...cache,
        } satisfies ProfileLocalCache);
        window.localStorage.setItem(cacheKey, payload);
        window.sessionStorage.setItem(cacheKey, payload);
    } catch (err) {
        console.warn("Failed to save profile cache:", err);
    }
};

const profileCacheSignature = (cache: Omit<ProfileLocalCache, "version" | "savedAt">) => JSON.stringify({
    profile: cache.profile,
    listingItems: cache.listingItems.map(itemVisualKey),
    pastItems: cache.pastItems.map(itemVisualKey),
    favoriteItems: cache.favoriteItems.map(itemVisualKey),
    averageRating: cache.averageRating,
    listingCount: cache.listingCount,
    transactionCount: cache.transactionCount,
    earlyRegistrationEligible: cache.earlyRegistrationEligible,
    badges: cache.badges,
    isAdmin: cache.isAdmin,
});

export default function MypageClient({
    initialProfile,
    initialListingItems,
    initialPastItems,
    initialFavoriteItems,
    averageRating,
    listingCount,
    transactionCount,
    earlyRegistrationEligible,
    badges,
    isAdmin
}: MypageClientProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, loading: authLoading } = useAuth();
    const { t } = useI18n();
    const [profile, setProfile] = useState<Profile | null>(initialProfile);
    const [listingItems, setListingItems] = useState<Item[]>(initialListingItems);
    const [pastItems, setPastItems] = useState<Item[]>(initialPastItems);
    const [ratingAverage, setRatingAverage] = useState(averageRating);
    const [profileListingCount, setProfileListingCount] = useState(listingCount);
    const [profileTransactionCount, setProfileTransactionCount] = useState(transactionCount);
    const [earlyRegistration, setEarlyRegistration] = useState(earlyRegistrationEligible);
    const [profileBadges, setProfileBadges] = useState<UserBadge[]>(badges);
    const [adminUser, setAdminUser] = useState(isAdmin);
    const [activeTab, setActiveTab] = useState<"past" | "listing" | null>(null);
    const [detailView, setDetailView] = useState<"favorites" | "listing" | "past">("favorites");
    const [pastFilter, setPastFilter] = useState<"completed" | "cancelled">("completed");
    const [favoriteItems, setFavoriteItems] = useState<Item[]>(initialFavoriteItems);
    const [showRewardsTutorial, setShowRewardsTutorial] = useState(false);
    const [backgroundRefreshing, setBackgroundRefreshing] = useState(false);
    const [pendingProfileData, setPendingProfileData] = useState<Omit<ProfileLocalCache, "version" | "savedAt"> | null>(null);
    const favoriteRefreshInFlightRef = useRef(false);
    const lastFavoriteRefreshAtRef = useRef(0);
    const profileRefreshInFlightRef = useRef(false);
    const lastProfileRefreshAtRef = useRef(0);
    const initialProfileLoadStartedRef = useRef(false);
    const cacheKey = user ? `textnext:profile:v${PROFILE_CACHE_VERSION}:user:${user.id}` : null;
    const uiStateKey = user ? `textnext:profile-ui:v1:user:${user.id}` : null;
    const profileStateRef = useRef<Omit<ProfileLocalCache, "version" | "savedAt">>({
        profile: initialProfile,
        listingItems: initialListingItems,
        pastItems: initialPastItems,
        favoriteItems: initialFavoriteItems,
        averageRating,
        listingCount,
        transactionCount,
        earlyRegistrationEligible,
        badges,
        isAdmin,
    });

    const isCancelledPastStatus = useCallback((status?: string | null) => {
        return ["cancelled", "rejected", "declined", "expired", "auto_closed"].includes(status || "");
    }, []);

    useEffect(() => {
        const cached = readProfileCache(cacheKey);
        if (
            cached &&
            initialProfile === null &&
            initialListingItems.length === 0 &&
            initialPastItems.length === 0 &&
            initialFavoriteItems.length === 0
        ) {
            setProfile(cached.profile);
            setListingItems((current) => mergeStableItems(current, cached.listingItems));
            setPastItems((current) => mergeStableItems(current, cached.pastItems));
            setFavoriteItems((current) => mergeStableItems(current, cached.favoriteItems));
            setRatingAverage(cached.averageRating);
            setProfileListingCount(cached.listingCount);
            setProfileTransactionCount(cached.transactionCount);
            setEarlyRegistration(cached.earlyRegistrationEligible);
            setProfileBadges(cached.badges);
            setAdminUser(cached.isAdmin);
            setBackgroundRefreshing(true);
            return;
        }

        setProfile(initialProfile);
        setListingItems((current) => mergeStableItems(current, initialListingItems));
        setPastItems((current) => mergeStableItems(current, initialPastItems));
        setFavoriteItems((current) => mergeStableItems(current, initialFavoriteItems));
        setRatingAverage(averageRating);
        setProfileListingCount(listingCount);
        setProfileTransactionCount(transactionCount);
        setEarlyRegistration(earlyRegistrationEligible);
        setProfileBadges(badges);
        setAdminUser(isAdmin);
        setBackgroundRefreshing(false);
    }, [
        initialProfile,
        initialListingItems,
        initialPastItems,
        initialFavoriteItems,
        averageRating,
        listingCount,
        transactionCount,
        earlyRegistrationEligible,
        badges,
        isAdmin,
        cacheKey,
    ]);

    useEffect(() => {
        if (!uiStateKey || typeof window === "undefined") return;

        try {
            const raw = window.localStorage.getItem(uiStateKey) ?? window.sessionStorage.getItem(uiStateKey);
            if (!raw) return;
            const parsed = JSON.parse(raw) as Partial<{
                activeTab: "past" | "listing" | null;
                detailView: "favorites" | "listing" | "past";
                pastFilter: "completed" | "cancelled";
            }>;
            if (parsed.activeTab === "past" || parsed.activeTab === "listing" || parsed.activeTab === null) {
                setActiveTab(parsed.activeTab);
            }
            if (parsed.detailView === "favorites" || parsed.detailView === "listing" || parsed.detailView === "past") {
                setDetailView(parsed.detailView);
            }
            if (parsed.pastFilter === "completed" || parsed.pastFilter === "cancelled") {
                setPastFilter(parsed.pastFilter);
            }
        } catch (err) {
            console.warn("Failed to read profile UI state:", err);
        }
    }, [uiStateKey]);

    useEffect(() => {
        if (!uiStateKey || typeof window === "undefined") return;

        try {
            const payload = JSON.stringify({ activeTab, detailView, pastFilter });
            window.localStorage.setItem(uiStateKey, payload);
            window.sessionStorage.setItem(uiStateKey, payload);
        } catch (err) {
            console.warn("Failed to save profile UI state:", err);
        }
    }, [uiStateKey, activeTab, detailView, pastFilter]);

    useEffect(() => {
        if (!cacheKey) return;
        if (!profile) return;
        // 連続した setState のたびにシリアライズせず、デバウンスして1回にまとめる
        const timeoutId = window.setTimeout(() => {
            saveProfileCache(cacheKey, {
                profile,
                listingItems,
                pastItems,
                favoriteItems,
                averageRating: ratingAverage,
                listingCount: profileListingCount,
                transactionCount: profileTransactionCount,
                earlyRegistrationEligible: earlyRegistration,
                badges: profileBadges,
                isAdmin: adminUser,
            });
        }, 400);

        return () => window.clearTimeout(timeoutId);
    }, [
        cacheKey,
        profile,
        listingItems,
        pastItems,
        favoriteItems,
        ratingAverage,
        profileListingCount,
        profileTransactionCount,
        earlyRegistration,
        profileBadges,
        adminUser,
    ]);

    useEffect(() => {
        profileStateRef.current = {
            profile,
            listingItems,
            pastItems,
            favoriteItems,
            averageRating: ratingAverage,
            listingCount: profileListingCount,
            transactionCount: profileTransactionCount,
            earlyRegistrationEligible: earlyRegistration,
            badges: profileBadges,
            isAdmin: adminUser,
        };
    }, [
        profile,
        listingItems,
        pastItems,
        favoriteItems,
        ratingAverage,
        profileListingCount,
        profileTransactionCount,
        earlyRegistration,
        profileBadges,
        adminUser,
    ]);

    const handleCloseRewardsTutorial = () => {
        setShowRewardsTutorial(false);
    };

    const applyProfileData = useCallback((next: Omit<ProfileLocalCache, "version" | "savedAt">) => {
        setProfile(next.profile);
        setListingItems((current) => mergeStableItems(current, next.listingItems));
        setPastItems((current) => mergeStableItems(current, next.pastItems));
        setFavoriteItems((current) => mergeStableItems(current, next.favoriteItems));
        setRatingAverage(next.averageRating);
        setProfileListingCount(next.listingCount);
        setProfileTransactionCount(next.transactionCount);
        setEarlyRegistration(next.earlyRegistrationEligible);
        setProfileBadges(next.badges);
        setAdminUser(next.isAdmin);
        setPendingProfileData(null);
        if (cacheKey) saveProfileCache(cacheKey, next);
    }, [cacheKey]);

    const applyPendingProfileData = useCallback(() => {
        if (!pendingProfileData) return;
        applyProfileData(pendingProfileData);
    }, [applyProfileData, pendingProfileData]);

    const loadProfileData = useCallback(async () => {
        if (!user) return;
        const now = Date.now();
        if (profileRefreshInFlightRef.current || now - lastProfileRefreshAtRef.current < 2500) {
            setBackgroundRefreshing(false);
            return;
        }

        profileRefreshInFlightRef.current = true;
        lastProfileRefreshAtRef.current = now;

        try {
            const [
                { data: profileData },
                { data: ratingsData },
                { data: favoritesData },
                { data: sellerItems },
                { data: sellerTransactions },
                { data: buyerTransactions },
                { data: rewardSetting },
                { data: userBadges },
                { data: rewardOverride },
                { data: adminStatus },
            ] = await Promise.all([
                supabase.from("profiles").select("user_id,nickname,department,avatar_url,created_at,is_app_review_demo").eq("user_id", user.id).single(),
                supabase.from("ratings").select("score").eq("rated_id", user.id).eq("is_demo", false),
                supabase.from("favorites").select("item_id, items(id,title,selling_price,status,is_demo,front_image_url,front_thumbnail_url,front_image_storage_path,front_thumbnail_storage_path,image_storage_provider)").eq("user_id", user.id),
                supabase.from("items").select("id,title,selling_price,status,is_demo,front_image_url,front_thumbnail_url,front_image_storage_path,front_thumbnail_storage_path,image_storage_provider").eq("seller_id", user.id).eq("is_demo", false),
                supabase.from("transactions").select("id, item_id, status").eq("seller_id", user.id),
                supabase
                    .from("transactions")
                    .select("id, item_id, status, items(id,title,selling_price,status,front_image_url,front_thumbnail_url,front_image_storage_path,front_thumbnail_storage_path,image_storage_provider)")
                    .eq("buyer_id", user.id),
                (supabase as any).from("reward_settings").select("*").eq("id", "early_registration").single(),
                (supabase as any).from("user_badges").select("id,badge_type,badge_color,label,note").eq("user_id", user.id).is("revoked_at", null).order("created_at", { ascending: false }),
                (supabase as any).from("user_reward_overrides").select("early_registration_override").eq("user_id", user.id).maybeSingle(),
                supabase.rpc("is_current_user_admin" as any),
            ]);

            const profileRecord = profileData as Profile | null;
            const isAppReviewDemo = Boolean((profileRecord as any)?.is_app_review_demo);
            let effectiveSellerItems = (sellerItems || []) as Item[];
            if (isAppReviewDemo) {
                const { data: demoSellerItems } = await supabase
                    .from("items")
                    .select("id,title,selling_price,status,is_demo,front_image_url,front_thumbnail_url,front_image_storage_path,front_thumbnail_storage_path,image_storage_provider")
                    .eq("seller_id", user.id)
                    .eq("is_demo", true);
                effectiveSellerItems = (demoSellerItems || []) as Item[];
            }

            const scores = (ratingsData || []).map((rating: any) => rating.score);
            const nextAverageRating = scores.length > 0
                ? scores.reduce((sum: number, score: number) => sum + score, 0) / scores.length
                : 0;

            const txItemIds = new Set(((sellerTransactions || []) as any[]).map(tx => tx.item_id));
            const nextListingCount = effectiveSellerItems.filter((item: any) => item.status !== "deleted").length;
            const nextListingItems = effectiveSellerItems.filter((item: any) => item.status === "available" && !txItemIds.has(item.id));

            const terminalStatuses = new Set(["completed", "cancelled", "rejected", "declined", "expired", "auto_closed"]);
            const sellerTerminalTransactions = ((sellerTransactions || []) as any[]).filter(tx => terminalStatuses.has(tx.status));
            const sellerTerminalTxByItemId = new Map(sellerTerminalTransactions.map(tx => [tx.item_id, tx]));
            const sellerPastItems = effectiveSellerItems
                .filter((item: any) => item.status === "sold" || sellerTerminalTxByItemId.has(item.id))
                .map((item: any) => {
                    const tx = sellerTerminalTxByItemId.get(item.id);
                    return tx ? { ...item, transaction_id: tx.id, transaction_status: tx.status } : item;
                });
            const buyerPastItems = ((buyerTransactions || []) as any[])
                .filter(tx => terminalStatuses.has(tx.status) || tx.items?.status === "sold")
                .map(tx => tx.items ? { ...tx.items, transaction_id: tx.id, transaction_status: tx.status } : null)
                .filter(Boolean);
            const nextPastItems = Array.from(
                new Map([...sellerPastItems, ...buyerPastItems].map((item: any) => [item.transaction_id || item.id, item])).values()
            ) as Item[];

            const nextFavoriteItems = ((favoritesData || []) as any[])
                .map(f => f.items)
                .filter((item: any) => item && item.is_demo !== true && ["available", "trading", "transaction_pending"].includes(item.status)) as Item[];

            const nextData = {
                profile: profileRecord,
                listingItems: nextListingItems,
                pastItems: nextPastItems,
                favoriteItems: nextFavoriteItems,
                averageRating: nextAverageRating,
                listingCount: nextListingCount,
                transactionCount: nextPastItems.length,
                earlyRegistrationEligible: resolveEarlyRegistrationEligible(profileRecord?.created_at, rewardSetting as any, rewardOverride as any),
                badges: (userBadges ?? []) as UserBadge[],
                isAdmin: Boolean(adminStatus),
            };

            const displayedProfileData = profileStateRef.current;
            if (!displayedProfileData.profile) {
                applyProfileData(nextData);
            } else if (profileCacheSignature(displayedProfileData) !== profileCacheSignature(nextData)) {
                setPendingProfileData(nextData);
            } else {
                setPendingProfileData(null);
            }
        } catch (err) {
            console.error("Error loading profile data:", err);
        } finally {
            profileRefreshInFlightRef.current = false;
            setBackgroundRefreshing(false);
        }
    }, [applyProfileData, user]);

    const refreshFavoriteItems = useCallback(async () => {
        if (!user) return;
        const now = Date.now();
        if (favoriteRefreshInFlightRef.current || now - lastFavoriteRefreshAtRef.current < 2500) return;

        favoriteRefreshInFlightRef.current = true;
        lastFavoriteRefreshAtRef.current = now;

        try {
            const { data, error } = await supabase
                .from("favorites")
                .select("item_id, items(id,title,selling_price,status,front_image_url,front_thumbnail_url,front_image_storage_path,front_thumbnail_storage_path,image_storage_provider)")
                .eq("user_id", user.id);

            if (!error && data) {
                const nextItems = (data as any[])
                    .map(f => f.items)
                    .filter((item: any) => item && ["available", "trading", "transaction_pending"].includes(item.status));
                setFavoriteItems((current) => {
                    if (
                        current.length === nextItems.length &&
                        current.every((item, index) => item.id === nextItems[index]?.id && item.status === nextItems[index]?.status)
                    ) {
                        return current;
                    }
                    return mergeStableItems(current, nextItems);
                });
            }
        } finally {
            favoriteRefreshInFlightRef.current = false;
            setBackgroundRefreshing(false);
        }
    }, [user]);

    useEffect(() => {
        if (authLoading || !user || initialProfileLoadStartedRef.current) return;

        initialProfileLoadStartedRef.current = true;
        setBackgroundRefreshing(true);
        void loadProfileData();
    }, [authLoading, user, loadProfileData]);

    useEffect(() => {
        if (!authLoading && !user) {
            router.replace("/auth/login");
            router.refresh();
        }
    }, [authLoading, user, router]);

    useEffect(() => {
        const view = searchParams.get("view");
        const targetItemId = searchParams.get("item");
        const targetTxId = searchParams.get("tx");

        if (view !== "past") return;

        setActiveTab("past");
        setDetailView("past");

        const targetPastItem = targetTxId
            ? pastItems.find((item) => item.transaction_id === targetTxId)
            : pastItems.find((item) => targetItemId && item.id === targetItemId);
        if (targetPastItem) {
            setPastFilter(isCancelledPastStatus(targetPastItem.transaction_status) ? "cancelled" : "completed");
        }

        if (!targetItemId && !targetTxId) return;

        const timeoutId = window.setTimeout(() => {
            const selector = targetTxId
                ? `[data-past-tx-id="${CSS.escape(targetTxId)}"]`
                : targetItemId
                    ? `[data-past-item-id="${CSS.escape(targetItemId)}"]`
                    : "";
            if (!selector) return;

            const candidates = Array.from(document.querySelectorAll<HTMLElement>(selector));
            const target = candidates.find((element) => element.offsetParent !== null) ?? candidates[0];
            target?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 180);

        return () => window.clearTimeout(timeoutId);
    }, [pastItems, isCancelledPastStatus, searchParams]);

    useEffect(() => {
        if (!user) return;

        const refreshWhenVisible = () => {
            if (document.visibilityState === "visible") {
                refreshFavoriteItems();
            }
        };

        window.addEventListener("focus", refreshFavoriteItems);
        window.addEventListener("pageshow", refreshFavoriteItems);
        document.addEventListener("visibilitychange", refreshWhenVisible);

        return () => {
            window.removeEventListener("focus", refreshFavoriteItems);
            window.removeEventListener("pageshow", refreshFavoriteItems);
            document.removeEventListener("visibilitychange", refreshWhenVisible);
        };
    }, [user, refreshFavoriteItems]);

    if (authLoading) {
        return <ProfileSkeleton />;
    }

    if (!user) {
        return null;
    }

    const ratingStars = Math.round(ratingAverage);

    const completedPastItems = pastItems.filter((item) => {
        if (isCancelledPastStatus(item.transaction_status)) return false;
        return item.transaction_status === "completed" || item.status === "sold" || !item.transaction_status;
    });
    const cancelledPastItems = pastItems.filter((item) => isCancelledPastStatus(item.transaction_status));
    const visiblePastItems = pastFilter === "completed" ? completedPastItems : cancelledPastItems;
    const currentHistoryItems = detailView === "past" ? visiblePastItems : listingItems;

    const PastFilterSwitcher = () => (
        <div className="grid grid-cols-2 gap-1 rounded-2xl border border-gray-200 bg-gray-50 p-1">
            {([
                { key: "completed", label: "取引終了", count: completedPastItems.length },
                { key: "cancelled", label: "キャンセル", count: cancelledPastItems.length },
            ] as const).map((filter) => {
                const active = pastFilter === filter.key;
                return (
                    <button
                        key={filter.key}
                        type="button"
                        onClick={() => setPastFilter(filter.key)}
                        className={`rounded-xl px-3 py-2 text-sm font-black transition-all ${active
                            ? "bg-white text-primary shadow-sm"
                            : "text-gray-500 hover:bg-white/70"
                            }`}
                    >
                        {filter.label}
                        <span className={`ml-1 text-xs ${active ? "text-primary/70" : "text-gray-400"}`}>
                            {filter.count}
                        </span>
                    </button>
                );
            })}
        </div>
    );

    const renderHistoryRow = (item: Item) => {
        const isCancelledHistory = isCancelledPastStatus(item.transaction_status);
        return (
        <div
            key={item.transaction_id || item.id}
            data-past-item-id={item.id}
            data-past-tx-id={item.transaction_id || undefined}
            onClick={() => router.push(`/product/${item.id}${item.transaction_id ? `?tx=${item.transaction_id}` : ""}`)}
            className="bg-white p-3 rounded-xl border border-gray-100 flex items-center gap-3 shadow-sm hover:shadow-md transition-all cursor-pointer group"
        >
            <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden shrink-0">
                {getItemImageUrl(item, "front", "thumbnail") && (
                    <Image src={getItemImageUrl(item, "front", "thumbnail")!} alt={item.title} width={48} height={48} className="w-full h-full object-cover" quality={55} />
                )}
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 truncate group-hover:text-primary transition-colors">{item.title}</p>
                <div className="mt-1 flex items-center gap-2">
                    <p className="text-xs font-bold gradient-text-price">¥{item.selling_price.toLocaleString()}</p>
                    {item.transaction_status && (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${isCancelledHistory
                            ? "bg-rose-50 text-rose-500"
                            : "bg-primary/10 text-primary"
                            }`}>
                            {isCancelledHistory ? "キャンセル" : "取引終了"}
                        </span>
                    )}
                </div>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-primary group-hover:translate-x-1 transition-all" />
        </div>
        );
    };

    const renderFavoriteCard = (item: Item, compact = false) => (
        <div
            key={item.id}
            onClick={() => router.push(`/product/${item.id}`)}
            className={`bg-white ${compact ? "rounded-xl" : "rounded-2xl"} overflow-hidden shadow-sm border border-gray-100 transition-all hover:shadow-md hover:scale-[1.02] cursor-pointer group`}
        >
            <div className={`aspect-square relative flex items-center justify-center bg-gray-50 overflow-hidden ${item.status !== "available" ? "opacity-70" : ""}`}>
                {getItemImageUrl(item, "front", "thumbnail") ? (
                    <Image
                        src={getItemImageUrl(item, "front", "thumbnail")!}
                        alt={item.title}
                        fill
                        className="object-cover group-hover:scale-110 transition-transform duration-500"
                        sizes={compact ? "33vw" : "50vw"}
                        quality={55}
                    />
                ) : (
                    <BookOpen className={`${compact ? "h-6 w-6" : "h-8 w-8"} text-gray-200`} />
                )}
                {(item.status === "trading" || item.status === "transaction_pending") && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <span className={`bg-gray-700 text-white font-black rounded-full shadow-lg tracking-wider ${compact ? "px-2 py-1 text-[10px]" : "px-4 py-1.5 text-xs"}`}>
                            取引中
                        </span>
                    </div>
                )}
                <div className={`absolute bg-white/90 backdrop-blur-sm rounded-full shadow-sm ${compact ? "right-1.5 top-1.5 p-1" : "right-2 top-2 p-1.5"}`}>
                    <Heart className={`${compact ? "h-3.5 w-3.5" : "h-4 w-4"} text-red-500 fill-red-500`} />
                </div>
            </div>
            <div className={`${compact ? "space-y-0.5 p-2" : "space-y-1 p-3"}`}>
                <h4 className={`${compact ? "text-xs" : "text-sm"} font-bold truncate group-hover:text-primary transition-colors ${item.status !== "available" ? "text-gray-400" : "text-gray-900"}`}>{item.title}</h4>
                <p className={`${compact ? "text-xs" : "text-sm"} font-extrabold ${item.status !== "available" ? "text-gray-400 line-through" : "gradient-text-price"}`}>¥{item.selling_price.toLocaleString()}</p>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-gradient-to-b from-white to-blue-50 pb-32 font-gentle lg:pb-12">
            <BackgroundRefreshBanner
                visible={backgroundRefreshing}
                hasUpdate={Boolean(pendingProfileData)}
                onApplyUpdate={applyPendingProfileData}
            />
            {showRewardsTutorial && (
                <ProfileRewardsTutorial onClose={handleCloseRewardsTutorial} />
            )}

            <div className="lg:max-w-5xl lg:mx-auto lg:px-6">
            {/* Header */}
            <header className="bg-white px-5 pt-7 pb-5 rounded-b-[32px] shadow-sm lg:mt-6 lg:rounded-[28px] lg:pt-6 lg:pb-5">
                <div className="flex items-start justify-between gap-4">
                    <h1 className="text-2xl font-black text-gray-900 tracking-tight lg:text-2xl">
                        {t('profile.mypage')}
                    </h1>
                    <button
                        type="button"
                        onClick={() => setShowRewardsTutorial(true)}
                        className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-full border border-primary/15 bg-primary/5 text-primary shadow-sm transition-all hover:bg-primary/10 active:scale-95"
                        aria-label="出品数とバッジの説明を見る"
                    >
                        <HelpCircle className="h-5 w-5" />
                    </button>
                </div>
            </header>

            <div className="px-6 pt-6 space-y-6 lg:px-0 lg:pt-6 lg:space-y-0 lg:flex lg:items-start lg:gap-6">
            {/* 左カラム: プロフィール＋各種ボタン＋規約 */}
            <div className="space-y-6 lg:space-y-6 lg:w-80 lg:flex-shrink-0">
                {/* Profile Section */}
                <div
                    onClick={() => router.push(`/seller/${user.id}?from=profile`)}
                    className="group relative bg-white/80 backdrop-blur-md rounded-3xl p-4 shadow-md border border-white/50 flex items-center gap-4 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:border-primary/30 cursor-pointer"
                >
                    {adminUser && (
                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                router.push("/admin");
                            }}
                            className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-900 text-white shadow-sm transition hover:bg-slate-800 z-10"
                            aria-label="管理ダッシュボード"
                        >
                            <Shield className="h-5 w-5" />
                        </button>
                    )}
                    <RewardAvatar
                        src={profile?.avatar_url}
                        alt="Avatar"
                        size={64}
                        listingCount={profileListingCount}
                        earlyRegistration={earlyRegistration}
                        adminFrame={adminUser}
                    />
                    <div className="flex-1 pr-24">
                        <h2 className="truncate text-lg font-bold text-gray-900">
                            {profile?.nickname || "読み込み中..."}
                        </h2>
                        <RewardBadges badges={profileBadges} />
                        <div className="flex items-center gap-2 mt-1">
                            <div className="flex text-yellow-500">
                                {[...Array(5)].map((_, i) => (
                                    <Star
                                        key={i}
                                        className={`w-4 h-4 ${i < ratingStars ? "fill-current" : "text-gray-300"}`}
                                    />
                                ))}
                            </div>
                            <span className="text-sm font-bold text-gray-500">
                                ({ratingAverage.toFixed(1)})
                            </span>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-left">
                            <div className="rounded-xl bg-primary/5 px-2.5 py-1.5">
                                <p className="text-[9px] font-black leading-none text-primary/60">出品数</p>
                                <p className="mt-0.5 text-sm font-black leading-none text-primary">{profileListingCount}件</p>
                            </div>
                            <div className="rounded-xl bg-gray-50 px-2.5 py-1.5">
                                <p className="text-[9px] font-black leading-none text-gray-500">取引数</p>
                                <p className="mt-0.5 text-sm font-black leading-none text-gray-900">{profileTransactionCount}件</p>
                            </div>
                        </div>
                    </div>
                    {/* 右端の矢印アイコン */}
                    <div className="absolute bottom-5 right-11 text-[10px] font-black text-gray-400 transition-colors group-hover:text-primary/70">
                        詳細・編集
                    </div>
                    <div className="absolute bottom-4 right-4 text-gray-300 transition-transform group-hover:translate-x-1 group-hover:text-primary/60">
                        <ChevronRight className="w-6 h-6" />
                    </div>
                </div>

                {/* PC専用: 右パネル切替メニュー */}
                <nav className="hidden lg:flex lg:flex-col gap-2">
                    {([
                        { key: "favorites", label: "お気に入り", icon: Heart, count: favoriteItems.length },
                        { key: "listing", label: t('profile.listing_items'), icon: BookOpen, count: listingItems.length },
                        { key: "past", label: t('profile.past_transactions'), icon: History, count: pastItems.length },
                    ] as const).map((m) => {
                        const Icon = m.icon;
                        const active = detailView === m.key;
                        return (
                            <button
                                key={m.key}
                                onClick={() => setDetailView(m.key)}
                                className={`flex items-center gap-3 w-full rounded-2xl p-4 border-2 transition-all ${active ? "bg-primary text-white border-primary shadow-lg shadow-primary/20" : "bg-white text-gray-700 border-gray-100 shadow-sm hover:border-primary/30"}`}
                            >
                                <Icon className={`w-5 h-5 ${active ? "text-white" : "text-primary"}`} />
                                <span className="flex-1 text-left font-bold">{m.label}</span>
                                <span className={`text-sm font-black ${active ? "text-white/90" : "text-gray-400"}`}>{m.count}</span>
                            </button>
                        );
                    })}
                </nav>

                {/* 設定ボタン */}
                <button
                    onClick={() => router.push("/settings")}
                    className="w-full bg-white rounded-2xl p-3 shadow-md border border-gray-100 flex items-center justify-between lg:justify-start lg:gap-3 group active:scale-[0.98] transition-all hover:border-primary/30"
                >
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gray-100 rounded-xl flex items-center justify-center transition-colors group-hover:bg-gray-200">
                            <Settings className="w-5 h-5 text-gray-500" />
                        </div>
                        <span className="text-sm font-bold text-gray-700">設定</span>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-primary group-hover:translate-x-1 transition-all lg:hidden" />
                </button>

                <section className="space-y-3">
                    <h3 className="flex items-center gap-3 px-1 text-sm font-black text-gray-500">
                        <span>お問い合わせ</span>
                        <span className="h-px flex-1 bg-gray-200" />
                    </h3>
                    <div className="space-y-2">
                        <button
                            onClick={() => router.push("/contact")}
                            className="w-full bg-white rounded-2xl p-3 shadow-md border border-gray-100 flex items-center justify-between lg:justify-start lg:gap-3 group active:scale-[0.98] transition-all hover:border-primary/30"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-primary/10 rounded-xl flex items-center justify-center transition-colors group-hover:bg-primary/15">
                                    <ArrowRight className="w-5 h-5 text-primary" />
                                </div>
                                <span className="text-sm font-bold text-gray-700">お問い合わせはこちらから</span>
                            </div>
                            <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-primary group-hover:translate-x-1 transition-all lg:hidden" />
                        </button>
                        <button
                            onClick={() => router.push("/profile/inquiries")}
                            className="w-full bg-white rounded-2xl p-3 shadow-md border border-gray-100 flex items-center justify-between lg:justify-start lg:gap-3 group active:scale-[0.98] transition-all hover:border-primary/30"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-blue-50 rounded-xl flex items-center justify-center transition-colors group-hover:bg-blue-100">
                                    <Inbox className="w-5 h-5 text-primary" />
                                </div>
                                <span className="text-sm font-bold text-gray-700">お問い合わせ履歴</span>
                            </div>
                            <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-primary group-hover:translate-x-1 transition-all lg:hidden" />
                        </button>
                    </div>
                </section>

                <section className="space-y-3">
                    <h3 className="flex items-center gap-3 px-1 text-sm font-black text-gray-500">
                        <span>規約・ポリシー</span>
                        <span className="h-px flex-1 bg-gray-200" />
                    </h3>
                    <LegalLinksPanel />
                </section>

            </div>

            {/* 右カラム(PC): サイドバーで選択した一覧を表示 */}
            <div className="hidden lg:block lg:flex-1 lg:min-w-0">
                {detailView === "favorites" ? (
                    <section className="space-y-4">
                        <div className="flex items-center justify-between px-1">
                            <h3 className="text-lg font-extrabold text-gray-800 flex items-center gap-2">
                                <Heart className="w-5 h-5 text-red-500 fill-red-500" />
                                お気に入り一覧
                            </h3>
                            <span className="text-sm font-bold text-red-500">{favoriteItems.length}件</span>
                        </div>
                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                            {favoriteItems.map((item) => renderFavoriteCard(item))}
                            {favoriteItems.length === 0 && (
                                <div className="col-span-2 lg:col-span-3 py-12 text-center bg-gray-50/50 rounded-3xl border border-dashed border-gray-200">
                                    <Heart className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                                    <p className="text-sm text-gray-400">お気に入りのアイテムはありません</p>
                                </div>
                            )}
                        </div>
                    </section>
                ) : (
                    <section className="space-y-4">
                        <h3 className="text-lg font-extrabold text-gray-800 flex items-center gap-2 px-1">
                            {detailView === "past" ? <History className="w-5 h-5 text-primary" /> : <BookOpen className="w-5 h-5 text-red-500" />}
                            {detailView === "past" ? t('profile.past_transactions') : t('profile.listing_items')}
                            <span className="ml-1 text-sm font-bold text-gray-400">{currentHistoryItems.length}件</span>
                        </h3>
                        {detailView === "past" && <PastFilterSwitcher />}
                        <div className="space-y-3">
                            {currentHistoryItems.map(renderHistoryRow)}
                            {currentHistoryItems.length === 0 && (
                                <p className="text-center py-12 text-sm text-gray-400">アイテムがありません</p>
                            )}
                        </div>
                    </section>
                )}
            </div>

            {/* モバイル: 履歴＋お気に入り（従来通り） */}
            <div className="lg:hidden space-y-8">
                {/* History Section */}
                <section className="space-y-4">
                    <h3 className="text-base font-extrabold text-gray-800 flex items-center gap-2 px-1">
                        <History className="w-5 h-5 text-primary" />
                        {t('profile.history')}
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={() => setActiveTab(activeTab === "past" ? null : "past")}
                            className={`rounded-xl border-2 p-3 transition-all flex flex-col items-center gap-1.5 ${activeTab === "past"
                                    ? "bg-primary text-white border-primary shadow-lg shadow-primary/30 scale-[1.02]"
                                    : "bg-white text-gray-700 border-gray-100 shadow-sm hover:border-primary/20"
                                }`}
                        >
                            <History className={`h-5 w-5 ${activeTab === "past" ? "text-white" : "text-primary"}`} />
                            <span className="text-xs font-bold">{t('profile.past_transactions')}</span>
                            <span className={`text-base font-extrabold leading-none ${activeTab === "past" ? "text-white/90" : "text-primary"}`}>{pastItems.length}</span>
                        </button>
                        <button
                            onClick={() => setActiveTab(activeTab === "listing" ? null : "listing")}
                            className={`rounded-xl border-2 p-3 transition-all flex flex-col items-center gap-1.5 ${activeTab === "listing"
                                    ? "bg-red-500 text-white border-red-500 shadow-lg shadow-red-200 scale-[1.02]"
                                    : "bg-white text-gray-700 border-gray-100 shadow-sm hover:border-red-500/20"
                                }`}
                        >
                            <BookOpen className={`h-5 w-5 ${activeTab === "listing" ? "text-white" : "text-red-500"}`} />
                            <span className="text-xs font-bold">{t('profile.listing_items')}</span>
                            <span className={`text-base font-extrabold leading-none ${activeTab === "listing" ? "text-white/90" : "text-red-500"}`}>{listingItems.length}</span>
                        </button>
                    </div>

                    {/* Filtered List */}
                    {activeTab && (
                        <div className="bg-gray-50/50 rounded-3xl p-4 border border-dashed border-gray-200 animate-in fade-in slide-in-from-top-4 duration-300">
                            <div className="flex items-center justify-between mb-4 px-2">
                                <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                                    {activeTab === "past" ? "過去の取引一覧" : "出品中のアイテム（未取引）"}
                                </span>
                                <span className="text-sm font-bold text-primary">
                                    {(activeTab === "past" ? visiblePastItems : listingItems).length}件
                                </span>
                            </div>
                            {activeTab === "past" && (
                                <div className="mb-4">
                                    <PastFilterSwitcher />
                                </div>
                            )}
                            <div className="space-y-3">
                                {(activeTab === "past" ? visiblePastItems : listingItems).map(renderHistoryRow)}
                                {(activeTab === "past" ? visiblePastItems : listingItems).length === 0 && (
                                    <p className="text-center py-8 text-sm text-gray-400">アイテムがありません</p>
                                )}
                            </div>
                        </div>
                    )}
                </section>

                {/* Favorites Section */}
                <section className="space-y-4 pb-4">
                    <div className="flex items-center justify-between px-1">
                        <h3 className="text-base font-extrabold text-gray-800 flex items-center gap-2">
                            <Heart className="w-5 h-5 text-red-500 fill-red-500" />
                            お気に入り一覧
                        </h3>
                        <span className="text-sm font-bold text-red-500">{favoriteItems.length}件</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2.5">
                        {favoriteItems.map((item) => renderFavoriteCard(item, true))}
                        {favoriteItems.length === 0 && (
                            <div className="col-span-3 py-12 text-center bg-gray-50/50 rounded-3xl border border-dashed border-gray-200">
                                <Heart className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                                <p className="text-sm text-gray-400">お気に入りのアイテムはありません</p>
                            </div>
                        )}
                    </div>
                </section>
            </div>
            </div>
            </div>
        </div>
    );
}
