"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle, Loader2, Lock } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { supabase } from "@/lib/supabase";

export default function PasswordSettingsPage() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();
    const [currentPassword, setCurrentPassword] = useState("");
    const [verified, setVerified] = useState(false);
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [verifying, setVerifying] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    useEffect(() => {
        if (!authLoading && !user) {
            router.replace("/auth/login");
        }
    }, [authLoading, router, user]);

    const handleCurrentPasswordVerify = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!user?.email) return;

        setError("");
        setSuccess("");

        if (!currentPassword) {
            setError("現在のパスワードを入力してください");
            return;
        }

        setVerifying(true);
        try {
            const { error: verifyError } = await supabase.auth.signInWithPassword({
                email: user.email,
                password: currentPassword,
            });

            if (verifyError) throw verifyError;

            setVerified(true);
            setError("");
        } catch {
            setError("現在のパスワードが正しくありません。確認して再度入力してください。");
        } finally {
            setVerifying(false);
        }
    };

    const handlePasswordChange = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!user || !verified) return;

        setError("");
        setSuccess("");

        if (newPassword.length < 8) {
            setError("パスワードは8文字以上で入力してください");
            return;
        }

        if (newPassword !== confirmPassword) {
            setError("確認用パスワードが一致しません");
            return;
        }

        setSaving(true);
        try {
            const { error: updateError } = await supabase.auth.updateUser({
                password: newPassword,
            });

            if (updateError) throw updateError;

            setCurrentPassword("");
            setVerified(false);
            setNewPassword("");
            setConfirmPassword("");
            setSuccess("パスワードを更新しました。次回ログインから新しいパスワードを使えます。");
        } catch (err: any) {
            const message = String(err?.message || "").toLowerCase();
            if (message.includes("weak") || message.includes("password")) {
                setError("パスワード条件を満たしていません。8文字以上で、推測されにくいパスワードを入力してください。");
            } else {
                setError("パスワードの更新に失敗しました。時間を置いて再度お試しください。");
            }
        } finally {
            setSaving(false);
        }
    };

    if (authLoading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-white">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!user) return null;

    return (
        <div className="min-h-screen bg-white pb-24">
            <header className="border-b bg-white px-6 pb-6 pt-8">
                <div className="flex items-center gap-4">
                    <Link href="/settings" replace>
                        <ArrowLeft className="h-6 w-6 text-gray-600 transition-colors hover:text-primary" />
                    </Link>
                    <h1 className="text-3xl font-bold text-primary">
                        パスワード変更
                    </h1>
                </div>
            </header>

            <div className="px-6 py-8">
                <div className="mx-auto max-w-md">
                    <div className="rounded-2xl border bg-white p-8 shadow-lg">
                        {success && (
                            <div className="mb-5 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
                                <div className="flex items-center gap-2 font-bold">
                                    <CheckCircle className="h-5 w-5" />
                                    更新完了
                                </div>
                                <p className="mt-2">{success}</p>
                            </div>
                        )}

                        {error && (
                            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
                                {error}
                            </div>
                        )}

                        {!verified ? (
                            <form onSubmit={handleCurrentPasswordVerify} className="space-y-5">
                                <p className="text-sm leading-6 text-gray-600">
                                    パスワード変更の前に、現在のパスワードを確認します。
                                </p>
                                <div>
                                    <label className="mb-2 block text-sm font-medium text-gray-700">
                                        <Lock className="mr-1 inline h-4 w-4" />
                                        現在のパスワード
                                    </label>
                                    <input
                                        type="password"
                                        value={currentPassword}
                                        onChange={(event) => setCurrentPassword(event.target.value)}
                                        placeholder="現在のパスワードを入力"
                                        autoComplete="current-password"
                                        required
                                        className="w-full rounded-xl border border-gray-300 px-4 py-3 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary"
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={verifying}
                                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 text-lg font-semibold text-white shadow-md transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {verifying ? (
                                        <>
                                            <Loader2 className="h-5 w-5 animate-spin" />
                                            確認中...
                                        </>
                                    ) : (
                                        "現在のパスワードを確認"
                                    )}
                                </button>
                            </form>
                        ) : (
                            <form onSubmit={handlePasswordChange} className="space-y-5">
                                <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                                    現在のパスワードを確認しました。新しいパスワードを入力してください。
                                </div>

                                <div>
                                    <label className="mb-2 block text-sm font-medium text-gray-700">
                                        <Lock className="mr-1 inline h-4 w-4" />
                                        新しいパスワード
                                    </label>
                                    <input
                                        type="password"
                                        value={newPassword}
                                        onChange={(event) => setNewPassword(event.target.value)}
                                        placeholder="8文字以上"
                                        autoComplete="new-password"
                                        minLength={8}
                                        required
                                        className="w-full rounded-xl border border-gray-300 px-4 py-3 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary"
                                    />
                                </div>

                                <div>
                                    <label className="mb-2 block text-sm font-medium text-gray-700">
                                        <Lock className="mr-1 inline h-4 w-4" />
                                        新しいパスワード確認
                                    </label>
                                    <input
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(event) => setConfirmPassword(event.target.value)}
                                        placeholder="もう一度入力"
                                        autoComplete="new-password"
                                        minLength={8}
                                        required
                                        className="w-full rounded-xl border border-gray-300 px-4 py-3 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary"
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 py-4 text-lg font-semibold text-white shadow-md transition-all hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {saving ? (
                                        <>
                                            <Loader2 className="h-5 w-5 animate-spin" />
                                            更新中...
                                        </>
                                    ) : (
                                        "パスワードを更新"
                                    )}
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
