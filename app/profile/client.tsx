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
import type { UserBadge } from "@/lib/rewards";

type Profile = {
    nickname: string;
    department: string;
    avatar_url: string | null;
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
    const [activeTab, setActiveTab] = useState<"past" | "listing" | null>(null);
    const [detailView, setDetailView] = useState<"favorites" | "listing" | "past">("favorites");
    const [pastFilter, setPastFilter] = useState<"completed" | "cancelled">("completed");
    const [favoriteItems, setFavoriteItems] = useState<Item[]>(initialFavoriteItems);
    const [showRewardsTutorial, setShowRewardsTutorial] = useState(false);
    const favoriteRefreshInFlightRef = useRef(false);
    const lastFavoriteRefreshAtRef = useRef(0);

    const isCancelledPastStatus = useCallback((status?: string | null) => {
        return ["cancelled", "rejected", "declined", "expired", "auto_closed"].includes(status || "");
    }, []);

    useEffect(() => {
        setFavoriteItems(initialFavoriteItems);
    }, [initialFavoriteItems]);

    const handleCloseRewardsTutorial = () => {
        setShowRewardsTutorial(false);
    };

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
                    return nextItems;
                });
            }
        } finally {
            favoriteRefreshInFlightRef.current = false;
        }
    }, [user]);

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
            ? initialPastItems.find((item) => item.transaction_id === targetTxId)
            : initialPastItems.find((item) => targetItemId && item.id === targetItemId);
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
    }, [initialPastItems, isCancelledPastStatus, searchParams]);

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

    const ratingStars = Math.round(averageRating);

    const completedPastItems = initialPastItems.filter((item) => {
        if (isCancelledPastStatus(item.transaction_status)) return false;
        return item.transaction_status === "completed" || item.status === "sold" || !item.transaction_status;
    });
    const cancelledPastItems = initialPastItems.filter((item) => isCancelledPastStatus(item.transaction_status));
    const visiblePastItems = pastFilter === "completed" ? completedPastItems : cancelledPastItems;
    const currentHistoryItems = detailView === "past" ? visiblePastItems : initialListingItems;

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
            {showRewardsTutorial && (
                <ProfileRewardsTutorial onClose={handleCloseRewardsTutorial} />
            )}

            <div className="lg:max-w-5xl lg:mx-auto lg:px-6">
            {/* Header */}
            <header className="bg-white px-6 pt-10 pb-8 rounded-b-[40px] shadow-sm lg:mt-6 lg:rounded-[28px] lg:pt-6 lg:pb-5">
                <div className="flex items-start justify-between gap-4">
                    <h1 className="text-4xl font-black text-gray-900 tracking-tight lg:text-2xl">
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

            <div className="px-6 pt-8 space-y-8 lg:px-0 lg:pt-6 lg:space-y-0 lg:flex lg:items-start lg:gap-6">
            {/* 左カラム: プロフィール＋各種ボタン＋規約 */}
            <div className="space-y-8 lg:space-y-6 lg:w-80 lg:flex-shrink-0">
                {/* Profile Section */}
                <div
                    onClick={() => router.push(`/seller/${user.id}?from=profile`)}
                    className="group relative bg-white/80 backdrop-blur-md rounded-3xl p-6 shadow-md border border-white/50 flex items-center gap-5 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:border-primary/30 cursor-pointer"
                >
                    {isAdmin && (
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
                        src={initialProfile?.avatar_url}
                        alt="Avatar"
                        size={80}
                        listingCount={listingCount}
                        earlyRegistration={earlyRegistrationEligible}
                        adminFrame={isAdmin}
                    />
                    <div className="flex-1 pr-24">
                        <h2 className="truncate text-xl font-bold text-gray-900">
                            {initialProfile?.nickname || "読み込み中..."}
                        </h2>
                        <RewardBadges badges={badges} />
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
                                ({averageRating.toFixed(1)})
                            </span>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-left">
                            <div className="rounded-xl bg-primary/5 px-2.5 py-1.5">
                                <p className="text-[9px] font-black leading-none text-primary/60">出品数</p>
                                <p className="mt-0.5 text-sm font-black leading-none text-primary">{listingCount}件</p>
                            </div>
                            <div className="rounded-xl bg-gray-50 px-2.5 py-1.5">
                                <p className="text-[9px] font-black leading-none text-gray-500">取引数</p>
                                <p className="mt-0.5 text-sm font-black leading-none text-gray-900">{transactionCount}件</p>
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
                        { key: "listing", label: t('profile.listing_items'), icon: BookOpen, count: initialListingItems.length },
                        { key: "past", label: t('profile.past_transactions'), icon: History, count: initialPastItems.length },
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
                    className="w-full bg-white rounded-2xl p-4 shadow-md border border-gray-100 flex items-center justify-between lg:justify-start lg:gap-3 group active:scale-[0.98] transition-all hover:border-primary/30"
                >
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center transition-colors group-hover:bg-gray-200">
                            <Settings className="w-5 h-5 text-gray-500" />
                        </div>
                        <span className="font-bold text-gray-700">設定</span>
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
                            className="w-full bg-white rounded-2xl p-4 shadow-md border border-gray-100 flex items-center justify-between lg:justify-start lg:gap-3 group active:scale-[0.98] transition-all hover:border-primary/30"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center transition-colors group-hover:bg-primary/15">
                                    <ArrowRight className="w-5 h-5 text-primary" />
                                </div>
                                <span className="font-bold text-gray-700">お問い合わせはこちらから</span>
                            </div>
                            <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-primary group-hover:translate-x-1 transition-all lg:hidden" />
                        </button>
                        <button
                            onClick={() => router.push("/profile/inquiries")}
                            className="w-full bg-white rounded-2xl p-4 shadow-md border border-gray-100 flex items-center justify-between lg:justify-start lg:gap-3 group active:scale-[0.98] transition-all hover:border-primary/30"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center transition-colors group-hover:bg-blue-100">
                                    <Inbox className="w-5 h-5 text-primary" />
                                </div>
                                <span className="font-bold text-gray-700">お問い合わせ履歴</span>
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
                    <h3 className="text-lg font-extrabold text-gray-800 flex items-center gap-2 px-1">
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
                            <span className={`text-base font-extrabold leading-none ${activeTab === "past" ? "text-white/90" : "text-primary"}`}>{initialPastItems.length}</span>
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
                            <span className={`text-base font-extrabold leading-none ${activeTab === "listing" ? "text-white/90" : "text-red-500"}`}>{initialListingItems.length}</span>
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
                                    {(activeTab === "past" ? visiblePastItems : initialListingItems).length}件
                                </span>
                            </div>
                            {activeTab === "past" && (
                                <div className="mb-4">
                                    <PastFilterSwitcher />
                                </div>
                            )}
                            <div className="space-y-3">
                                {(activeTab === "past" ? visiblePastItems : initialListingItems).map(renderHistoryRow)}
                                {(activeTab === "past" ? visiblePastItems : initialListingItems).length === 0 && (
                                    <p className="text-center py-8 text-sm text-gray-400">アイテムがありません</p>
                                )}
                            </div>
                        </div>
                    )}
                </section>

                {/* Favorites Section */}
                <section className="space-y-4 pb-4">
                    <div className="flex items-center justify-between px-1">
                        <h3 className="text-lg font-extrabold text-gray-800 flex items-center gap-2">
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
