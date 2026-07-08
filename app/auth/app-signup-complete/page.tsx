"use client";

import Link from "next/link";
import { CheckCircle, Smartphone } from "lucide-react";

export default function AppSignupCompletePage() {
    return (
        <div className="min-h-screen bg-white">
            <header className="bg-white px-6 pt-8 pb-6 border-b">
                <h1 className="text-3xl font-bold text-primary animate-slide-in-left">
                    メール認証完了
                </h1>
            </header>

            <div className="px-6 py-8">
                <div className="max-w-md mx-auto">
                    <div className="bg-white rounded-2xl shadow-lg border p-8 text-center">
                        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 animate-slide-in-left">
                            <CheckCircle className="w-10 h-10 text-green-600" />
                        </div>

                        <h2
                            className="text-2xl font-bold text-gray-900 mb-4 animate-slide-in-left"
                            style={{ animationDelay: "100ms" }}
                        >
                            メール認証が完了しました
                        </h2>

                        <p
                            className="text-gray-600 mb-6 animate-slide-in-left"
                            style={{ animationDelay: "200ms" }}
                        >
                            アカウントの認証が完了しました。
                            <br />
                            <span className="font-semibold text-primary">TextNextアプリに戻って</span>
                            、登録したメールアドレスとパスワードでログインしてください。
                        </p>

                        <div
                            className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-left mb-6 animate-slide-in-left"
                            style={{ animationDelay: "300ms" }}
                        >
                            <p className="flex items-center gap-2 text-sm text-blue-800 font-medium mb-2">
                                <Smartphone className="w-4 h-4" />
                                アプリに戻る手順
                            </p>
                            <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
                                <li>この画面を閉じる</li>
                                <li>ホーム画面などから TextNext アプリを開く</li>
                                <li>ログイン画面でメールアドレスとパスワードを入力</li>
                            </ol>
                        </div>

                        <p
                            className="text-xs text-gray-400 animate-slide-in-left"
                            style={{ animationDelay: "400ms" }}
                        >
                            このページはブラウザで開かれています。閉じてアプリに戻ってください。
                        </p>

                        <div
                            className="mt-6 animate-slide-in-left"
                            style={{ animationDelay: "500ms" }}
                        >
                            <Link
                                href="/auth/login"
                                className="text-sm text-gray-500 hover:text-primary hover:underline"
                            >
                                このブラウザでログインする場合はこちら
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
