"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Save, MessageSquare, Bell, BellOff } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { supabase } from "@/lib/supabase";
import { disableWebPush, enableWebPush, getCurrentPushStatus, getPushSupport } from "@/lib/web-push-client";
import type { PushPermissionState } from "@/lib/web-push-client";

export default function EmailNotificationsSettingsPage() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();
    
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);
    const [pushSupported, setPushSupported] = useState(false);
    const [pushSubscribed, setPushSubscribed] = useState(false);
    const [pushBusy, setPushBusy] = useState(false);
    const [pushTestBusy, setPushTestBusy] = useState(false);
    const [pushMessage, setPushMessage] = useState("");
    const [pushPermission, setPushPermission] = useState<PushPermissionState>("unsupported");

    // 通知設定のstate
    const [notifyWatch, setNotifyWatch] = useState(true);
    const [notifyProgress, setNotifyProgress] = useState(true);
    const [notifyReminders, setNotifyReminders] = useState(true);

    useEffect(() => {
        if (!authLoading && !user) {
            router.push("/auth/login");
        }
    }, [user, authLoading, router]);

    useEffect(() => {
        const fetchPreferences = async () => {
            if (!user) return;
            try {
                const { data, error } = await (supabase.from("profiles") as any)
                    .select("email_notify_watch_keywords, email_notify_transaction_progress, email_notify_reminders")
                    .eq("user_id", user.id)
                    .single();

                if (error) throw error;
                if (data) {
                    // もしDBにまだカラムがない/nullの場合はデフォルトtrueにする
                    setNotifyWatch(data.email_notify_watch_keywords ?? true);
                    setNotifyProgress(data.email_notify_transaction_progress ?? true);
                    setNotifyReminders(data.email_notify_reminders ?? true);
                }
            } catch (err) {
                console.error("Error fetching preferences:", err);
            } finally {
                setLoading(false);
            }
        };

        if (user) {
            fetchPreferences();
        }
    }, [user]);

    useEffect(() => {
        const checkPushStatus = async () => {
            const status = await getCurrentPushStatus();
            setPushSupported(status.supported);
            setPushPermission(status.permission);
            setPushSubscribed(status.subscribed);
        };

        if (user) {
            checkPushStatus();
        }
    }, [user]);

    const handleEnablePush = async () => {
        setPushBusy(true);
        setPushMessage("");
        setError("");

        try {
            const result = await enableWebPush();
            setPushPermission(result.permission);
            setPushSubscribed(result.subscribed);
            setPushMessage(result.message);
        } catch (err: any) {
            setPushMessage(err.message || "ホーム画面通知を有効にできませんでした。");
        } finally {
            setPushBusy(false);
        }
    };

    const handleDisablePush = async () => {
        setPushBusy(true);
        setPushMessage("");
        setError("");

        try {
            const result = await disableWebPush();
            setPushPermission(result.permission);
            setPushSubscribed(result.subscribed);
            setPushMessage(result.message);
        } catch (err: any) {
            setPushMessage(err.message || "ホーム画面通知を停止できませんでした。");
        } finally {
            setPushBusy(false);
        }
    };

    const handleSendTestPush = async () => {
        setPushTestBusy(true);
        setPushMessage("");
        setError("");

        try {
            const response = await fetch("/api/push/test", { method: "POST" });
            const result = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(result.message || result.error || "通知を送信できませんでした。");
            }

            setPushMessage("通知を送信しました。端末側の通知表示を確認してください。");
        } catch (err: any) {
            setPushMessage(err.message || "通知を送信できませんでした。");
        } finally {
            setPushTestBusy(false);
        }
    };

    const handleSave = async () => {
        if (!user) return;
        setSaving(true);
        setError("");
        setSuccess(false);

        try {
            const { error } = await (supabase.from("profiles") as any)
                .update({
                    email_notify_watch_keywords: notifyWatch,
                    email_notify_transaction_progress: notifyProgress,
                    email_notify_reminders: notifyReminders,
                })
                .eq("user_id", user.id);

            if (error) throw error;
            setSuccess(true);
            setTimeout(() => setSuccess(false), 3000);
        } catch (err: any) {
            setError(err.message || "設定の保存に失敗しました");
        } finally {
            setSaving(false);
        }
    };

    if (authLoading || loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 pb-32">
            <header className="bg-white px-6 pt-8 pb-6 border-b sticky top-0 z-10">
                <div className="flex items-center gap-4">
                    <Link href="/settings">
                        <ArrowLeft className="w-6 h-6 text-gray-600 hover:text-primary transition-colors" />
                    </Link>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <MessageSquare className="w-6 h-6 text-primary" />
                        メール通知設定
                    </h1>
                </div>
            </header>

            <main className="px-6 py-8">
                <div className="max-w-md mx-auto">
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                        
                        <p className="text-sm text-gray-600 mb-6 bg-blue-50 border border-blue-100 p-4 rounded-xl">
                            <span className="font-bold text-blue-800">重要:</span> 運営からのお知らせや、アカウントに関する重要なお知らせは、以下の設定にかかわらず必ず送信されます。
                        </p>

                        <section className="mb-8 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                            <div className="flex items-start gap-3">
                                <div className="mt-1 rounded-full bg-white p-2 text-primary shadow-sm">
                                    <Bell className="h-5 w-5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h2 className="text-sm font-bold text-gray-900">ホーム画面通知</h2>
                                    <p className="mt-1 text-xs leading-relaxed text-gray-600">
                                        ホーム画面に追加したTextNextで、お知らせやチャット通知を受け取るための準備です。通知の表示は端末・ブラウザの対応状況に左右されます。
                                    </p>

                                    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                                        {pushSubscribed ? (
                                            <button
                                                type="button"
                                                onClick={handleDisablePush}
                                                disabled={pushBusy}
                                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50"
                                            >
                                                {pushBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellOff className="h-4 w-4" />}
                                                通知を停止
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={handleEnablePush}
                                                disabled={pushBusy || !pushSupported || pushPermission === "denied"}
                                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-primary/90 disabled:bg-gray-300 disabled:text-gray-600"
                                            >
                                                {pushBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
                                                通知を許可して有効化
                                            </button>
                                        )}
                                        {pushSubscribed && (
                                            <button
                                                type="button"
                                                onClick={handleSendTestPush}
                                                disabled={pushTestBusy}
                                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-primary ring-1 ring-primary/30 transition-colors hover:bg-primary/5 disabled:opacity-50"
                                            >
                                                {pushTestBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
                                                通知を確認する
                                            </button>
                                        )}
                                    </div>

                                    {!pushSupported && (
                                        <p className="mt-3 text-xs font-bold text-gray-500">
                                            このブラウザではホーム画面通知に対応していません。
                                        </p>
                                    )}
                                    {pushPermission === "denied" && (
                                        <p className="mt-3 text-xs font-bold text-amber-700">
                                            通知がブロックされています。ブラウザまたは端末設定からTextNextの通知を許可してください。
                                        </p>
                                    )}
                                    {pushMessage && (
                                        <p className="mt-3 text-xs font-bold text-gray-700">
                                            {pushMessage}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </section>

                        <div className="space-y-6">
                            {/* 探している教科書 */}
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <h3 className="text-sm font-bold text-gray-900">探している教科書の新着通知</h3>
                                    <p className="text-xs text-gray-500 mt-1">登録したキーワードに一致する商品が出品された際に通知します。</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                                    <input type="checkbox" className="sr-only peer" checked={notifyWatch} onChange={(e) => setNotifyWatch(e.target.checked)} />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                                </label>
                            </div>

                            <hr className="border-gray-100" />

                            {/* 取引進展 */}
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <h3 className="text-sm font-bold text-gray-900">取引進展の通知</h3>
                                    <p className="text-xs text-gray-500 mt-1">購入リクエストの受信、承認、辞退、および相互評価の催促など、取引の進行に関する通知を行います。</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                                    <input type="checkbox" className="sr-only peer" checked={notifyProgress} onChange={(e) => setNotifyProgress(e.target.checked)} />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                                </label>
                            </div>

                            <hr className="border-gray-100" />

                            {/* リマインド */}
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <h3 className="text-sm font-bold text-gray-900">取引前日のリマインド通知</h3>
                                    <p className="text-xs text-gray-500 mt-1">商品の受け渡し予定日の前日に、取引の詳細（時間や場所など）をリマインドします。</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                                    <input type="checkbox" className="sr-only peer" checked={notifyReminders} onChange={(e) => setNotifyReminders(e.target.checked)} />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                                </label>
                            </div>

                        </div>

                        {error && (
                            <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm font-bold">
                                {error}
                            </div>
                        )}

                        {success && (
                            <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm font-bold flex items-center gap-2">
                                設定を保存しました。
                            </div>
                        )}

                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="w-full mt-8 py-4 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary/90 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-sm"
                        >
                            {saving ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <Save className="w-5 h-5" />
                            )}
                            設定を保存
                        </button>
                    </div>
                </div>
            </main>
        </div>
    );
}
