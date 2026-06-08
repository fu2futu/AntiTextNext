"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth-provider";
import { User, GraduationCap, CheckCircle, XCircle, Loader2, Bell } from "lucide-react";
import { enableWebPush, getCurrentPushStatus } from "@/lib/web-push-client";
import type { PushPermissionState } from "@/lib/web-push-client";

export default function SetupProfilePage() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();
    const [nickname, setNickname] = useState("");
    const [department, setDepartment] = useState("");
    const [degree, setDegree] = useState("学士");
    const [grade, setGrade] = useState("1");
    const [major, setMajor] = useState("");
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    // 通知設定
    const [notifyWatch, setNotifyWatch] = useState(true);
    const [notifyProgress, setNotifyProgress] = useState(true);
    const [notifyReminders, setNotifyReminders] = useState(true);
    const [pushSupported, setPushSupported] = useState(false);
    const [pushSubscribed, setPushSubscribed] = useState(false);
    const [pushBusy, setPushBusy] = useState(false);
    const [pushPermission, setPushPermission] = useState<PushPermissionState>("unsupported");
    const [pushMessage, setPushMessage] = useState("");

    // ユーザーネーム重複チェック用
    const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
    const [usernameMessage, setUsernameMessage] = useState("");
    const debounceRef = useRef<NodeJS.Timeout | null>(null);

    // 認証チェック
    useEffect(() => {
        if (!authLoading && !user) {
            router.push("/auth/login");
            return;
        }

        // 既にプロフィールが設定済みならホームへ
        if (user) {
            const checkProfile = async () => {
                const { data } = await (supabase
                    .from("profiles") as any)
                    .select("user_id")
                    .eq("user_id", user.id)
                    .single();

                if (data) {
                    router.push("/");
                }
            };
            checkProfile();
        }
    }, [user, authLoading, router]);

    useEffect(() => {
        const checkPushStatus = async () => {
            if (!user) return;
            const status = await getCurrentPushStatus();
            setPushSupported(status.supported);
            setPushPermission(status.permission);
            setPushSubscribed(status.subscribed);
        };

        checkPushStatus();
    }, [user]);

    // ユーザーネームのリアルタイム重複チェック
    const checkUsername = useCallback(async (value: string) => {
        if (!value || value.trim().length === 0) {
            setUsernameStatus("idle");
            setUsernameMessage("");
            return;
        }

        // フロントエンドバリデーション
        const usernameRegex = /^[a-zA-Z0-9_\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3400-\u4DBF]{2,20}$/;
        if (!usernameRegex.test(value)) {
            setUsernameStatus("invalid");
            setUsernameMessage("2〜20文字の日本語・英数字・アンダースコアのみ使用可能です");
            return;
        }

        setUsernameStatus("checking");
        setUsernameMessage("確認中...");

        try {
            const res = await fetch(`/api/check-username?nickname=${encodeURIComponent(value)}`);
            const data = await res.json();

            if (data.available) {
                setUsernameStatus("available");
                setUsernameMessage("使用できます");
            } else {
                setUsernameStatus("taken");
                setUsernameMessage(data.error || "このユーザーネームは使用されています");
            }
        } catch {
            setUsernameStatus("idle");
            setUsernameMessage("確認に失敗しました");
        }
    }, []);

    const handleNicknameChange = (value: string) => {
        setNickname(value);

        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }

        debounceRef.current = setTimeout(() => {
            checkUsername(value);
        }, 500);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (!user) {
            setError("認証情報が見つかりません。再度ログインしてください。");
            return;
        }

        if (usernameStatus !== "available") {
            setError("有効なユーザーネームを入力してください");
            return;
        }

        setSaving(true);

        try {
            const { error: profileError } = await (supabase
                .from("profiles") as any)
                .insert({
                    user_id: user.id,
                    nickname: nickname.trim(),
                    department,
                    degree,
                    grade: parseInt(grade),
                    major: (degree !== "学士" || parseInt(grade) >= 2) ? major : null,
                    email_notify_watch_keywords: notifyWatch,
                    email_notify_transaction_progress: notifyProgress,
                    email_notify_reminders: notifyReminders,
                    locale: "ja",
                });

            if (profileError) {
                if (profileError.message?.includes("duplicate") || profileError.message?.includes("unique")) {
                    setError("このユーザーネームは既に使用されています。別のユーザーネームを選んでください。");
                    setUsernameStatus("taken");
                    setUsernameMessage("このユーザーネームは使用されています");
                } else {
                    throw profileError;
                }
                return;
            }

            fetch("/api/auth/complete-registration", { method: "POST" }).catch((cleanupError) => {
                console.error("Failed to clear old deleted-account retention:", cleanupError);
            });

            router.push("/auth/add-to-home");
            router.refresh();
        } catch (err: any) {
            setError(err.message || "プロフィールの作成に失敗しました");
        } finally {
            setSaving(false);
        }
    };

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

    if (authLoading) {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
                    <p className="text-gray-500">読み込み中...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-white">
            <header className="bg-white px-6 pt-8 pb-6 border-b">
                <div className="flex items-center gap-4 mb-2">
                    <h1 className="text-3xl font-bold text-primary animate-slide-in-left">
                        プロフィール設定
                    </h1>
                </div>
                <p className="text-gray-500 text-sm animate-slide-in-left" style={{ animationDelay: '100ms' }}>
                    メール認証が完了しました！サービスを利用するために、プロフィールを設定してください。
                </p>
            </header>

            <div className="px-6 py-8">
                <div className="max-w-md mx-auto">
                    <div className="bg-white rounded-2xl shadow-lg border p-8">
                        <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center animate-slide-in-left">
                            初期設定
                        </h2>

                        {error && (
                            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                                {error}
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-4">
                            {/* ユーザーネーム */}
                            <div className="animate-slide-in-left">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    <User className="w-4 h-4 inline mr-1" />
                                    ユーザーネーム <span className="text-red-500">*</span>
                                </label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={nickname}
                                        onChange={(e) => handleNicknameChange(e.target.value)}
                                        placeholder="例: taro_123"
                                        className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 transition-all pr-10 ${
                                            usernameStatus === "available"
                                                ? "border-green-400 focus:ring-green-400"
                                                : usernameStatus === "taken" || usernameStatus === "invalid"
                                                    ? "border-red-400 focus:ring-red-400"
                                                    : "border-gray-300 focus:ring-primary"
                                        } focus:border-transparent`}
                                        required
                                        maxLength={20}
                                    />
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                        {usernameStatus === "checking" && (
                                            <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                                        )}
                                        {usernameStatus === "available" && (
                                            <CheckCircle className="w-5 h-5 text-green-500" />
                                        )}
                                        {(usernameStatus === "taken" || usernameStatus === "invalid") && (
                                            <XCircle className="w-5 h-5 text-red-500" />
                                        )}
                                    </div>
                                </div>
                                {usernameMessage && (
                                    <p className={`text-xs mt-1 ${
                                        usernameStatus === "available" ? "text-green-600" :
                                        usernameStatus === "taken" || usernameStatus === "invalid" ? "text-red-600" :
                                        "text-gray-500"
                                    }`}>
                                        {usernameMessage}
                                    </p>
                                )}
                                <p className="text-xs text-gray-400 mt-1">
                                    ※ 他のユーザーに表示される名前です。後から変更可能です。
                                </p>
                            </div>

                            {/* 学院 */}
                            <div className="animate-slide-in-left" style={{ animationDelay: '100ms' }}>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    <GraduationCap className="w-4 h-4 inline mr-1" />
                                    学院
                                </label>
                                <select
                                    value={department}
                                    onChange={(e) => {
                                        setDepartment(e.target.value);
                                        setMajor("");
                                    }}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                                    required
                                >
                                    <option value="">選択してください</option>
                                    <option value="理学院">理学院</option>
                                    <option value="工学院">工学院</option>
                                    <option value="物質理工学院">物質理工学院</option>
                                    <option value="情報理工学院">情報理工学院</option>
                                    <option value="生命理工学院">生命理工学院</option>
                                    <option value="環境・社会理工学院">環境・社会理工学院</option>
                                    <option value="その他">その他</option>
                                </select>
                            </div>

                            {/* 課程・学年 */}
                            <div className="flex gap-4 animate-slide-in-left" style={{ animationDelay: '200ms' }}>
                                <div className="flex-1">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        課程
                                    </label>
                                    <select
                                        value={degree}
                                        onChange={(e) => setDegree(e.target.value)}
                                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                                        required
                                    >
                                        <option value="学士">学士</option>
                                        <option value="修士">修士</option>
                                        <option value="博士">博士</option>
                                    </select>
                                </div>
                                <div className="flex-1">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        学年
                                    </label>
                                    <select
                                        value={grade}
                                        onChange={(e) => setGrade(e.target.value)}
                                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                                        required
                                    >
                                        {degree === "学士" && [1, 2, 3, 4].map(g => (
                                            <option key={g} value={g}>{g}年</option>
                                        ))}
                                        {degree === "修士" && [1, 2].map(g => (
                                            <option key={g} value={g}>{g}年</option>
                                        ))}
                                        {degree === "博士" && [1, 2, 3, 4, 5].map(g => (
                                            <option key={g} value={g}>{g}年</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* 系（専攻）- 条件付き表示 */}
                            {(degree !== "学士" || parseInt(grade) >= 2) && department && (
                                <div className="animate-slide-in-left" style={{ animationDelay: '250ms' }}>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        系（専攻）
                                    </label>
                                    <select
                                        value={major}
                                        onChange={(e) => setMajor(e.target.value)}
                                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                                        required
                                    >
                                        <option value="">選択してください</option>
                                        {department === "理学院" && ["数学系", "物理学系", "化学系", "地球惑星科学系"].map(m => (
                                            <option key={m} value={m}>{m}</option>
                                        ))}
                                        {department === "工学院" && ["機械系", "システム制御系", "電気電子系", "情報通信系", "経営工学系"].map(m => (
                                            <option key={m} value={m}>{m}</option>
                                        ))}
                                        {department === "物質理工学院" && ["材料系", "応用科学系"].map(m => (
                                            <option key={m} value={m}>{m}</option>
                                        ))}
                                        {department === "情報理工学院" && ["数理・計算科学系", "情報工学系"].map(m => (
                                            <option key={m} value={m}>{m}</option>
                                        ))}
                                        {department === "生命理工学院" && ["生命理工系"].map(m => (
                                            <option key={m} value={m}>{m}</option>
                                        ))}
                                        {department === "環境・社会理工学院" && ["建築学系", "土木・環境工学系", "融合理工学系"].map(m => (
                                            <option key={m} value={m}>{m}</option>
                                        ))}
                                        <option value="その他">その他</option>
                                    </select>
                                </div>
                            )}

                            {/* メール通知設定 */}
                            <div className="animate-slide-in-left bg-gray-50 p-4 rounded-xl border border-gray-200 mt-6" style={{ animationDelay: '280ms' }}>
                                <h3 className="text-sm font-bold text-gray-900 mb-2">メール通知設定</h3>
                                <p className="text-xs text-gray-600 mb-4">
                                    ※ 運営からの重要なお知らせは、設定にかかわらず必ず送信されます。
                                    以下の通知設定は後からマイページの設定で変更可能です。
                                </p>
                                <div className="space-y-3">
                                    <label className="flex items-start gap-3 cursor-pointer group">
                                        <div className="flex-shrink-0 mt-0.5">
                                            <input type="checkbox" checked={notifyWatch} onChange={(e) => setNotifyWatch(e.target.checked)} className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary" />
                                        </div>
                                        <span className="text-sm text-gray-700 group-hover:text-gray-900">探している教科書の新着通知</span>
                                    </label>
                                    <label className="flex items-start gap-3 cursor-pointer group">
                                        <div className="flex-shrink-0 mt-0.5">
                                            <input type="checkbox" checked={notifyProgress} onChange={(e) => setNotifyProgress(e.target.checked)} className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary" />
                                        </div>
                                        <span className="text-sm text-gray-700 group-hover:text-gray-900">取引進展の通知（購入リクエスト、承認、評価など）</span>
                                    </label>
                                    <label className="flex items-start gap-3 cursor-pointer group">
                                        <div className="flex-shrink-0 mt-0.5">
                                            <input type="checkbox" checked={notifyReminders} onChange={(e) => setNotifyReminders(e.target.checked)} className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary" />
                                        </div>
                                        <span className="text-sm text-gray-700 group-hover:text-gray-900">取引前日のリマインド通知</span>
                                    </label>
                                </div>
                            </div>

                            <div className="animate-slide-in-left bg-blue-50 p-4 rounded-xl border border-blue-100 mt-4" style={{ animationDelay: '290ms' }}>
                                <div className="flex items-start gap-3">
                                    <div className="mt-0.5 rounded-full bg-white p-2 text-primary shadow-sm">
                                        <Bell className="h-5 w-5" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <h3 className="text-sm font-bold text-gray-900 mb-1">プッシュ通知設定</h3>
                                        <p className="text-xs leading-relaxed text-gray-600">
                                            ホーム画面に追加したTextNextで、お知らせやチャット通知を受け取るための設定です。後からマイページの設定でも変更できます。
                                        </p>
                                        <button
                                            type="button"
                                            onClick={handleEnablePush}
                                            disabled={pushBusy || pushSubscribed || !pushSupported || pushPermission === "denied"}
                                            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-primary/90 disabled:bg-gray-300 disabled:text-gray-600"
                                        >
                                            {pushBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
                                            {pushSubscribed ? "プッシュ通知は有効です" : "プッシュ通知を有効にする"}
                                        </button>
                                        {!pushSupported && (
                                            <p className="mt-2 text-xs font-bold text-gray-500">
                                                このブラウザではホーム画面通知に対応していません。
                                            </p>
                                        )}
                                        {pushPermission === "denied" && (
                                            <p className="mt-2 text-xs font-bold text-amber-700">
                                                通知がブロックされています。ブラウザまたは端末設定からTextNextの通知を許可してください。
                                            </p>
                                        )}
                                        {pushMessage && (
                                            <p className="mt-2 text-xs font-bold text-gray-700">
                                                {pushMessage}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={saving || usernameStatus !== "available"}
                                className="w-full py-4 bg-primary text-white rounded-xl font-semibold text-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg mt-6 animate-slide-in-left"
                                style={{ animationDelay: '300ms' }}
                            >
                                {saving ? "設定中..." : "設定を完了してはじめる"}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
