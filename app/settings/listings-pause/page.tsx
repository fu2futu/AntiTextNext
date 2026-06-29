"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { supabase } from "@/lib/supabase";
import {
    ArrowLeft,
    Pause,
    Play,
    Loader2,
    PauseCircle,
    CheckCircle,
    AlertTriangle,
    Plane,
} from "lucide-react";

export default function ListingsPausePage() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();

    const [loading, setLoading] = useState(true);
    const [isPaused, setIsPaused] = useState(false);
    const [availableCount, setAvailableCount] = useState(0);
    const [pausedCount, setPausedCount] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [doneMessage, setDoneMessage] = useState<string | null>(null);

    const fetchState = useCallback(async () => {
        if (!user) return;
        setError(null);
        try {
            const [{ data: profile }, availableRes, pausedRes] = await Promise.all([
                (supabase.from("profiles") as any)
                    .select("listings_paused_at")
                    .eq("user_id", user.id)
                    .maybeSingle(),
                supabase
                    .from("items")
                    .select("id", { count: "exact", head: true })
                    .eq("seller_id", user.id)
                    .eq("is_demo", false)
                    .eq("status", "available"),
                (supabase.from("items") as any)
                    .select("id", { count: "exact", head: true })
                    .eq("seller_id", user.id)
                    .eq("is_demo", false)
                    .eq("vacation_paused", true),
            ]);

            setIsPaused(Boolean(profile?.listings_paused_at));
            setAvailableCount(availableRes.count ?? 0);
            setPausedCount(pausedRes.count ?? 0);
        } catch {
            setError("状態の取得に失敗しました。時間をおいて再度お試しください。");
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        if (!authLoading && !user) {
            router.push("/auth/login?redirectTo=/settings/listings-pause");
            return;
        }
        if (user) {
            fetchState();
        }
    }, [user, authLoading, router, fetchState]);

    const handlePause = async () => {
        if (submitting) return;
        setSubmitting(true);
        setError(null);
        setDoneMessage(null);
        try {
            const { data, error: rpcError } = await (supabase as any).rpc("pause_my_listings");
            if (rpcError) throw rpcError;
            const count = data?.pausedCount ?? 0;
            setConfirmOpen(false);
            setDoneMessage(
                count > 0
                    ? `${count}件の出品を一時停止しました。`
                    : "停止できる出品はありませんでした。"
            );
            await fetchState();
        } catch {
            setError("一時停止に失敗しました。時間をおいて再度お試しください。");
        } finally {
            setSubmitting(false);
        }
    };

    const handleResume = async () => {
        if (submitting) return;
        setSubmitting(true);
        setError(null);
        setDoneMessage(null);
        try {
            const { data, error: rpcError } = await (supabase as any).rpc("resume_my_listings");
            if (rpcError) throw rpcError;
            const count = data?.resumedCount ?? 0;
            setDoneMessage(
                count > 0
                    ? `${count}件の出品を再開しました。`
                    : "再開する出品はありませんでした。"
            );
            await fetchState();
        } catch {
            setError("再開に失敗しました。時間をおいて再度お試しください。");
        } finally {
            setSubmitting(false);
        }
    };

    if (authLoading || loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 pb-16">
            <header className="bg-white px-6 pt-8 pb-6 border-b">
                <div className="flex items-center gap-3">
                    <Link href="/settings" aria-label="戻る">
                        <ArrowLeft className="w-6 h-6 text-gray-600" />
                    </Link>
                    <h1 className="text-3xl font-bold text-primary animate-slide-in-left">
                        おやすみモード
                    </h1>
                </div>
                <p className="mt-3 text-sm text-gray-500 leading-relaxed">
                    留学や長期の不在などで受け渡しができないときに、出品中の商品をまとめて一時停止できます。再開すると元の販売中に戻ります。
                </p>
            </header>

            <main className="px-6 py-6 max-w-xl mx-auto space-y-5">
                {/* 現在の状態 */}
                <section
                    className={`rounded-2xl p-5 border shadow-sm animate-slide-in-left ${
                        isPaused
                            ? "bg-yellow-50 border-yellow-200"
                            : "bg-white border-gray-100"
                    }`}
                >
                    <div className="flex items-center gap-3">
                        <div
                            className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                                isPaused ? "bg-yellow-100" : "bg-emerald-50"
                            }`}
                        >
                            {isPaused ? (
                                <Plane className="w-6 h-6 text-yellow-600" />
                            ) : (
                                <CheckCircle className="w-6 h-6 text-emerald-500" />
                            )}
                        </div>
                        <div>
                            <p className="font-black text-gray-900">
                                {isPaused ? "おやすみ中" : "通常どおり販売中"}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                                {isPaused
                                    ? `${pausedCount}件の出品を一時停止しています`
                                    : `販売中の出品 ${availableCount}件`}
                            </p>
                        </div>
                    </div>
                </section>

                {/* 結果・エラー表示 */}
                {doneMessage && (
                    <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm font-bold text-emerald-700">
                        <CheckCircle className="w-5 h-5 shrink-0" />
                        {doneMessage}
                    </div>
                )}
                {error && (
                    <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm font-bold text-red-600">
                        <AlertTriangle className="w-5 h-5 shrink-0" />
                        {error}
                    </div>
                )}

                {/* 操作 */}
                {isPaused ? (
                    <button
                        onClick={handleResume}
                        disabled={submitting}
                        className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-black hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-md shadow-emerald-500/20 active:scale-[0.99]"
                    >
                        {submitting ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <>
                                <Play className="w-5 h-5" />
                                出品を再開する
                            </>
                        )}
                    </button>
                ) : (
                    <button
                        onClick={() => {
                            setDoneMessage(null);
                            setError(null);
                            setConfirmOpen(true);
                        }}
                        disabled={submitting || availableCount === 0}
                        className="w-full py-4 bg-yellow-500 text-white rounded-2xl font-black hover:bg-yellow-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-md shadow-yellow-500/20 active:scale-[0.99]"
                    >
                        <Pause className="w-5 h-5" />
                        {availableCount === 0
                            ? "停止できる出品がありません"
                            : "出品を一括で一時停止する"}
                    </button>
                )}

                <ul className="text-xs text-gray-400 leading-relaxed space-y-1.5 px-1">
                    <li>・取引中・売却済みの商品は停止されません。</li>
                    <li>・個別に一時停止した商品は、再開しても自動では戻りません。</li>
                    <li>・一時停止中の商品は検索や一覧に表示されず、購入もできません。</li>
                </ul>
            </main>

            {/* 確認モーダル */}
            {confirmOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-6">
                    <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl animate-[fadeIn_0.2s_ease-out]">
                        <div className="w-14 h-14 mx-auto bg-yellow-50 rounded-2xl flex items-center justify-center mb-4">
                            <PauseCircle className="w-7 h-7 text-yellow-600" />
                        </div>
                        <h2 className="text-xl font-black text-gray-900 text-center mb-2">
                            出品を一括で一時停止しますか？
                        </h2>
                        <p className="text-sm text-gray-500 text-center leading-relaxed mb-6">
                            販売中の出品 {availableCount}件 を一時停止します。いつでもこの画面から再開できます。
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setConfirmOpen(false)}
                                disabled={submitting}
                                className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 disabled:opacity-50 transition-all"
                            >
                                キャンセル
                            </button>
                            <button
                                onClick={handlePause}
                                disabled={submitting}
                                className="flex-1 py-3 bg-yellow-500 text-white rounded-xl font-bold hover:bg-yellow-600 disabled:opacity-50 transition-all flex items-center justify-center gap-1.5"
                            >
                                {submitting ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    "一時停止する"
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
