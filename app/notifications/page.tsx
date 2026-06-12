"use client";

import { useRouter } from "next/navigation";
import { Bell, Inbox, MessageCircle, Star, XCircle, CheckCircle2, Loader2, ShoppingBag, CheckCheck, RefreshCw, BookHeart } from "lucide-react";
import { useState, useEffect, useRef, type TouchEvent as ReactTouchEvent } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/lib/i18n";

type Notification = {
    id: string;
    type: string;
    title: string;
    message: string;
    link_type: string | null;
    link_id: string | null;
    is_read: boolean;
    created_at: string;
};

export default function NotificationsPage() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();
    const { t } = useI18n();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);

    // Pull-to-Refresh
    const [pullDistance, setPullDistance] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const touchStartY = useRef(0);
    const isPulling = useRef(false);
    const PULL_THRESHOLD = 80;

    useEffect(() => {
        if (authLoading) return;

        if (!user) {
            router.push("/auth/login");
            return;
        }

        loadNotifications();

        // Subscribe to new notifications
        const channel = supabase
            .channel('notifications')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${user.id}`
                },
                () => {
                    loadNotifications();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user, authLoading, router]);

    const loadNotifications = async () => {
        if (!user) return;

        try {
            const { data, error } = await supabase
                .from("notifications")
                .select("*")
                .eq("user_id", user.id)
                .order("created_at", { ascending: false })
                .limit(50);

            if (!error && data) {
                setNotifications(data as Notification[]);
            }
        } catch (err) {
            console.error("Error loading notifications:", err);
        } finally {
            setLoading(false);
        }
    };

    // Pull-to-Refresh handlers（ホームと同じ挙動）
    const handleTouchStart = (e: ReactTouchEvent) => {
        if (window.scrollY === 0 && !isRefreshing) {
            touchStartY.current = e.touches[0].clientY;
            isPulling.current = true;
        }
    };

    const handleTouchMove = (e: ReactTouchEvent) => {
        if (!isPulling.current || isRefreshing) return;
        const diff = e.touches[0].clientY - touchStartY.current;
        if (diff > 0 && window.scrollY === 0) {
            setPullDistance(Math.min(diff * 0.5, 120));
        }
    };

    const handleTouchEnd = async () => {
        if (!isPulling.current) return;
        isPulling.current = false;

        if (pullDistance >= PULL_THRESHOLD && !isRefreshing) {
            setIsRefreshing(true);
            setPullDistance(PULL_THRESHOLD);
            try {
                await loadNotifications();
            } finally {
                setIsRefreshing(false);
                setPullDistance(0);
            }
        } else {
            setPullDistance(0);
        }
    };

    const markAllAsRead = async () => {
        if (!user) return;
        const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
        if (unreadIds.length === 0) return;

        try {
            await (supabase
                .from("notifications") as any)
                .update({ is_read: true })
                .eq("user_id", user.id)
                .eq("is_read", false);

            setNotifications(prev =>
                prev.map(n => ({ ...n, is_read: true }))
            );
        } catch (err) {
            console.error("Error marking all as read:", err);
        }
    };

    const handleNotificationClick = async (notification: Notification) => {
        // Mark as read
        if (!notification.is_read) {
            await (supabase
                .from("notifications") as any)
                .update({ is_read: true })
                .eq("id", notification.id);
        }

        const parseChatLink = (linkId: string) => {
            const [itemId, queryString] = linkId.split("?");
            const tx = queryString ? new URLSearchParams(queryString).get("tx") : null;
            return { itemId, tx };
        };
        const shouldOpenPastTransaction =
            notification.link_type === "chat" &&
            notification.link_id &&
            ["transaction_completed", "transaction_cancelled"].includes(notification.type);

        // Navigate based on link_type
        if (notification.type === "admin_inquiry_reply" && notification.link_id) {
            router.push(`/profile/inquiries/${notification.link_id}`);
        } else if (notification.type === "admin_inquiry_reply" || notification.type === "admin_restriction_notice") {
            router.push(`/notifications/${notification.id}`);
        } else if (shouldOpenPastTransaction && notification.link_id) {
            const { itemId, tx } = parseChatLink(notification.link_id);
            const params = new URLSearchParams({ view: "past", item: itemId });
            if (tx) params.set("tx", tx);
            router.push(`/profile?${params.toString()}`);
        } else if (notification.link_type === "chat" && notification.link_id) {
            const separator = notification.link_id.includes("?") ? "&" : "?";
            router.push(`/chat/${notification.link_id}${separator}from=notifications`);
        } else if (notification.link_type === "transaction" && notification.link_id) {
            router.push(`/transactions`);
        } else if (notification.link_type === "profile") {
            router.push(`/profile`);
        } else if (notification.link_type === "search" && notification.link_id) {
            router.push(`/search?q=${encodeURIComponent(notification.link_id)}`);
        } else if (notification.link_type === "product" && notification.link_id) {
            router.push(`/product/${notification.link_id}`);
        }
    };

    const getNotificationIcon = (type: string) => {
        switch (type) {
            case "purchase_request":
                return <ShoppingBag className="w-5 h-5 text-purple-500" />;
            case "rating_received":
                return <Star className="w-5 h-5 text-yellow-500" />;
            case "transaction_completed":
                return <CheckCircle2 className="w-5 h-5 text-green-500" />;
            case "message":
                return <MessageCircle className="w-5 h-5 text-blue-500" />;
            case "transaction_cancelled":
                return <XCircle className="w-5 h-5 text-red-500" />;
            case "watch_match":
                return <Bell className="w-5 h-5 text-primary" />;
            case "book_request_match":
                return <BookHeart className="w-5 h-5 text-pink-500" />;
            case "admin_inquiry_reply":
                return <Inbox className="w-5 h-5 text-primary" />;
            case "admin_restriction_notice":
                return <Bell className="w-5 h-5 text-red-500" />;
            default:
                return <Bell className="w-5 h-5 text-gray-500" />;
        }
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return t("notifications.just_now");
        if (diffMins < 60) return t("notifications.minutes_ago", { n: diffMins });
        if (diffHours < 24) return t("notifications.hours_ago", { n: diffHours });
        if (diffDays < 7) return t("notifications.days_ago", { n: diffDays });

        return `${date.getMonth() + 1}/${date.getDate()}`;
    };

    if (authLoading || loading) {
        return (
            <div className="min-h-screen bg-white pb-24 lg:pb-12">
                <div className="lg:max-w-3xl lg:mx-auto lg:px-6">
                    <header className="bg-white px-6 pt-10 pb-8 rounded-b-[40px] shadow-sm lg:mt-6 lg:rounded-[28px] lg:pt-6 lg:pb-5">
                        <div className="flex items-center justify-between">
                            <h1 className="text-4xl font-black text-gray-900 tracking-tight lg:text-2xl">
                                {t("notifications.title")}
                            </h1>
                            <Loader2 className="w-5 h-5 text-primary animate-spin" />
                        </div>
                    </header>
                    <div className="divide-y divide-gray-100">
                        {Array.from({ length: 6 }).map((_, index) => (
                            <div key={index} className="px-6 py-4 flex items-start gap-4">
                                <div className="mt-1 h-5 w-5 rounded-full bg-gray-100 animate-pulse" />
                                <div className="min-w-0 flex-1">
                                    <div className="mb-2 h-4 w-2/3 rounded bg-gray-100 animate-pulse" />
                                    <div className="h-3 w-full rounded bg-gray-100 animate-pulse" />
                                    <div className="mt-2 h-3 w-1/2 rounded bg-gray-100 animate-pulse" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            className="min-h-screen bg-white pb-24 lg:pb-12"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            {/* Pull-to-Refresh Indicator */}
            <div
                className="flex items-center justify-center overflow-hidden transition-all duration-200"
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
                    {isRefreshing ? t('home.refreshing') : t('home.pull_to_refresh')}
                </span>
            </div>

            <div className="lg:max-w-3xl lg:mx-auto lg:px-6">
            {/* Header */}
            <header className="bg-white px-6 pt-10 pb-8 rounded-b-[40px] shadow-sm lg:mt-6 lg:rounded-[28px] lg:pt-6 lg:pb-5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <h1 className="text-4xl font-black text-gray-900 tracking-tight lg:text-2xl">
                            {t("notifications.title")}
                        </h1>
                    </div>
                    {notifications.some(n => !n.is_read) && (
                        <button
                            onClick={markAllAsRead}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-primary bg-primary/5 hover:bg-primary/10 rounded-full transition-colors"
                        >
                            <CheckCheck className="w-4 h-4" />
                            {t("notifications.mark_all_read")}
                        </button>
                    )}
                </div>
            </header>

            {/* Notifications List */}
            {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 px-6">
                    <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-6">
                        <Inbox className="w-10 h-10 text-gray-400" />
                    </div>
                    <h2 className="text-lg font-bold text-gray-900 mb-2">
                        {t("notifications.no_notifications")}
                    </h2>
                    <p className="text-gray-500 text-center max-w-xs">
                        新しいお知らせがあるとここに表示されます
                    </p>
                </div>
            ) : (
                <div className="divide-y divide-gray-100">
                    {notifications.map((notification) => (
                        <button
                            key={notification.id}
                            onClick={() => handleNotificationClick(notification)}
                            className={`w-full px-6 py-4 flex items-start gap-4 hover:bg-gray-50 transition-colors text-left ${
                                !notification.is_read ? "bg-blue-50/50" : ""
                            }`}
                        >
                            <div className="flex-shrink-0 mt-1">
                                {getNotificationIcon(notification.type)}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2 mb-1">
                                    <h3 className="font-bold text-gray-900 text-sm">
                                        {notification.title}
                                    </h3>
                                    <span className="text-xs text-gray-400 flex-shrink-0">
                                        {formatDate(notification.created_at)}
                                    </span>
                                </div>
                                <p className="text-sm text-gray-600 line-clamp-2">
                                    {notification.message}
                                </p>
                                {!notification.is_read && (
                                    <div className="w-2 h-2 bg-primary rounded-full mt-2" />
                                )}
                            </div>
                        </button>
                    ))}
                </div>
            )}
            </div>
        </div>
    );
}
