"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { useI18n, Locale } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import {
    ArrowLeft,
    MessageSquare,
    ChevronRight,
    UserX,
    AlertTriangle,
    Loader2,
    Lock,
    Eye,
    EyeOff,
    XCircle,
    CheckCircle,
    ShieldAlert,
    Bell,
    Globe,
    BookHeart,
} from "lucide-react";

type DeactivateStep = "idle" | "confirm" | "password" | "processing" | "done" | "error";

export default function SettingsPage() {
    const router = useRouter();
    const { user, loading: authLoading, signOut } = useAuth();
    const { locale, setLocale, t } = useI18n();

    // アカウント停止関連
    const [deactivateStep, setDeactivateStep] = useState<DeactivateStep>("idle");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [deactivateError, setDeactivateError] = useState("");
    const [hasActiveTransactions, setHasActiveTransactions] = useState(false);
    const [activeTransactionCount, setActiveTransactionCount] = useState(0);
    const [listingCount, setListingCount] = useState(0);
    const [checkingTransactions, setCheckingTransactions] = useState(false);

    useEffect(() => {
        if (!authLoading && !user) {
            router.push("/auth/login");
        }
    }, [user, authLoading, router]);

    // 取引状況を確認
    const checkTransactionStatus = async () => {
        if (!user) return;
        setCheckingTransactions(true);
        try {
            // 進行中の取引を確認（seller or buyer）
            const { data: activeTx } = await (supabase
                .from("transactions") as any)
                .select("id, status")
                .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
                .in("status", ["requested", "accepted", "scheduling", "scheduled", "awaiting_rating"]);

            const count = activeTx?.length || 0;
            setActiveTransactionCount(count);
            setHasActiveTransactions(count > 0);

            // 出品中の商品数を確認
            const { data: listings } = await (supabase
                .from("items") as any)
                .select("id")
                .eq("seller_id", user.id)
                .eq("status", "available");

            setListingCount(listings?.length || 0);
        } catch {
            // エラー時は安全のため取引ありとする
            setHasActiveTransactions(true);
        } finally {
            setCheckingTransactions(false);
        }
    };

    const handleStartDeactivate = async () => {
        await checkTransactionStatus();
        setDeactivateStep("confirm");
    };

    const handleConfirmDeactivate = () => {
        if (hasActiveTransactions) return;
        setDeactivateStep("password");
        setPassword("");
        setDeactivateError("");
    };

    const handleDeactivateSubmit = async () => {
        if (!user || !password.trim()) {
            setDeactivateError("パスワードを入力してください");
            return;
        }

        setDeactivateStep("processing");
        setDeactivateError("");

        try {
            // パスワード検証 (サインインし直す)
            const { error: authError } = await supabase.auth.signInWithPassword({
                email: user.email!,
                password,
            });

            if (authError) {
                setDeactivateError("パスワードが正しくありません");
                setDeactivateStep("password");
                return;
            }

            // アカウント停止APIを呼ぶ
            const res = await fetch("/api/deactivate-account", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: user.id }),
            });

            const data = await res.json();

            if (data.success) {
                setDeactivateStep("done");
                // 3秒後にサインアウトしてログイン画面へ
                setTimeout(async () => {
                    await signOut();
                    router.push("/auth/login");
                }, 3000);
            } else {
                setDeactivateError(data.error || "アカウント停止に失敗しました");
                setDeactivateStep("error");
            }
        } catch {
            setDeactivateError("通信エラーが発生しました");
            setDeactivateStep("error");
        }
    };

    if (authLoading) {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-white pb-32">
            <header className="bg-white px-6 pt-8 pb-6 border-b">
                <div className="flex items-center gap-4">
                    <Link href="/profile">
                        <ArrowLeft className="w-6 h-6 text-gray-600 hover:text-primary transition-colors" />
                    </Link>
                    <h1 className="text-3xl font-bold text-primary animate-slide-in-left">
                        その他設定
                    </h1>
                </div>
            </header>

            <div className="px-6 py-8">
                <div className="max-w-md mx-auto space-y-6">

                    {/* お問い合わせ */}
                    <section className="animate-slide-in-left">
                        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 px-1">
                            サポート
                        </h2>
                        <Link
                            href="/contact"
                            className="flex items-center justify-between px-5 py-4 bg-white rounded-2xl shadow-md border border-gray-100 hover:border-primary/30 transition-all group mb-3"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-primary/5 rounded-xl flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                                    <MessageSquare className="w-5 h-5 text-primary" />
                                </div>
                                <div>
                                    <span className="font-bold text-gray-700 group-hover:text-gray-900 transition-colors">お問い合わせ</span>
                                    <p className="text-xs text-gray-400 mt-0.5">不具合報告・通報・要望など</p>
                                </div>
                            </div>
                            <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                        </Link>
                        <Link
                            href="/book-requests"
                            className="flex items-center justify-between px-5 py-4 bg-white rounded-2xl shadow-md border border-gray-100 hover:border-primary/30 transition-all group"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-pink-50 rounded-xl flex items-center justify-center group-hover:bg-pink-100 transition-colors">
                                    <BookHeart className="w-5 h-5 text-pink-500" />
                                </div>
                                <div>
                                    <span className="font-bold text-gray-700 group-hover:text-gray-900 transition-colors">欲しい本をリクエスト</span>
                                    <p className="text-xs text-gray-400 mt-0.5">まだ無い本を運営に伝える</p>
                                </div>
                            </div>
                            <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                        </Link>
                    </section>

                    {/* 言語設定 */}
                    <section className="animate-slide-in-left" style={{ animationDelay: '25ms' }}>
                        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 px-1">
                            {t("settings.language")}
                        </h2>
                        <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
                            <div className="px-5 py-4">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                                        <Globe className="w-5 h-5 text-indigo-500" />
                                    </div>
                                    <span className="font-bold text-gray-700">{t("settings.language")}</span>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setLocale("ja")}
                                        className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all active:scale-95 ${
                                            locale === "ja"
                                                ? "bg-primary text-white shadow-md shadow-primary/20"
                                                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                                        }`}
                                    >
                                        🇯🇵 日本語
                                    </button>
                                    <button
                                        onClick={() => setLocale("en")}
                                        className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all active:scale-95 ${
                                            locale === "en"
                                                ? "bg-primary text-white shadow-md shadow-primary/20"
                                                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                                        }`}
                                    >
                                        🇺🇸 English
                                    </button>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 探している教科書 */}
                    <section className="animate-slide-in-left" style={{ animationDelay: '50ms' }}>
                        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 px-1">
                            通知設定
                        </h2>
                        <Link
                            href="/settings/watch-keywords"
                            className="flex items-center justify-between px-5 py-4 bg-white rounded-2xl shadow-md border border-gray-100 hover:border-primary/30 transition-all group mb-3"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-yellow-50 rounded-xl flex items-center justify-center group-hover:bg-yellow-100 transition-colors">
                                    <Bell className="w-5 h-5 text-yellow-600" />
                                </div>
                                <div>
                                    <span className="font-bold text-gray-700 group-hover:text-gray-900 transition-colors">探している教科書</span>
                                    <p className="text-xs text-gray-400 mt-0.5">キーワードを登録して出品通知を受け取る</p>
                                </div>
                            </div>
                            <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                        </Link>
                        <Link
                            href="/settings/email-notifications"
                            className="flex items-center justify-between px-5 py-4 bg-white rounded-2xl shadow-md border border-gray-100 hover:border-primary/30 transition-all group"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                                    <MessageSquare className="w-5 h-5 text-blue-600" />
                                </div>
                                <div>
                                    <span className="font-bold text-gray-700 group-hover:text-gray-900 transition-colors">メール通知設定</span>
                                    <p className="text-xs text-gray-400 mt-0.5">各種メール通知の受け取りを設定</p>
                                </div>
                            </div>
                            <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                        </Link>
                    </section>

                    {/* アカウント管理 */}
                    <section className="animate-slide-in-left" style={{ animationDelay: '100ms' }}>
                        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 px-1">
                            アカウント管理
                        </h2>
                        <button
                            onClick={handleStartDeactivate}
                            className="w-full flex items-center justify-between px-5 py-4 bg-white rounded-2xl shadow-md border border-gray-100 hover:border-red-200 transition-all group"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center group-hover:bg-red-100 transition-colors">
                                    <UserX className="w-5 h-5 text-red-500" />
                                </div>
                                <div className="text-left">
                                    <span className="font-bold text-gray-700 group-hover:text-red-600 transition-colors">アカウントを停止する</span>
                                    <p className="text-xs text-gray-400 mt-0.5">アカウントの利用を一時停止します</p>
                                </div>
                            </div>
                            <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-red-500 transition-all" />
                        </button>
                    </section>

                </div>
            </div>

            {/* === アカウント停止モーダル群 === */}

            {/* Step 1: 確認画面 */}
            {deactivateStep === "confirm" && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 animate-in fade-in duration-300">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDeactivateStep("idle")} />
                    <div className="relative bg-white w-full max-w-sm rounded-[28px] overflow-hidden shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-5 duration-300">
                        <div className="p-6">
                            <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mb-5 mx-auto">
                                <ShieldAlert className="w-8 h-8 text-red-500" />
                            </div>
                            <h2 className="text-xl font-black text-gray-900 text-center mb-2">
                                アカウントを停止しますか？
                            </h2>
                            <p className="text-gray-500 text-sm text-center mb-6">
                                以下の内容をご確認ください
                            </p>

                            {checkingTransactions ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                                    <span className="ml-2 text-gray-500 text-sm">確認中...</span>
                                </div>
                            ) : (
                                <div className="space-y-3 mb-6">
                                    {/* 進行中の取引 */}
                                    <div className={`flex items-start gap-3 p-3 rounded-xl border-2 ${hasActiveTransactions ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
                                        {hasActiveTransactions ? (
                                            <XCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                                        ) : (
                                            <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                                        )}
                                        <div>
                                            <p className={`text-sm font-bold ${hasActiveTransactions ? "text-red-700" : "text-green-700"}`}>
                                                進行中の取引
                                            </p>
                                            {hasActiveTransactions ? (
                                                <p className="text-xs text-red-600 mt-1">
                                                    {activeTransactionCount}件の進行中取引があります。<br />
                                                    取引が全て完了するまでアカウントを停止できません。
                                                </p>
                                            ) : (
                                                <p className="text-xs text-green-600 mt-1">
                                                    進行中の取引はありません
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* 出品中の商品 */}
                                    <div className="flex items-start gap-3 bg-yellow-50 border-2 border-yellow-200 p-3 rounded-xl">
                                        <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                                        <div>
                                            <p className="text-sm font-bold text-yellow-700">出品中の商品</p>
                                            <p className="text-xs text-yellow-600 mt-1">
                                                {listingCount > 0 ? (
                                                    <>出品中の{listingCount}件の商品は<span className="font-bold">すべて非公開</span>になります。</>
                                                ) : (
                                                    <>出品中の商品はありません。</>
                                                )}
                                            </p>
                                        </div>
                                    </div>

                                    {/* 復旧について */}
                                    <div className="flex items-start gap-3 bg-blue-50 border-2 border-blue-200 p-3 rounded-xl">
                                        <CheckCircle className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                                        <div>
                                            <p className="text-sm font-bold text-blue-700">アカウント復旧</p>
                                            <p className="text-xs text-blue-600 mt-1">
                                                停止後も再度ログインすることで復旧できます。データは保持されます。
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="space-y-2">
                                <button
                                    onClick={handleConfirmDeactivate}
                                    disabled={hasActiveTransactions || checkingTransactions}
                                    className="w-full bg-red-500 text-white py-3.5 rounded-2xl font-black shadow-lg shadow-red-500/20 hover:bg-red-600 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    停止手続きを進める
                                </button>
                                <button
                                    onClick={() => setDeactivateStep("idle")}
                                    className="w-full bg-gray-100 text-gray-500 py-3.5 rounded-2xl font-bold hover:bg-gray-200 transition-all"
                                >
                                    キャンセル
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Step 2: パスワード入力 */}
            {deactivateStep === "password" && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 animate-in fade-in duration-300">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDeactivateStep("idle")} />
                    <div className="relative bg-white w-full max-w-sm rounded-[28px] overflow-hidden shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-5 duration-300">
                        <div className="p-6">
                            <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mb-5 mx-auto">
                                <Lock className="w-8 h-8 text-red-500" />
                            </div>
                            <h2 className="text-xl font-black text-gray-900 text-center mb-2">
                                本人確認
                            </h2>
                            <p className="text-gray-500 text-sm text-center mb-6">
                                アカウント停止を確定するため、パスワードを入力してください
                            </p>

                            {deactivateError && (
                                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm font-medium">
                                    {deactivateError}
                                </div>
                            )}

                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    <Lock className="w-4 h-4 inline mr-1" />
                                    パスワード
                                </label>
                                <div className="relative">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="パスワードを入力"
                                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent transition-all pr-12"
                                        autoComplete="current-password"
                                    />
                                    <button
                                        type="button"
                                        tabIndex={-1}
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                    >
                                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <button
                                    onClick={handleDeactivateSubmit}
                                    disabled={!password.trim()}
                                    className="w-full bg-red-500 text-white py-3.5 rounded-2xl font-black shadow-lg shadow-red-500/20 hover:bg-red-600 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    アカウントを停止する
                                </button>
                                <button
                                    onClick={() => setDeactivateStep("confirm")}
                                    className="w-full bg-gray-100 text-gray-500 py-3.5 rounded-2xl font-bold hover:bg-gray-200 transition-all"
                                >
                                    戻る
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Step 3: 処理中 */}
            {deactivateStep === "processing" && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
                    <div className="relative bg-white w-full max-w-sm rounded-[28px] overflow-hidden shadow-2xl p-8 text-center">
                        <Loader2 className="w-12 h-12 animate-spin text-red-500 mx-auto mb-4" />
                        <p className="text-gray-600 font-medium">アカウントを停止しています...</p>
                    </div>
                </div>
            )}

            {/* Step 4: 完了 */}
            {deactivateStep === "done" && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 animate-in fade-in duration-300">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
                    <div className="relative bg-white w-full max-w-sm rounded-[28px] overflow-hidden shadow-2xl p-8 text-center">
                        <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-5 mx-auto">
                            <CheckCircle className="w-8 h-8 text-gray-500" />
                        </div>
                        <h2 className="text-xl font-black text-gray-900 mb-2">
                            アカウントを停止しました
                        </h2>
                        <p className="text-gray-500 text-sm mb-4">
                            ご利用ありがとうございました。<br />
                            再度ログインすることで復旧できます。
                        </p>
                        <p className="text-xs text-gray-400">
                            自動的にログアウトします...
                        </p>
                    </div>
                </div>
            )}

            {/* Step: エラー */}
            {deactivateStep === "error" && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 animate-in fade-in duration-300">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDeactivateStep("idle")} />
                    <div className="relative bg-white w-full max-w-sm rounded-[28px] overflow-hidden shadow-2xl p-8 text-center">
                        <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mb-5 mx-auto">
                            <XCircle className="w-8 h-8 text-red-500" />
                        </div>
                        <h2 className="text-xl font-black text-gray-900 mb-2">
                            エラーが発生しました
                        </h2>
                        <p className="text-gray-500 text-sm mb-6">
                            {deactivateError}
                        </p>
                        <button
                            onClick={() => setDeactivateStep("idle")}
                            className="w-full bg-gray-100 text-gray-700 py-3.5 rounded-2xl font-bold hover:bg-gray-200 transition-all"
                        >
                            閉じる
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
