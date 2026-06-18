"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Mail, Lock } from "lucide-react";

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    // Prefetch the home page for instant transition
    useEffect(() => {
        router.prefetch("/");
    }, [router]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const redirectTo = new URLSearchParams(window.location.search).get("redirectTo");
            const response = await fetch("/api/auth/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    email,
                    password,
                    redirectTo,
                }),
            });
            const payload = await response.json();

            if (!response.ok) {
                throw new Error(payload.error || "ログイン情報が正しくありません");
            }

            router.push(payload.redirectTo || "/");
            router.refresh();
        } catch (err: any) {
            setError(err.message || "ログイン情報が正しくありません");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-white">
            <header className="bg-white px-5 pt-6 pb-4 border-b">
                <div className="flex items-center gap-4 mb-6">
                    <Link href="/">
                        <ArrowLeft className="w-6 h-6 text-gray-600 hover:text-primary transition-colors" />
                    </Link>
                    <h1 className="text-2xl font-bold text-primary animate-slide-in-left">
                        ログイン
                    </h1>
                </div>
            </header>

            <div className="px-6 py-8">
                <div className="max-w-md mx-auto">
                    <div className="bg-white rounded-2xl shadow-lg border p-8">
                        <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center animate-slide-in-left">
                            TextNext
                        </h2>

                        {error && (
                            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                                {error}
                            </div>
                        )}

                        <form onSubmit={handleLogin} className="space-y-5">
                            <div className="animate-slide-in-left" style={{ animationDelay: '100ms' }}>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    <Mail className="w-4 h-4 inline mr-1" />
                                    メールアドレス
                                </label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="example@m.isct.ac.jp"
                                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                                    required
                                />
                            </div>

                            <div className="animate-slide-in-left" style={{ animationDelay: '200ms' }}>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    <Lock className="w-4 h-4 inline mr-1" />
                                    パスワード
                                </label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="●●●●●●●●"
                                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                                    required
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-4 bg-primary text-white rounded-xl font-semibold text-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg animate-slide-in-left"
                                style={{ animationDelay: '300ms' }}
                            >
                                {loading ? "ログイン中..." : "ログイン"}
                            </button>
                        </form>

                        <div className="mt-6 text-center">
                            <Link
                                href="/auth/forgot-password"
                                className="text-sm text-gray-500 hover:text-primary hover:underline"
                            >
                                パスワードをお忘れですか？
                            </Link>
                        </div>

                        <div className="mt-4 text-center">
                            <p className="text-gray-600">
                                アカウントをお持ちでない方は
                            </p>
                            <Link
                                href="/auth/signup"
                                className="text-primary font-semibold hover:underline"
                            >
                                新規登録はこちら
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
