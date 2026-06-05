"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { Smartphone, Share, MoreVertical, Plus, ArrowRight, CheckCircle, Loader2 } from "lucide-react";

type Platform = "ios" | "android" | "other";

function detectPlatform(): Platform {
    if (typeof navigator === "undefined") return "other";
    const ua = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) return "ios";
    if (/android/.test(ua)) return "android";
    return "other";
}

function isStandalone(): boolean {
    if (typeof window === "undefined") return false;
    return (
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as any).standalone === true
    );
}

export default function AddToHomePage() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();
    const [platform, setPlatform] = useState<Platform>("other");
    const [alreadyInstalled, setAlreadyInstalled] = useState(false);

    useEffect(() => {
        setPlatform(detectPlatform());
        setAlreadyInstalled(isStandalone());
    }, []);

    useEffect(() => {
        if (!authLoading && !user) {
            router.push("/auth/login");
        }
    }, [user, authLoading, router]);

    const handleSkip = () => {
        router.push("/");
        router.refresh();
    };

    if (authLoading) {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
        );
    }

    // 既にホーム画面から起動している場合
    if (alreadyInstalled) {
        return (
            <div className="min-h-screen bg-white">
                <div className="px-6 py-12">
                    <div className="max-w-md mx-auto text-center">
                        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce-in">
                            <CheckCircle className="w-10 h-10 text-green-600" />
                        </div>
                        <h1 className="text-2xl font-bold text-gray-900 mb-4 animate-slide-in-left">
                            準備完了
                        </h1>
                        <p className="text-gray-600 mb-8 animate-slide-in-left" style={{ animationDelay: '100ms' }}>
                            アプリとしてご利用いただいています。
                        </p>
                        <button
                            onClick={handleSkip}
                            className="w-full py-4 bg-primary text-white rounded-xl font-semibold text-lg hover:bg-primary/90 transition-all shadow-md hover:shadow-lg animate-slide-in-left"
                            style={{ animationDelay: '200ms' }}
                        >
                            TextNextをはじめる
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-white">
            <div className="px-6 py-8">
                <div className="max-w-md mx-auto">
                    {/* ヘッダー */}
                    <div className="text-center mb-8">
                        <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6 animate-bounce-in">
                            <Smartphone className="w-10 h-10 text-primary" />
                        </div>
                        <h1 className="text-2xl font-bold text-gray-900 mb-3 animate-slide-in-left">
                            登録完了
                        </h1>
                        <p className="text-gray-600 animate-slide-in-left" style={{ animationDelay: '100ms' }}>
                            TextNextをもっと快適に使うために、
                            <br />
                            <span className="font-semibold text-primary">ホーム画面に追加</span>するのがおすすめです！
                        </p>
                    </div>

                    {/* メリット説明 */}
                    <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 mb-6 animate-slide-in-left" style={{ animationDelay: '150ms' }}>
                        <h3 className="font-semibold text-blue-900 mb-3">ホーム画面に追加すると</h3>
                        <ul className="space-y-2 text-sm text-blue-800">
                            <li className="flex items-start gap-2">
                                <CheckCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                                <span>ワンタップですぐにアクセス</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <CheckCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                                <span>アプリのようにフルスクリーンで表示</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <CheckCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                                <span>ブラウザのURLバーが非表示に</span>
                            </li>
                        </ul>
                    </div>

                    {/* iOS向け手順 */}
                    {(platform === "ios" || platform === "other") && (
                        <div className="bg-white rounded-2xl shadow-lg border p-6 mb-4 animate-slide-in-left" style={{ animationDelay: '200ms' }}>
                            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                                iPhoneの場合（Safari）
                            </h3>
                            <div className="space-y-4">
                                <div className="flex items-start gap-3">
                                    <div className="w-7 h-7 bg-primary text-white rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold">
                                        1
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-gray-700 text-sm">
                                            画面下部の
                                            <span className="inline-flex items-center mx-1 px-1.5 py-0.5 bg-gray-100 rounded text-xs">
                                                <Share className="w-3.5 h-3.5 text-primary" />
                                            </span>
                                            <span className="font-semibold">共有ボタン</span>をタップ
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <div className="w-7 h-7 bg-primary text-white rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold">
                                        2
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-gray-700 text-sm">
                                            メニューをスクロールして
                                            <span className="inline-flex items-center mx-1 px-1.5 py-0.5 bg-gray-100 rounded text-xs">
                                                <Plus className="w-3.5 h-3.5" />
                                            </span>
                                            <span className="font-semibold">「ホーム画面に追加」</span>をタップ
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <div className="w-7 h-7 bg-primary text-white rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold">
                                        3
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-gray-700 text-sm">
                                            右上の<span className="font-semibold">「追加」</span>をタップして完了!!
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Android向け手順 */}
                    {(platform === "android" || platform === "other") && (
                        <div className="bg-white rounded-2xl shadow-lg border p-6 mb-6 animate-slide-in-left" style={{ animationDelay: '250ms' }}>
                            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                                Androidの場合（Chrome）
                            </h3>
                            <div className="space-y-4">
                                <div className="flex items-start gap-3">
                                    <div className="w-7 h-7 bg-primary text-white rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold">
                                        1
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-gray-700 text-sm">
                                            画面右上の
                                            <span className="inline-flex items-center mx-1 px-1.5 py-0.5 bg-gray-100 rounded text-xs">
                                                <MoreVertical className="w-3.5 h-3.5" />
                                            </span>
                                            <span className="font-semibold">メニュー</span>をタップ
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <div className="w-7 h-7 bg-primary text-white rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold">
                                        2
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-gray-700 text-sm">
                                            <span className="font-semibold">「ホーム画面に追加」</span>または
                                            <span className="font-semibold">「アプリをインストール」</span>をタップ
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <div className="w-7 h-7 bg-primary text-white rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold">
                                        3
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-gray-700 text-sm">
                                            <span className="font-semibold">「追加」</span>をタップして完了!!
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ボタン群 */}
                    <div className="space-y-3 animate-slide-in-left" style={{ animationDelay: '300ms' }}>
                        <button
                            onClick={handleSkip}
                            className="w-full py-4 bg-primary text-white rounded-xl font-semibold text-lg hover:bg-primary/90 transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                        >
                            TextNextをはじめる
                            <ArrowRight className="w-5 h-5" />
                        </button>
                        <p className="text-center text-xs text-gray-400">
                            ホーム画面への追加はいつでも行えます
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
