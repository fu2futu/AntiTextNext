"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import {
    ArrowLeft,
    Send,
    ChevronRight,
    CheckCircle,
    AlertCircle,
    Loader2,
    Mail,
    User,
    FileText,
    MessageSquare,
    ArrowRight,
    ChevronLeft,
} from "lucide-react";
import { CONTACT_NOTICE_ITEMS } from "@/lib/legal";
import { INPUT_LIMITS } from "@/lib/input-limits";

const CATEGORIES = [
    { value: "bug", label: "不具合・バグ報告", icon: ""},
    { value: "report", label: "通報（ユーザー・出品物）", icon: "" },
    { value: "feature", label: "機能リクエスト・改善要望", icon: "" },
    { value: "account", label: "アカウントに関する問題", icon: "" },
    { value: "other", label: "その他", icon: "" },
];

type Step = "input" | "confirm" | "done" | "error";

export default function ContactPage() {
    const { user } = useAuth();
    const [step, setStep] = useState<Step>("input");
    const [sending, setSending] = useState(false);

    // フォームデータ
    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [category, setCategory] = useState("");
    const [content, setContent] = useState("");
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [contactNoticeConfirmed, setContactNoticeConfirmed] = useState(false);

    // ユーザー情報をプリロード
    useEffect(() => {
        if (user) {
            setEmail(user.email || "");
        }
    }, [user]);

    // ユーザーネームをプロフィールから取得
    useEffect(() => {
        if (!user) return;
        const fetchProfile = async () => {
            const { supabase } = await import("@/lib/supabase");
            const { data } = await (supabase
                .from("profiles") as any)
                .select("nickname")
                .eq("user_id", user.id)
                .single();
            if (data?.nickname) {
                setUsername(data.nickname);
            }
        };
        fetchProfile();
    }, [user]);

    const returnHref = user ? "/profile" : "/";

    const validate = (): boolean => {
        const newErrors: Record<string, string> = {};
        const trimmedEmail = email.trim();
        if (username.trim().length > INPUT_LIMITS.contactUsernameMax) newErrors.username = `ユーザー名は${INPUT_LIMITS.contactUsernameMax}文字以内で入力してください`;
        if (!trimmedEmail) {
            newErrors.email = "メールアドレスを入力してください";
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
            newErrors.email = "有効なメールアドレスを入力してください";
        }
        if (!category) newErrors.category = "お問い合わせ概要を選択してください";
        if (!content.trim()) newErrors.content = "お問い合わせ内容を入力してください";
        if (content.trim().length < INPUT_LIMITS.contactContentMin) newErrors.content = `お問い合わせ内容は${INPUT_LIMITS.contactContentMin}文字以上で入力してください`;
        if (content.trim().length > INPUT_LIMITS.contactContentMax) newErrors.content = `お問い合わせ内容は${INPUT_LIMITS.contactContentMax}文字以内で入力してください`;
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleNext = () => {
        if (validate()) {
            setContactNoticeConfirmed(false);
            setStep("confirm");
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
    };

    const handleBack = () => {
        setStep("input");
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const handleSubmit = async () => {
        if (sending || !contactNoticeConfirmed) return;
        setSending(true);
        try {
            const res = await fetch("/api/contact", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username: username.trim() || "未入力",
                    email: email.trim(),
                    category,
                    categoryLabel: CATEGORIES.find(c => c.value === category)?.label || category,
                    content: content.trim(),
                }),
            });

            const data = await res.json();

            if (data.success) {
                setStep("done");
            } else {
                console.error("Contact submit failed:", data.error);
                setStep("error");
            }
        } catch (error) {
            console.error("Contact submit error:", error);
            setStep("error");
        } finally {
            setSending(false);
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
    };

    const categoryInfo = CATEGORIES.find(c => c.value === category);

    // ===== 送信完了 =====
    if (step === "done") {
        return (
            <div className="min-h-screen bg-white">
                <header className="bg-white px-6 pt-8 pb-6 border-b">
                    <div className="flex items-center gap-4">
                        <Link href={returnHref}>
                            <ArrowLeft className="w-6 h-6 text-gray-600 hover:text-primary transition-colors" />
                        </Link>
                        <h1 className="text-3xl font-bold text-primary animate-slide-in-left">
                            お問い合わせ
                        </h1>
                    </div>
                </header>
                <div className="px-6 py-12">
                    <div className="max-w-md mx-auto text-center">
                        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce-in">
                            <CheckCircle className="w-10 h-10 text-green-600" />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-4 animate-slide-in-left">
                            送信完了
                        </h2>
                        <p className="text-gray-600 mb-2 animate-slide-in-left" style={{ animationDelay: '100ms' }}>
                            お問い合わせを受け付けました。
                        </p>
                        <p className="text-gray-500 text-sm mb-8 animate-slide-in-left" style={{ animationDelay: '150ms' }}>
                            内容を確認次第、ご連絡いたします。<br />
                            しばらくお待ちください。
                        </p>
                        <Link
                            href={returnHref}
                            className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-semibold hover:bg-primary/90 transition-all shadow-md animate-slide-in-left"
                            style={{ animationDelay: '200ms' }}
                        >
                            {user ? "マイページに戻る" : "トップに戻る"}
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    // ===== エラー =====
    if (step === "error") {
        return (
            <div className="min-h-screen bg-white">
                <header className="bg-white px-6 pt-8 pb-6 border-b">
                    <div className="flex items-center gap-4">
                        <Link href={returnHref}>
                            <ArrowLeft className="w-6 h-6 text-gray-600 hover:text-primary transition-colors" />
                        </Link>
                        <h1 className="text-3xl font-bold text-primary animate-slide-in-left">
                            お問い合わせ
                        </h1>
                    </div>
                </header>
                <div className="px-6 py-12">
                    <div className="max-w-md mx-auto text-center">
                        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce-in">
                            <AlertCircle className="w-10 h-10 text-red-600" />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-4 animate-slide-in-left">
                            送信に失敗しました
                        </h2>
                        <p className="text-gray-600 mb-8 animate-slide-in-left" style={{ animationDelay: '100ms' }}>
                            申し訳ございません。時間を置いて再度お試しください。
                        </p>
                        <button
                            onClick={() => setStep("input")}
                            className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-semibold hover:bg-primary/90 transition-all shadow-md animate-slide-in-left"
                            style={{ animationDelay: '200ms' }}
                        >
                            入力画面に戻る
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ===== 確認画面 =====
    if (step === "confirm") {
        return (
            <div className="min-h-screen bg-white">
                <header className="bg-white px-6 pt-8 pb-6 border-b">
                    <div className="flex items-center gap-4">
                        <button onClick={handleBack}>
                            <ArrowLeft className="w-6 h-6 text-gray-600 hover:text-primary transition-colors" />
                        </button>
                        <h1 className="text-3xl font-bold text-primary animate-slide-in-left">
                            内容確認
                        </h1>
                    </div>
                </header>

                <div className="px-6 py-8">
                    <div className="max-w-md mx-auto">
                        {/* ステップインジケーター */}
                        <div className="flex items-center justify-center gap-2 mb-8 animate-fade-in">
                            <div className="flex items-center gap-1">
                                <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-bold">
                                    ✓
                                </div>
                                <span className="text-xs text-gray-500 ml-1">入力</span>
                            </div>
                            <div className="w-8 h-0.5 bg-primary"></div>
                            <div className="flex items-center gap-1">
                                <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">
                                    2
                                </div>
                                <span className="text-xs text-primary font-semibold ml-1">確認</span>
                            </div>
                            <div className="w-8 h-0.5 bg-gray-200"></div>
                            <div className="flex items-center gap-1">
                                <div className="w-8 h-8 rounded-full bg-gray-200 text-gray-400 flex items-center justify-center text-sm font-bold">
                                    3
                                </div>
                                <span className="text-xs text-gray-400 ml-1">完了</span>
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl shadow-lg border p-6 animate-slide-in-left">
                            <p className="text-sm text-gray-500 mb-6">
                                以下の内容で送信します。よろしいですか？
                            </p>

                            <div className="space-y-5">
                                <div>
                                    <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                                        ユーザー名
                                        <span className="ml-1 text-xs font-normal text-gray-400">任意</span>
                                    </label>
                                    <p className="text-gray-900 font-medium mt-1">{username}</p>
                                </div>
                                <div className="border-t pt-4">
                                    <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                                        メールアドレス
                                    </label>
                                    <p className="text-gray-900 font-medium mt-1">{email}</p>
                                </div>
                                <div className="border-t pt-4">
                                    <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                                        お問い合わせ概要
                                    </label>
                                    <p className="text-gray-900 font-medium mt-1 flex items-center gap-2">
                                        <span>{categoryInfo?.icon}</span>
                                        {categoryInfo?.label}
                                    </p>
                                </div>
                                <div className="border-t pt-4">
                                    <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                                        お問い合わせ内容
                                    </label>
                                    <p className="text-gray-900 mt-1 whitespace-pre-wrap leading-relaxed text-sm bg-gray-50 rounded-xl p-4">
                                        {content}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 space-y-3 animate-slide-in-left" style={{ animationDelay: '100ms' }}>
                            <div className="rounded-xl border-2 border-red-200 bg-red-50 p-4 text-left">
                                <div className="flex items-center gap-2 mb-3">
                                    <AlertCircle className="w-5 h-5 text-red-600" />
                                    <h2 className="font-bold text-red-700">送信前の確認事項</h2>
                                </div>
                                <ul className="space-y-2 text-sm text-red-900">
                                    {CONTACT_NOTICE_ITEMS.map((item) => (
                                        <li key={item} className="flex gap-2">
                                            <span className="font-bold">・</span>
                                            <span>{item}</span>
                                        </li>
                                    ))}
                                </ul>
                                <button
                                    type="button"
                                    onClick={() => setContactNoticeConfirmed(true)}
                                    className={`mt-4 w-full rounded-xl py-3 font-semibold transition-all flex items-center justify-center gap-2 ${
                                        contactNoticeConfirmed
                                            ? "bg-green-600 text-white"
                                            : "bg-white text-red-700 border border-red-200 hover:bg-red-100"
                                    }`}
                                >
                                    <CheckCircle className="w-5 h-5" />
                                    {contactNoticeConfirmed ? "確認済み" : "確認した"}
                                </button>
                            </div>

                            <button
                                onClick={handleSubmit}
                                disabled={sending || !contactNoticeConfirmed}
                                className="w-full py-4 bg-primary text-white rounded-xl font-semibold text-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                            >
                                {sending ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        送信中...
                                    </>
                                ) : (
                                    <>
                                        <Send className="w-5 h-5" />
                                        送信する
                                    </>
                                )}
                            </button>
                            <button
                                onClick={handleBack}
                                disabled={sending}
                                className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                <ChevronLeft className="w-5 h-5" />
                                修正する
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ===== 入力フォーム =====
    return (
        <div className="min-h-screen bg-white">
            <header className="bg-white px-6 pt-8 pb-6 border-b">
                <div className="flex items-center gap-4">
                    <Link href={returnHref}>
                        <ArrowLeft className="w-6 h-6 text-gray-600 hover:text-primary transition-colors" />
                    </Link>
                    <h1 className="text-3xl font-bold text-primary animate-slide-in-left">
                        お問い合わせ
                    </h1>
                </div>
            </header>

            <div className="px-6 py-8">
                <div className="max-w-md mx-auto">
                    {/* ステップインジケーター */}
                    <div className="flex items-center justify-center gap-2 mb-8 animate-fade-in">
                        <div className="flex items-center gap-1">
                            <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">
                                1
                            </div>
                            <span className="text-xs text-primary font-semibold ml-1">入力</span>
                        </div>
                        <div className="w-8 h-0.5 bg-gray-200"></div>
                        <div className="flex items-center gap-1">
                            <div className="w-8 h-8 rounded-full bg-gray-200 text-gray-400 flex items-center justify-center text-sm font-bold">
                                2
                            </div>
                            <span className="text-xs text-gray-400 ml-1">確認</span>
                        </div>
                        <div className="w-8 h-0.5 bg-gray-200"></div>
                        <div className="flex items-center gap-1">
                            <div className="w-8 h-8 rounded-full bg-gray-200 text-gray-400 flex items-center justify-center text-sm font-bold">
                                3
                            </div>
                            <span className="text-xs text-gray-400 ml-1">完了</span>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl shadow-lg border p-6">
                        <div className="space-y-5">
                            <div className="rounded-2xl border border-sky-100 bg-sky-50/80 p-4 text-sm leading-relaxed text-sky-900 animate-slide-in-left">
                                <p className="font-bold text-sky-950">取引相手とのトラブルについて</p>
                                <p className="mt-2">
                                    取引相手とのトラブルや不審な行為があった場合は、こちらからお問い合わせください。運営側で取引内容やチャット履歴等を確認し、必要に応じて相手ユーザーへの確認、警告、利用制限、アカウント停止等の対応を行います。なお、運営から相手ユーザーのメールアドレス等の個人情報を開示することはありません。
                                </p>
                            </div>
                            {!user && (
                                <div className="rounded-2xl border border-amber-100 bg-amber-50/80 p-4 text-sm leading-relaxed text-amber-900 animate-slide-in-left">
                                    未ログインでも送信できます。返信が必要な場合があるため、連絡可能なメールアドレスを入力してください。
                                </div>
                            )}

                            {/* ユーザー名 */}
                            <div className="animate-slide-in-left">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    <User className="w-4 h-4 inline mr-1" />
                                    ユーザー名
                                </label>
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    placeholder="未入力でも送信できます"
                                    className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all bg-gray-50 ${
                                        errors.username ? "border-red-400" : "border-gray-300"
                                    }`}
                                />
                                {errors.username && (
                                    <p className="text-xs text-red-500 mt-1">{errors.username}</p>
                                )}
                            </div>

                            {/* メールアドレス */}
                            <div className="animate-slide-in-left" style={{ animationDelay: '50ms' }}>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    <Mail className="w-4 h-4 inline mr-1" />
                                    メールアドレス
                                </label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="your@email.com"
                                    className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all bg-gray-50 ${
                                        errors.email ? "border-red-400" : "border-gray-300"
                                    }`}
                                />
                                {errors.email && (
                                    <p className="text-xs text-red-500 mt-1">{errors.email}</p>
                                )}
                            </div>

                            {/* お問い合わせ概要 */}
                            <div className="animate-slide-in-left" style={{ animationDelay: '100ms' }}>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    <FileText className="w-4 h-4 inline mr-1" />
                                    お問い合わせ概要
                                </label>
                                <div className="space-y-2">
                                    {CATEGORIES.map((cat) => (
                                        <label
                                            key={cat.value}
                                            className={`flex items-center gap-3 px-4 py-3 border rounded-xl cursor-pointer transition-all ${
                                                category === cat.value
                                                    ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                                                    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                                            }`}
                                        >
                                            <input
                                                type="radio"
                                                name="category"
                                                value={cat.value}
                                                checked={category === cat.value}
                                                onChange={(e) => setCategory(e.target.value)}
                                                className="sr-only"
                                            />
                                            <span className="text-lg">{cat.icon}</span>
                                            <span className={`text-sm font-medium ${
                                                category === cat.value ? "text-primary" : "text-gray-700"
                                            }`}>
                                                {cat.label}
                                            </span>
                                            {category === cat.value && (
                                                <CheckCircle className="w-4 h-4 text-primary ml-auto" />
                                            )}
                                        </label>
                                    ))}
                                </div>
                                {errors.category && (
                                    <p className="text-xs text-red-500 mt-1">{errors.category}</p>
                                )}
                            </div>

                            {/* お問い合わせ内容 */}
                            <div className="animate-slide-in-left" style={{ animationDelay: '150ms' }}>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    <MessageSquare className="w-4 h-4 inline mr-1" />
                                    お問い合わせ内容
                                </label>
                                <textarea
                                    value={content}
                                    onChange={(e) => setContent(e.target.value)}
                                    placeholder="お問い合わせの詳細をできるだけ具体的にご記入ください（10文字以上）"
                                    rows={6}
                                    maxLength={INPUT_LIMITS.contactContentMax}
                                    className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all resize-none ${
                                        errors.content ? "border-red-400" : "border-gray-300"
                                    }`}
                                />
                                <div className="flex justify-between mt-1">
                                    {errors.content ? (
                                        <p className="text-xs text-red-500">{errors.content}</p>
                                    ) : (
                                        <span />
                                    )}
                                    <p className={`text-xs ${content.length < INPUT_LIMITS.contactContentMin ? "text-gray-400" : "text-green-600"}`}>
                                        {content.length}/{INPUT_LIMITS.contactContentMax}文字
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 animate-slide-in-left" style={{ animationDelay: '200ms' }}>
                        <button
                            onClick={handleNext}
                            className="w-full py-4 bg-primary text-white rounded-xl font-semibold text-lg hover:bg-primary/90 transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                        >
                            確認画面へ
                            <ArrowRight className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
