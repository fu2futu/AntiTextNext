"use client";

export const dynamic = "force-dynamic";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import {
    ArrowLeft,
    Send,
    CheckCircle,
    AlertCircle,
    Loader2,
    BookHeart,
    BookOpen,
    User,
    GraduationCap,
} from "lucide-react";
import { INPUT_LIMITS } from "@/lib/input-limits";

type Step = "input" | "done" | "error";

function BookRequestContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, loading: authLoading } = useAuth();
    const [step, setStep] = useState<Step>("input");
    const [sending, setSending] = useState(false);

    const [bookTitle, setBookTitle] = useState("");
    const [author, setAuthor] = useState("");
    const [courseName, setCourseName] = useState("");
    const [errors, setErrors] = useState<Record<string, string>>({});

    // 検索0件からの遷移でタイトルを引き継ぐ
    useEffect(() => {
        const title = searchParams.get("title");
        if (title) setBookTitle(title.slice(0, INPUT_LIMITS.bookRequestTitleMax));
    }, [searchParams]);

    useEffect(() => {
        if (!authLoading && !user) {
            router.push("/auth/login");
        }
    }, [user, authLoading, router]);

    const validate = (): boolean => {
        const newErrors: Record<string, string> = {};
        if (!bookTitle.trim()) newErrors.bookTitle = "本のタイトルを入力してください";
        if (bookTitle.trim().length > INPUT_LIMITS.bookRequestTitleMax) newErrors.bookTitle = `本のタイトルは${INPUT_LIMITS.bookRequestTitleMax}文字以内で入力してください`;
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async () => {
        if (sending) return;
        if (!validate()) return;
        setSending(true);
        try {
            const res = await fetch("/api/book-requests", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    bookTitle: bookTitle.trim(),
                    author: author.trim(),
                    courseName: courseName.trim(),
                }),
            });
            const data = await res.json();
            if (data.success) {
                setStep("done");
            } else {
                console.error("Book request submit failed:", data.error);
                setStep("error");
            }
        } catch (error) {
            console.error("Book request submit error:", error);
            setStep("error");
        } finally {
            setSending(false);
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
    };

    if (authLoading) {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
        );
    }

    // ===== 送信完了 =====
    if (step === "done") {
        return (
            <div className="min-h-screen bg-white">
                <header className="bg-white px-6 pt-8 pb-6 border-b">
                    <div className="flex items-center gap-4">
                        <Link href="/">
                            <ArrowLeft className="w-6 h-6 text-gray-600 hover:text-primary transition-colors" />
                        </Link>
                        <h1 className="text-3xl font-bold text-primary animate-slide-in-left">
                            欲しい本をリクエスト
                        </h1>
                    </div>
                </header>
                <div className="px-6 py-12">
                    <div className="max-w-md mx-auto text-center">
                        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce-in">
                            <CheckCircle className="w-10 h-10 text-green-600" />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-4 animate-slide-in-left">
                            運営に届きました
                        </h2>
                        <p className="text-gray-500 text-sm mb-8 animate-slide-in-left" style={{ animationDelay: '100ms' }}>
                            運営がインスタのストーリーで呼びかけます。<br />
                            その本が出品されたら通知でお知らせします。
                        </p>
                        <Link
                            href="/"
                            className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-semibold hover:bg-primary/90 transition-all shadow-md animate-slide-in-left"
                            style={{ animationDelay: '200ms' }}
                        >
                            ホームに戻る
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
                        <Link href="/">
                            <ArrowLeft className="w-6 h-6 text-gray-600 hover:text-primary transition-colors" />
                        </Link>
                        <h1 className="text-3xl font-bold text-primary animate-slide-in-left">
                            欲しい本をリクエスト
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

    // ===== 入力フォーム =====
    return (
        <div className="min-h-screen bg-white">
            <header className="bg-white px-6 pt-8 pb-6 border-b">
                <div className="flex items-center gap-4">
                    <Link href="/">
                        <ArrowLeft className="w-6 h-6 text-gray-600 hover:text-primary transition-colors" />
                    </Link>
                    <h1 className="text-3xl font-bold text-primary animate-slide-in-left">
                        欲しい本をリクエスト
                    </h1>
                </div>
            </header>

            <div className="px-6 py-8">
                <div className="max-w-md mx-auto">
                    <div className="mb-6 flex items-start gap-3 rounded-2xl bg-primary/5 p-4 animate-fade-in">
                        <BookHeart className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-gray-600 leading-relaxed">
                            まだ出品されていない欲しい本を運営に伝えると、インスタのストーリーで呼びかけます。出品されたら通知でお知らせします。
                        </p>
                    </div>

                    <div className="bg-white rounded-2xl shadow-lg border p-6">
                        <div className="space-y-5">
                            {/* 本のタイトル */}
                            <div className="animate-slide-in-left">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    <BookOpen className="w-4 h-4 inline mr-1" />
                                    本のタイトル <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={bookTitle}
                                    onChange={(e) => setBookTitle(e.target.value)}
                                    placeholder="例）線形代数の世界"
                                    maxLength={INPUT_LIMITS.bookRequestTitleMax}
                                    className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all bg-gray-50 ${
                                        errors.bookTitle ? "border-red-400" : "border-gray-300"
                                    }`}
                                />
                                {errors.bookTitle && (
                                    <p className="text-xs text-red-500 mt-1">{errors.bookTitle}</p>
                                )}
                            </div>

                            {/* 著者・出版社 */}
                            <div className="animate-slide-in-left" style={{ animationDelay: '50ms' }}>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    <User className="w-4 h-4 inline mr-1" />
                                    著者・出版社 <span className="text-gray-400 text-xs">(任意)</span>
                                </label>
                                <input
                                    type="text"
                                    value={author}
                                    onChange={(e) => setAuthor(e.target.value)}
                                    placeholder="例）山田太郎 / ◯◯出版"
                                    maxLength={INPUT_LIMITS.bookRequestAuthorMax}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all bg-gray-50"
                                />
                            </div>

                            {/* 授業名・教科 */}
                            <div className="animate-slide-in-left" style={{ animationDelay: '100ms' }}>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    <GraduationCap className="w-4 h-4 inline mr-1" />
                                    授業名・教科 <span className="text-gray-400 text-xs">(任意)</span>
                                </label>
                                <input
                                    type="text"
                                    value={courseName}
                                    onChange={(e) => setCourseName(e.target.value)}
                                    placeholder="例）線形代数学第一"
                                    maxLength={INPUT_LIMITS.bookRequestCourseMax}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all bg-gray-50"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 animate-slide-in-left" style={{ animationDelay: '150ms' }}>
                        <button
                            onClick={handleSubmit}
                            disabled={sending}
                            className="w-full py-4 bg-primary text-white rounded-xl font-semibold text-lg hover:bg-primary/90 transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {sending ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    送信中...
                                </>
                            ) : (
                                <>
                                    <Send className="w-5 h-5" />
                                    運営にリクエストする
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function BookRequestPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-white flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
        }>
            <BookRequestContent />
        </Suspense>
    );
}
