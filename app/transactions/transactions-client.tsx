"use client";

import Link from "next/link";
import Image from "next/image";
import { GraduationCap, MessageCircle, BookOpen, Calendar, MapPin, Clock, RotateCcw, ChevronDown, ChevronUp, CheckCircle, Star, HelpCircle, X } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/lib/i18n";
import { TransactionsSkeleton } from "./skeleton";
import { getItemImageUrl } from "@/lib/image-storage";
import { RewardAvatar } from "@/components/reward-avatar";
import { resolveEarlyRegistrationEligible, type RewardOverride, type RewardSetting } from "@/lib/rewards";

type Profile = {
    nickname: string;
    department: string;
};

type TransactionItem = {
    id: string;
    title: string;
    selling_price: number;
    status: string;
    front_image_url: string | null;
    front_thumbnail_url?: string | null;
    front_image_storage_path?: string | null;
    front_thumbnail_storage_path?: string | null;
    image_storage_provider?: string | null;
    isBuyer: boolean;
    hasTransaction: boolean;
    unreadCount: number;
    final_meetup_time?: string | null;
    final_meetup_location?: string | null;
    transactionId?: string;
    counterpartId?: string;
    transactionStatus?: string;
};

const TERMINAL_TRANSACTION_STATUSES = ["completed", "rejected", "expired", "auto_closed", "cancelled"];
const unreadKey = (itemId: string, counterpartId?: string | null) => `${itemId}:${counterpartId || ""}`;

type TransactionsClientProps = {
    initialActiveItems: TransactionItem[];
    initialProfile: Profile | null;
    initialListingCount?: number;
    initialEarlyRegistrationEligible?: boolean;
    serverSession?: boolean;
};

type TransactionsSessionCache = {
    version: number;
    savedAt: number;
    profile: Profile | null;
    activeItems: TransactionItem[];
    profileAvatar: {
        listingCount: number;
        earlyRegistration: boolean;
    };
};

const TRANSACTIONS_CACHE_VERSION = 1;
const TRANSACTIONS_CACHE_TTL_MS = 2 * 60 * 1000;

const readTransactionsCache = (cacheKey: string | null): TransactionsSessionCache | null => {
    if (!cacheKey || typeof window === "undefined") return null;

    try {
        const raw = window.sessionStorage.getItem(cacheKey);
        if (!raw) return null;

        const parsed = JSON.parse(raw) as Partial<TransactionsSessionCache>;
        if (
            parsed.version !== TRANSACTIONS_CACHE_VERSION ||
            typeof parsed.savedAt !== "number" ||
            Date.now() - parsed.savedAt > TRANSACTIONS_CACHE_TTL_MS ||
            !Array.isArray(parsed.activeItems)
        ) {
            window.sessionStorage.removeItem(cacheKey);
            return null;
        }

        return {
            version: TRANSACTIONS_CACHE_VERSION,
            savedAt: parsed.savedAt,
            profile: parsed.profile ?? null,
            activeItems: parsed.activeItems as TransactionItem[],
            profileAvatar: parsed.profileAvatar ?? {
                listingCount: 0,
                earlyRegistration: false,
            },
        };
    } catch (err) {
        console.warn("Failed to read transactions cache:", err);
        window.sessionStorage.removeItem(cacheKey);
        return null;
    }
};

const saveTransactionsCache = (cacheKey: string, cache: Omit<TransactionsSessionCache, "version" | "savedAt">) => {
    if (typeof window === "undefined") return;

    try {
        window.sessionStorage.setItem(cacheKey, JSON.stringify({
            version: TRANSACTIONS_CACHE_VERSION,
            savedAt: Date.now(),
            ...cache,
        } satisfies TransactionsSessionCache));
    } catch (err) {
        console.warn("Failed to save transactions cache:", err);
    }
};

export default function TransactionsClient({
    initialActiveItems,
    initialProfile,
    initialListingCount = 0,
    initialEarlyRegistrationEligible = false,
    serverSession = true
}: TransactionsClientProps) {
    const router = useRouter();
    const { user, avatarUrl, loading: authLoading } = useAuth();
    const { t } = useI18n();
    const [profile, setProfile] = useState<Profile | null>(initialProfile);
    const [activeTab, setActiveTab] = useState<"upcoming" | "adjusting">("upcoming");
    const [activeItems, setActiveItems] = useState<TransactionItem[]>(initialActiveItems);
    const [profileAvatar, setProfileAvatar] = useState({
        listingCount: initialListingCount,
        earlyRegistration: initialEarlyRegistrationEligible,
    });
    const [showFlowHelp, setShowFlowHelp] = useState(false);
    const [initialCheckDone, setInitialCheckDone] = useState(serverSession);
    const pollingRef = useRef<NodeJS.Timeout | null>(null);
    const cacheAppliedRef = useRef(false);
    const cacheKey = user ? `textnext:transactions:v${TRANSACTIONS_CACHE_VERSION}:user:${user.id}` : null;

    // If server didn't find a session, check client-side on mount
    useEffect(() => {
        if (!serverSession && !authLoading) {
            if (!user) {
                router.push("/auth/login");
            } else {
                const cached = readTransactionsCache(cacheKey);
                if (cached) {
                    cacheAppliedRef.current = true;
                    setProfile(cached.profile);
                    setActiveItems(cached.activeItems);
                    setProfileAvatar(cached.profileAvatar);
                }
                loadData();
                setInitialCheckDone(true);
            }
        }
    }, [user, authLoading, serverSession, router, cacheKey]);

    const loadData = useCallback(async () => {
        if (!user) return;

        try {
            const [
                { data: profileData },
                { data: buyerTransactions },
                { data: sellerItems },
                { data: sellerTransactions },
                { data: unreadMessages },
                { count: cumulativeListingCount },
                { data: rewardSetting },
                { data: rewardOverride }
            ] = await Promise.all([
                supabase
                    .from("profiles")
                    .select("nickname, department")
                    .eq("user_id", user.id)
                    .single(),
                supabase
                    .from("transactions")
                    .select(`
                        id,
                        status,
                        item_id,
                        seller_id,
                        final_meetup_time,
                        final_meetup_location,
                        items(id, title, selling_price, status, front_image_url, front_thumbnail_url, front_image_storage_path, front_thumbnail_storage_path, image_storage_provider)
                    `)
                    .eq("buyer_id", user.id),
                supabase
                    .from("items")
                    .select("id, title, selling_price, status, seller_id, front_image_url, front_thumbnail_url, front_image_storage_path, front_thumbnail_storage_path, image_storage_provider")
                    .eq("seller_id", user.id),
                supabase
                    .from("transactions")
                    .select("id, item_id, buyer_id, status, final_meetup_time, final_meetup_location")
                    .eq("seller_id", user.id),
                supabase
                    .from("messages")
                    .select("item_id,sender_id")
                    .eq("receiver_id", user.id)
                    .eq("is_read", false),
                supabase
                    .from("items")
                    .select("*", { count: "exact", head: true })
                    .eq("seller_id", user.id)
                    .neq("status", "deleted"),
                (supabase as any)
                    .from("reward_settings")
                    .select("*")
                    .eq("id", "early_registration")
                    .single(),
                (supabase as any)
                    .from("user_reward_overrides")
                    .select("early_registration_override")
                    .eq("user_id", user.id)
                    .maybeSingle()
            ]);

            if (profileData) {
                setProfile(profileData as Profile);
            }

            setProfileAvatar({
                listingCount: cumulativeListingCount ?? 0,
                earlyRegistration: resolveEarlyRegistrationEligible(
                    user.created_at,
                    rewardSetting as RewardSetting | null,
                    rewardOverride as RewardOverride | null
                ),
            });

            const unreadCountMap = new Map<string, number>();
            if (unreadMessages) {
                for (const msg of unreadMessages as any[]) {
                    const key = unreadKey(msg.item_id, msg.sender_id);
                    const count = unreadCountMap.get(key) || 0;
                    unreadCountMap.set(key, count + 1);
                }
            }

            const active: TransactionItem[] = [];
            for (const tx of (buyerTransactions || []) as any[]) {
                const item = tx.items;
                if (!item) continue;

                if (TERMINAL_TRANSACTION_STATUSES.includes(tx.status) || item.status === "sold") {
                    continue;
                }

                const txItem: TransactionItem = {
                    id: item.id,
                    title: item.title,
                    selling_price: item.selling_price,
                    status: item.status,
                    front_image_url: item.front_image_url || null,
                    front_thumbnail_url: item.front_thumbnail_url || null,
                    front_image_storage_path: item.front_image_storage_path || null,
                    front_thumbnail_storage_path: item.front_thumbnail_storage_path || null,
                    image_storage_provider: item.image_storage_provider || null,
                    isBuyer: true,
                    hasTransaction: true,
                    unreadCount: unreadCountMap.get(unreadKey(item.id, tx.seller_id)) || 0,
                    final_meetup_time: tx.final_meetup_time,
                    final_meetup_location: tx.final_meetup_location,
                    transactionId: tx.id,
                    counterpartId: tx.seller_id,
                    transactionStatus: tx.status,
                };

                // Include accepted, scheduled, and awaiting_rating in active
                active.push(txItem);
            }

            const sellerTxMap = new Map<string, { txId: string; buyerId: string; txStatus: string; final_meetup_time: string | null; final_meetup_location: string | null }[]>();
            for (const tx of (sellerTransactions || []) as any[]) {
                const txList = sellerTxMap.get(tx.item_id) || [];
                txList.push({
                    txId: tx.id,
                    buyerId: tx.buyer_id,
                    txStatus: tx.status,
                    final_meetup_time: tx.final_meetup_time,
                    final_meetup_location: tx.final_meetup_location
                });
                sellerTxMap.set(tx.item_id, txList);
            }

            for (const item of (sellerItems || []) as any[]) {
                if (item.status === "sold") {
                    continue;
                }

                for (const txInfo of sellerTxMap.get(item.id) || []) {
                    if (TERMINAL_TRANSACTION_STATUSES.includes(txInfo.txStatus)) {
                        continue;
                    }

                    // Include accepted, requested, scheduled, and awaiting_rating in active
                    active.push({
                        id: item.id,
                        title: item.title,
                        selling_price: item.selling_price,
                        status: item.status,
                        front_image_url: item.front_image_url || null,
                        front_thumbnail_url: item.front_thumbnail_url || null,
                        front_image_storage_path: item.front_image_storage_path || null,
                        front_thumbnail_storage_path: item.front_thumbnail_storage_path || null,
                        image_storage_provider: item.image_storage_provider || null,
                        isBuyer: false,
                        hasTransaction: true,
                        unreadCount: unreadCountMap.get(unreadKey(item.id, txInfo.buyerId)) || 0,
                        final_meetup_time: txInfo.final_meetup_time,
                        final_meetup_location: txInfo.final_meetup_location,
                        transactionId: txInfo.txId,
                        counterpartId: txInfo.buyerId,
                        transactionStatus: txInfo.txStatus,
                    });
                }
            }

            setActiveItems(active);
        } catch (err) {
            console.error("Error loading transactions:", err);
        }
    }, [user]);

    useEffect(() => {
        if (!user || !initialCheckDone || cacheAppliedRef.current) return;
        if (initialActiveItems.length > 0) return;

        const cached = readTransactionsCache(cacheKey);
        if (!cached) return;

        cacheAppliedRef.current = true;
        setProfile(cached.profile);
        setActiveItems(cached.activeItems);
        setProfileAvatar(cached.profileAvatar);
    }, [user, initialCheckDone, initialActiveItems.length, cacheKey]);

    useEffect(() => {
        if (!cacheKey || !initialCheckDone) return;
        saveTransactionsCache(cacheKey, {
            profile,
            activeItems,
            profileAvatar,
        });
    }, [cacheKey, initialCheckDone, profile, activeItems, profileAvatar]);

    useEffect(() => {
        if (!user || !initialCheckDone) return;

        loadData();

        const refreshWhenVisible = () => {
            if (document.visibilityState === "visible") {
                loadData();
            }
        };

        window.addEventListener("focus", loadData);
        window.addEventListener("pageshow", loadData);
        document.addEventListener("visibilitychange", refreshWhenVisible);

        return () => {
            window.removeEventListener("focus", loadData);
            window.removeEventListener("pageshow", loadData);
            document.removeEventListener("visibilitychange", refreshWhenVisible);
        };
    }, [user, initialCheckDone, loadData]);

    const clearUnreadForItem = useCallback(async (itemId: string, counterpartId?: string) => {
        if (!user) return;

        setActiveItems(current =>
            current.map(item =>
                item.id === itemId && (!counterpartId || item.counterpartId === counterpartId)
                    ? { ...item, unreadCount: 0 }
                    : item
            )
        );

        let query = (supabase.from("messages") as any)
            .update({ is_read: true })
            .eq("item_id", itemId)
            .eq("receiver_id", user.id)
            .eq("is_read", false);
        if (counterpartId) {
            query = query.eq("sender_id", counterpartId);
        }

        const { error } = await query;

        if (error) {
            console.error("Error clearing unread messages before opening chat:", error);
            loadData();
        }
    }, [user, loadData]);

    useEffect(() => {
        if (!user || !initialCheckDone) return;

        pollingRef.current = setInterval(() => {
            loadData();
        }, 5000);

        return () => {
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
            }
        };
    }, [user, loadData, initialCheckDone]);

    const adjustingItems = activeItems.filter(item =>
        ["requested", "pending_approval", "accepted", "scheduling", "pending"].includes(item.transactionStatus || "") && !item.final_meetup_time
    );
    const confirmedItems = activeItems.filter(item =>
        item.transactionStatus === "scheduled" || item.final_meetup_time
    );

    const totalUnreadCount = activeItems.reduce((sum, item) => sum + item.unreadCount, 0);

    // Grouping logic for scheduled items by date
    const groupedItemsByDate = confirmedItems.reduce((groups, item) => {
        const date = item.final_meetup_time!;
        if (!groups[date]) {
            groups[date] = [];
        }
        groups[date].push(item);
        return groups;
    }, {} as Record<string, TransactionItem[]>);

    // Sort dates
    const sortedDates = Object.keys(groupedItemsByDate).sort((a, b) => a.localeCompare(b));

    if (!initialCheckDone || authLoading) {
        return <TransactionsSkeleton />;
    }

    const renderItem = (item: TransactionItem, index: number) => (
        <div
            key={`${item.id}-${item.isBuyer ? "buyer" : "seller"}`}
            onClick={() => router.push(`/product/${item.id}`)}
            className={`bg-white rounded-3xl p-5 shadow-sm transition-all duration-300 border-2 cursor-pointer group active:scale-[0.98] animate-in fade-in slide-in-from-bottom-4 ${item.isBuyer
                ? "border-blue-100 hover:border-blue-400 hover:shadow-xl"
                : "border-red-100 hover:border-red-400 hover:shadow-xl"
                }`}
            style={{ animationDelay: `${index * 50}ms` }}
        >
            <div className="flex items-start gap-4">
                <div className="w-20 h-20 flex-shrink-0 bg-gray-50 rounded-2xl overflow-hidden group-hover:scale-105 transition-transform">
                    {getItemImageUrl(item, "front", "thumbnail") ? (
                        <Image
                            src={getItemImageUrl(item, "front", "thumbnail")!}
                            alt={item.title}
                            width={80}
                            height={80}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            quality={55}
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-300">
                            <BookOpen className="w-8 h-8" />
                        </div>
                    )}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span
                            className={`text-[10px] uppercase font-black px-2.5 py-1 rounded-full ${item.isBuyer
                                ? "bg-blue-50 text-blue-600 border border-blue-100"
                                : "bg-red-50 text-red-600 border border-red-100"
                                }`}
                        >
                            {item.isBuyer ? "購入" : "出品"}
                        </span>
                        {item.transactionStatus === "awaiting_rating" ? (
                            <span className="text-[10px] uppercase font-black px-2.5 py-1 bg-purple-50 text-purple-600 border border-purple-100 rounded-full flex items-center gap-1">
                                <Star className="w-3 h-3" />
                                評価待ち
                            </span>
                        ) : item.final_meetup_time ? (
                            <span className="text-[10px] uppercase font-black px-2.5 py-1 bg-green-50 text-green-600 border border-green-100 rounded-full flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" />
                                確定
                            </span>
                        ) : activeTab === "adjusting" ? (
                            <span className="text-[10px] uppercase font-black px-2.5 py-1 bg-yellow-50 text-yellow-600 border border-yellow-100 rounded-full">
                                調整中
                            </span>
                        ) : null}
                    </div>

                    <h3 className="font-black text-gray-900 truncate text-lg group-hover:text-primary transition-colors">
                        {item.title}
                    </h3>

                    <div className="flex items-center justify-between mt-1">
                        <p className="text-xl font-black gradient-text-price">
                            ¥{item.selling_price.toLocaleString()}
                        </p>

                        {item.hasTransaction && (
                            <div className="relative">
                                <button
                                    onClick={async (e) => {
                                        e.stopPropagation();
                                        await clearUnreadForItem(item.id, item.counterpartId);
                                        router.push(item.transactionId ? `/chat/${item.id}?tx=${item.transactionId}` : `/chat/${item.id}`);
                                    }}
                                    className="flex items-center gap-1.5 px-4 py-2 gradient-btn-blue rounded-2xl font-black transition-all text-xs shadow-lg shadow-primary/20"
                                >
                                    <MessageCircle className="w-3.5 h-3.5" />
                                    チャット
                                </button>
                                {item.unreadCount > 0 && (
                                    <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center border-2 border-white shadow-md animate-pulse">
                                        {item.unreadCount > 99 ? "99+" : item.unreadCount}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    {item.final_meetup_time && (
                        <div className="mt-3 pt-3 border-t border-gray-50 flex flex-col gap-1">
                            <div className="flex items-center gap-2 text-gray-500 font-bold text-[11px]">
                                <Clock className="w-3 h-3 text-primary/40" />
                                <span>{item.final_meetup_time}</span>
                            </div>
                            {item.final_meetup_location && (
                                <div className="flex items-center gap-2 text-gray-400 font-medium text-[11px]">
                                    <MapPin className="w-3 h-3 text-primary/40" />
                                    <span>{item.final_meetup_location}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    const profileCard = profile ? (
        <Link href="/profile" className="mt-6 block group lg:mt-0">
            <div className="flex items-center gap-4 bg-gray-50 rounded-[28px] p-4 transition-all hover:bg-gray-100 hover:scale-[1.02] active:scale-[0.98] lg:bg-white lg:shadow-sm lg:border lg:border-gray-100">
                <RewardAvatar
                    src={avatarUrl}
                    alt="プロフィール"
                    size={56}
                    listingCount={profileAvatar.listingCount}
                    earlyRegistration={profileAvatar.earlyRegistration}
                    adminFrame={user?.email?.toLowerCase() === "textnextbbs@gmail.com"}
                    className="shadow-md"
                />
                <div className="flex-1">
                    <p className="font-black text-gray-900 text-lg">{profile.nickname}</p>
                    <div className="flex items-center gap-1.5 text-gray-500">
                        <GraduationCap className="w-4 h-4 text-primary/40" />
                        <span className="text-xs font-bold uppercase tracking-wider">{profile.department}</span>
                    </div>
                </div>
            </div>
        </Link>
    ) : null;

    return (
        <div className="min-h-screen bg-gray-50 pb-24 font-gentle lg:pb-12">
            <div className="lg:mx-auto lg:max-w-5xl lg:px-6">
            <header className="bg-white px-6 pt-10 pb-8 rounded-b-[40px] shadow-sm lg:mt-6 lg:rounded-[40px] lg:pt-6 lg:pb-5">
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                        <h1 className="text-4xl font-black text-gray-900 tracking-tight lg:text-2xl">{t('transactions.title')}</h1>
                        {totalUnreadCount > 0 && (
                            <span className="bg-red-500 text-white text-xs font-black px-2.5 py-1 rounded-full shadow-lg shadow-red-500/20">
                                {totalUnreadCount}
                            </span>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowFlowHelp(true)}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-100 bg-gray-50 text-gray-500 shadow-sm transition-all active:scale-95"
                        aria-label="取引の流れを表示"
                    >
                        <HelpCircle className="h-[18px] w-[18px]" />
                    </button>
                </div>

                {/* プロフィール（モバイルはヘッダー内、PCはサイドバーに表示） */}
                <div className="lg:hidden">{profileCard}</div>
            </header>

            <div className="px-6 -mt-6 lg:hidden">
                <div className="bg-white/80 backdrop-blur-md rounded-[32px] p-1.5 flex shadow-xl border border-white/50">
                    <button
                        onClick={() => setActiveTab("upcoming")}
                        className={`flex-1 py-4 text-sm font-black transition-all rounded-[24px] relative ${activeTab === "upcoming"
                            ? "gradient-btn-tab"
                            : "text-gray-400 hover:text-gray-600"
                            }`}
                    >
                        {t('transactions.upcoming')} ({confirmedItems.length})
                    </button>
                    <button
                        onClick={() => setActiveTab("adjusting")}
                        className={`flex-1 py-4 text-sm font-black transition-all rounded-[24px] ${activeTab === "adjusting"
                            ? "gradient-btn-tab"
                            : "text-gray-400 hover:text-gray-600"
                            }`}
                    >
                        日程調整中 ({adjustingItems.length})
                    </button>
                </div>
            </div>

            <div className="lg:mt-6 lg:flex lg:items-start lg:gap-6">
            {/* サイドバー（PCのみ：プロフィール＋縦タブ） */}
            <aside className="hidden lg:block lg:w-72 lg:flex-shrink-0 lg:space-y-4">
                {profileCard}
                <div className="bg-white/80 backdrop-blur-md rounded-[32px] p-1.5 flex flex-col gap-1.5 shadow-xl border border-white/50">
                    <button
                        onClick={() => setActiveTab("upcoming")}
                        className={`w-full py-4 text-sm font-black transition-all rounded-[24px] ${activeTab === "upcoming" ? "gradient-btn-tab" : "text-gray-400 hover:text-gray-600"}`}
                    >
                        {t('transactions.upcoming')} ({confirmedItems.length})
                    </button>
                    <button
                        onClick={() => setActiveTab("adjusting")}
                        className={`w-full py-4 text-sm font-black transition-all rounded-[24px] ${activeTab === "adjusting" ? "gradient-btn-tab" : "text-gray-400 hover:text-gray-600"}`}
                    >
                        日程調整中 ({adjustingItems.length})
                    </button>
                </div>
            </aside>

            <div className="px-6 py-8 lg:flex-1 lg:px-0 lg:py-0 lg:min-w-0">
                {activeTab === "upcoming" ? (
                    sortedDates.length === 0 ? (
                        <div className="text-center py-20 bg-white rounded-[40px] shadow-sm border border-gray-100">
                            <BookOpen className="w-20 h-20 text-gray-100 mx-auto mb-4" />
                            <p className="text-gray-400 font-black">{t('transactions.no_upcoming')}</p>
                        </div>
                    ) : (
                        <div className="space-y-10">
                            {sortedDates.map((date) => {
                                return (
                                    <section key={date} className="space-y-4">
                                        <div className="flex items-center gap-3 px-2">
                                            <div className="w-10 h-10 bg-white rounded-2xl shadow-sm flex items-center justify-center border border-gray-100">
                                                <Calendar className="w-5 h-5 text-primary" />
                                            </div>
                                            <div>
                                                <h2 className="font-black tracking-tight text-gray-900 text-xl">
                                                    {date}
                                                </h2>
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">確定済み</p>
                                            </div>
                                        </div>
                                        <div className="space-y-4">
                                            {groupedItemsByDate[date].map((item, idx) => renderItem(item, idx))}
                                        </div>
                                    </section>
                                );
                            })}
                        </div>
                    )
                ) : activeTab === "adjusting" ? (
                    <div className="space-y-4">
                        {adjustingItems.length === 0 ? (
                            <div className="text-center py-20 bg-white rounded-[40px] shadow-sm border border-gray-100">
                                <Calendar className="w-20 h-20 text-gray-100 mx-auto mb-4" />
                                <p className="text-gray-400 font-black">{t('transactions.no_pending')}</p>
                            </div>
                        ) : (
                            adjustingItems.map((item, idx) => renderItem(item, idx))
                        )}
                    </div>
                ) : null}
            </div>
            </div>
            </div>
            {showFlowHelp && <TransactionFlowHelp onClose={() => setShowFlowHelp(false)} />}
        </div>
    );
}

function TransactionFlowHelp({ onClose }: { onClose: () => void }) {
    const [activeRole, setActiveRole] = useState<"seller" | "buyer">("seller");

    const sellerFlow = [
        { title: "購入リクエストを承認", description: "購入者とのチャットが作成されます。" },
        { title: "チャットで日程調整", description: "受け渡し日時・場所を決めます。" },
        { title: "当日受け渡し", description: "待ち合わせ場所で教科書を手渡しします。" },
        { title: "QRコードを表示", description: "購入者に読み取ってもらいます。" },
        { title: "評価して取引完了", description: "お互いに評価すると取引が終了します。" },
    ];

    const buyerFlow = [
        { title: "購入リクエストを送信", description: "出品者とのチャットが作成されます。" },
        { title: "チャットで日程調整", description: "受け渡し日時・場所を決めます。" },
        { title: "当日受け渡し", description: "待ち合わせ場所で教科書を受け取ります。" },
        { title: "QRコードを読み取り", description: "そのまま評価画面へ進みます。" },
        { title: "評価して取引完了", description: "お互いの評価が完了すると取引終了です。" },
    ];

    return (
        <div className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto bg-slate-900/35 px-4 pb-4 pt-[calc(env(safe-area-inset-top)+5rem)] backdrop-blur-sm sm:items-center sm:pb-0 sm:pt-0">
            <button
                type="button"
                className="absolute inset-0 cursor-default"
                onClick={onClose}
                aria-label="閉じる"
            />
            <div className="relative max-h-[calc(100dvh-env(safe-area-inset-top)-6rem)] w-full max-w-2xl overflow-y-auto rounded-[32px] bg-white p-5 shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:p-6">
                <div className="mb-5 flex items-start justify-between gap-4">
                    <div>
                        <p className="text-xs font-black uppercase tracking-widest text-primary/60">Transaction Flow</p>
                        <h2 className="mt-1 text-2xl font-black text-gray-900">取引の流れ</h2>
                        <p className="mt-2 text-sm font-bold leading-relaxed text-gray-500">
                            購入リクエスト後は「相談中」となり、日時や場所をチャットで決めます。
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition active:scale-95"
                        aria-label="取引の流れを閉じる"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl bg-gray-100 p-1 md:hidden">
                    {[
                        { key: "seller" as const, label: "出品者" },
                        { key: "buyer" as const, label: "購入者" },
                    ].map((role) => {
                        const isActive = activeRole === role.key;
                        return (
                            <button
                                key={role.key}
                                type="button"
                                onClick={() => setActiveRole(role.key)}
                                className={`rounded-xl px-3 py-2 text-sm font-black transition active:scale-[0.98] ${isActive
                                    ? "bg-white text-gray-900 shadow-sm"
                                    : "text-gray-500"
                                    }`}
                                aria-pressed={isActive}
                            >
                                {role.label}
                            </button>
                        );
                    })}
                </div>

                <div className="md:hidden">
                    {activeRole === "seller" ? (
                        <FlowCard title="出品者の流れ" tone="seller" items={sellerFlow} />
                    ) : (
                        <FlowCard title="購入者の流れ" tone="buyer" items={buyerFlow} />
                    )}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <div className="hidden md:block">
                        <FlowCard title="出品者の流れ" tone="seller" items={sellerFlow} />
                    </div>
                    <div className="hidden md:block">
                        <FlowCard title="購入者の流れ" tone="buyer" items={buyerFlow} />
                    </div>
                </div>
            </div>
        </div>
    );
}

function FlowCard({ title, tone, items }: { title: string; tone: "seller" | "buyer"; items: { title: string; description: string }[] }) {
    const toneClass = tone === "seller"
        ? "border-red-100 bg-red-50/60 text-red-600"
        : "border-blue-100 bg-blue-50/60 text-blue-600";

    return (
        <section className="rounded-[24px] border border-gray-100 bg-gray-50 p-4">
            <h3 className="mb-4 text-lg font-black text-gray-900">{title}</h3>
            <ol className="space-y-3">
                {items.map((item, index) => (
                    <li key={item.title} className="flex gap-3">
                        <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-black ${toneClass}`}>
                            {index + 1}
                        </span>
                        <div className="min-w-0">
                            <p className="text-sm font-black leading-relaxed text-gray-800">{item.title}</p>
                            <p className="mt-0.5 text-xs font-bold leading-relaxed text-gray-500">{item.description}</p>
                        </div>
                    </li>
                ))}
            </ol>
        </section>
    );
}
