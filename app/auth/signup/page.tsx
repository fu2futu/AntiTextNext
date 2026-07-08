"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { ArrowLeft, Mail, Lock, X, KeyRound } from "lucide-react";
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION, PRIVACY_POLICY_TEXT, TERMS_TEXT } from "@/lib/legal";

type LegalKind = "terms" | "privacy";

const EMAIL_SEND_COOLDOWN_MS = 60 * 1000;

function formatCooldown(seconds: number) {
    return seconds >= 60 ? `${Math.ceil(seconds / 60)}分後` : `${seconds}秒後`;
}

function renderLegalText(text: string) {
    return text.split("\n").map((line, index) => {
        const trimmed = line.trim();

        if (!trimmed) {
            return <div key={index} className="h-4" />;
        }

        if (index === 0) {
            return (
                <h3 key={index} className="mb-5 text-xl font-black text-gray-900">
                    {trimmed}
                </h3>
            );
        }

        if (/^第\d+条/.test(trimmed) || trimmed === "附則") {
            return (
                <h4
                    key={index}
                    className="sticky top-0 z-10 mt-6 mb-3 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white shadow-sm"
                >
                    {trimmed}
                </h4>
            );
        }

        if (/^\d+\./.test(trimmed)) {
            return (
                <p key={index} className="mt-4 font-bold text-gray-900">
                    {trimmed}
                </p>
            );
        }

        if (/^\(\d+\)/.test(trimmed)) {
            return (
                <p key={index} className="ml-4 text-sm leading-7 text-gray-700">
                    {trimmed}
                </p>
            );
        }

        return (
            <p key={index} className="text-sm leading-7 text-gray-700">
                {trimmed}
            </p>
        );
    });
}

export default function SignupPage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [agreedToLegal, setAgreedToLegal] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [emailSent, setEmailSent] = useState(false);
    const [code, setCode] = useState("");
    const [verifying, setVerifying] = useState(false);
    const [activeLegal, setActiveLegal] = useState<LegalKind | null>(null);
    const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
    const [cooldownSeconds, setCooldownSeconds] = useState(0);

    // Prefetch login page for instant transition
    useEffect(() => {
        router.prefetch("/auth/login");
    }, [router]);

    useEffect(() => {
        if (!cooldownUntil) {
            setCooldownSeconds(0);
            return;
        }

        const updateCooldown = () => {
            const seconds = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
            setCooldownSeconds(seconds);
            if (seconds <= 0) {
                setCooldownUntil(null);
            }
        };

        updateCooldown();
        const timer = window.setInterval(updateCooldown, 1000);
        return () => window.clearInterval(timer);
    }, [cooldownUntil]);

    const normalizedEmail = email.trim().toLowerCase();

    const showError = (message: string) => {
        setError(message);
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const legalTitle = activeLegal === "terms" ? "利用規約" : "プライバシーポリシー";
    const legalText = activeLegal === "terms" ? TERMS_TEXT : PRIVACY_POLICY_TEXT;

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (cooldownUntil && Date.now() < cooldownUntil) {
            const remainingSeconds = Math.max(1, Math.ceil((cooldownUntil - Date.now()) / 1000));
            showError(`確認メールは連続送信できません。${formatCooldown(remainingSeconds)}に再度お試しください。`);
            return;
        }

        const eligibilityRes = await fetch("/api/auth/signup-eligibility", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: normalizedEmail }),
        });
        const eligibility = await eligibilityRes.json().catch(() => ({}));

        if (!eligibilityRes.ok || !eligibility.allowed) {
            showError(eligibility.error || "このメールアドレスでは登録できません");
            return;
        }

        // Validate password match
        if (password !== confirmPassword) {
            showError("パスワードが一致しません");
            return;
        }

        // Validate password length
        if (password.length < 6) {
            showError("パスワードは6文字以上で入力してください");
            return;
        }

        if (!agreedToLegal) {
            showError("利用規約・プライバシーポリシーへの同意が必要です");
            return;
        }

        setLoading(true);

        try {
            // ワンタイムパスワード(6桁コード)方式。
            // メールのリンクを踏ませず、アプリ内でコードを入力して認証する。
            // これによりアプリ↔ブラウザ間の遷移や PKCE の検証キー不一致を回避できる。
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: normalizedEmail,
                password,
                options: {
                    data: {
                        accepted_terms_version: CURRENT_TERMS_VERSION,
                        accepted_privacy_version: CURRENT_PRIVACY_VERSION,
                        accepted_legal_at: new Date().toISOString(),
                    },
                },
            });

            if (authError) throw authError;

            // コード入力画面へ切り替え（再送クールダウンも開始）
            setCode("");
            setCooldownUntil(Date.now() + EMAIL_SEND_COOLDOWN_MS);
            setEmailSent(true);
        } catch (err: any) {
            const message = err?.message || "";
            const code = err?.code || "";

            if (
                code === "user_already_exists" ||
                message.toLowerCase().includes("user already registered") ||
                message.toLowerCase().includes("already registered")
            ) {
                showError("このアドレスはすでに登録されています");
            } else {
                const isRateLimited =
                    err?.status === 429 ||
                    code === "over_email_send_rate_limit" ||
                    message.toLowerCase().includes("rate limit") ||
                    message.toLowerCase().includes("email rate limit");

                if (isRateLimited) {
                    setCooldownUntil(Date.now() + EMAIL_SEND_COOLDOWN_MS);
                    showError("メール送信が一時的に混み合っています。時間を置いてから再度お試しください。");
                } else {
                    showError(message || "登録に失敗しました");
                }
            }
        } finally {
            setLoading(false);
        }
    };

    // 6桁コードの検証
    const handleVerifyCode = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        const token = code.trim();
        if (!/^\d{6}$/.test(token)) {
            showError("6桁の確認コードを入力してください");
            return;
        }

        setVerifying(true);

        try {
            const { error: verifyError } = await supabase.auth.verifyOtp({
                email: normalizedEmail,
                token,
                type: "signup",
            });

            if (verifyError) throw verifyError;

            // 認証成功。アプリ内にセッションが確立されるのでプロフィール設定へ。
            router.push("/auth/setup-profile");
            router.refresh();
        } catch (err: any) {
            const message = (err?.message || "").toLowerCase();

            if (message.includes("expired")) {
                showError("確認コードの有効期限が切れています。コードを再送してください。");
            } else if (message.includes("invalid") || err?.status === 403) {
                showError("確認コードが正しくありません。もう一度ご確認ください。");
            } else {
                showError(err?.message || "確認に失敗しました");
            }
        } finally {
            setVerifying(false);
        }
    };

    // コード再送
    const handleResendCode = async () => {
        setError("");

        if (cooldownUntil && Date.now() < cooldownUntil) {
            const remainingSeconds = Math.max(1, Math.ceil((cooldownUntil - Date.now()) / 1000));
            showError(`確認コードは連続送信できません。${formatCooldown(remainingSeconds)}に再度お試しください。`);
            return;
        }

        try {
            const { error: resendError } = await supabase.auth.resend({
                type: "signup",
                email: normalizedEmail,
            });

            if (resendError) throw resendError;

            setCooldownUntil(Date.now() + EMAIL_SEND_COOLDOWN_MS);
        } catch (err: any) {
            const message = (err?.message || "").toLowerCase();
            const isRateLimited =
                err?.status === 429 ||
                message.includes("rate limit") ||
                message.includes("email rate limit");

            if (isRateLimited) {
                setCooldownUntil(Date.now() + EMAIL_SEND_COOLDOWN_MS);
                showError("送信が一時的に混み合っています。時間を置いてから再度お試しください。");
            } else {
                showError(err?.message || "コードの再送に失敗しました");
            }
        }
    };

    // コード入力画面
    if (emailSent) {
        return (
            <div className="min-h-screen bg-white">
                <header className="bg-white px-6 pt-8 pb-6 border-b">
                    <div className="flex items-center gap-4 mb-6">
                        <Link href="/">
                            <ArrowLeft className="w-6 h-6 text-gray-600 hover:text-primary transition-colors" />
                        </Link>
                        <h1 className="text-3xl font-bold text-primary animate-slide-in-left">
                            メール確認
                        </h1>
                    </div>
                </header>

                <div className="px-6 py-8">
                    <div className="max-w-md mx-auto">
                        <div className="bg-white rounded-2xl shadow-lg border p-8 text-center">
                            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 animate-slide-in-left">
                                <KeyRound className="w-10 h-10 text-green-600" />
                            </div>
                            <h2 className="text-2xl font-bold text-gray-900 mb-4 animate-slide-in-left" style={{ animationDelay: '100ms' }}>
                                確認コードを入力
                            </h2>
                            <p className="text-gray-600 mb-1 animate-slide-in-left" style={{ animationDelay: '200ms' }}>
                                <span className="font-semibold text-primary">{email}</span>
                            </p>
                            <p className="text-gray-600 mb-6 animate-slide-in-left" style={{ animationDelay: '200ms' }}>
                                上記のメールアドレスに6桁の確認コードを送信しました。
                                メールに記載されたコードを入力してください。
                            </p>

                            {error && (
                                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                                    {error}
                                </div>
                            )}

                            <form onSubmit={handleVerifyCode} className="space-y-4 animate-slide-in-left" style={{ animationDelay: '300ms' }}>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    pattern="\d{6}"
                                    maxLength={6}
                                    value={code}
                                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                    placeholder="123456"
                                    className="w-full px-4 py-4 border border-gray-300 rounded-xl text-center text-2xl font-bold tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                                    autoFocus
                                    required
                                />
                                <button
                                    type="submit"
                                    disabled={verifying || code.length !== 6}
                                    className="w-full py-4 bg-primary text-white rounded-xl font-semibold text-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg"
                                >
                                    {verifying ? "確認中..." : "確認して登録を完了"}
                                </button>
                            </form>

                            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-left mt-6 mb-6 animate-slide-in-left" style={{ animationDelay: '400ms' }}>
                                <p className="text-sm text-yellow-800 font-medium mb-2">📌 コードが届かない場合</p>
                                <ul className="text-sm text-yellow-700 space-y-1">
                                    <li>• 迷惑メールフォルダを確認してください</li>
                                    <li>• メールアドレスが正しいか確認してください</li>
                                    <li>• 再送は60秒以上あけてください</li>
                                </ul>
                            </div>

                            <div className="space-y-3 animate-slide-in-left" style={{ animationDelay: '500ms' }}>
                                <button
                                    type="button"
                                    onClick={handleResendCode}
                                    disabled={cooldownSeconds > 0}
                                    className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                >
                                    {cooldownSeconds > 0 ? `コードを再送（${formatCooldown(cooldownSeconds)}）` : "コードを再送する"}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setEmailSent(false);
                                        setCode("");
                                        setEmail("");
                                        setPassword("");
                                        setConfirmPassword("");
                                    }}
                                    className="block w-full py-3 text-primary font-semibold hover:underline"
                                >
                                    別のメールアドレスで登録
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-white">
            <header className="bg-white px-6 pt-8 pb-6 border-b">
                <div className="flex items-center gap-4 mb-6">
                    <Link href="/">
                        <ArrowLeft className="w-6 h-6 text-gray-600 hover:text-primary transition-colors" />
                    </Link>
                    <h1 className="text-3xl font-bold text-primary animate-slide-in-left">
                        新規登録
                    </h1>
                </div>
            </header>

            <div className="px-6 py-8">
                <div className="max-w-md mx-auto">
                    <div className="bg-white rounded-2xl shadow-lg border p-8">
                        <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center animate-slide-in-left">
                            アカウント作成
                        </h2>

                        {error && (
                            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                                {error}
                            </div>
                        )}

                        <form onSubmit={handleSignup} className="space-y-4">
                            <div className="animate-slide-in-left">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    <Mail className="w-4 h-4 inline mr-1" />
                                    学内メールアドレス
                                </label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="example@m.isct.ac.jp"
                                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                                    required
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    ※ 通常は @m.isct.ac.jp のメールのみ登録可能です。管理者として事前登録されたメールアドレスは例外的に利用できます。
                                </p>
                            </div>

                            <div className="animate-slide-in-left" style={{ animationDelay: '100ms' }}>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    <Lock className="w-4 h-4 inline mr-1" />
                                    パスワード
                                </label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="6文字以上"
                                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                                    required
                                />
                            </div>

                            <div className="animate-slide-in-left" style={{ animationDelay: '200ms' }}>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    <Lock className="w-4 h-4 inline mr-1" />
                                    パスワード（確認）
                                </label>
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="もう一度入力"
                                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                                    required
                                />
                            </div>

                            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 animate-slide-in-left" style={{ animationDelay: '250ms' }}>
                                <p className="text-sm text-blue-800">
                                    📧 登録後、メールアドレスに確認メールが送信されます。メール内のリンクをクリックして登録を完了してください。
                                    届かない場合も連続で押さず、迷惑メールを確認して60秒以上待ってから再度お試しください。
                                </p>
                            </div>

                            <label className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 animate-slide-in-left" style={{ animationDelay: '280ms' }}>
                                <input
                                    type="checkbox"
                                    checked={agreedToLegal}
                                    onChange={(e) => setAgreedToLegal(e.target.checked)}
                                    className="mt-1 h-5 w-5 accent-primary"
                                />
                                <span className="text-sm font-medium text-gray-700">
                                    利用規約・プライバシーポリシーに同意して登録する
                                </span>
                            </label>

                            <div className="flex items-center justify-center gap-3 text-sm animate-slide-in-left" style={{ animationDelay: '290ms' }}>
                                <button
                                    type="button"
                                    onClick={() => setActiveLegal("terms")}
                                    className="font-semibold text-primary hover:underline"
                                >
                                    利用規約を確認
                                </button>
                                <span className="text-gray-300">|</span>
                                <button
                                    type="button"
                                    onClick={() => setActiveLegal("privacy")}
                                    className="font-semibold text-primary hover:underline"
                                >
                                    プライバシーポリシーを確認
                                </button>
                            </div>

                             <button
                                type="submit"
                                disabled={loading || cooldownSeconds > 0}
                                className={`w-full py-4 rounded-xl font-semibold text-lg transition-all shadow-md mt-6 animate-slide-in-left ${
                                    agreedToLegal
                                        ? "bg-primary text-white hover:bg-primary/90 hover:shadow-lg"
                                        : "bg-gray-300 text-gray-500 hover:bg-gray-300"
                                } disabled:opacity-100 disabled:cursor-not-allowed`}
                                style={{ animationDelay: '300ms' }}
                            >
                                {loading
                                    ? "送信中..."
                                    : cooldownSeconds > 0
                                        ? `${formatCooldown(cooldownSeconds)}に再送できます`
                                        : "確認メールを送信"}
                            </button>
                        </form>

                        <div className="mt-6 text-center">
                            <p className="text-gray-600">
                                すでにアカウントをお持ちの方は
                            </p>
                            <Link
                                href="/auth/login"
                                className="text-primary font-semibold hover:underline"
                            >
                                ログインはこちら
                            </Link>
                        </div>
                    </div>
                </div>
            </div>

            {activeLegal && (
                <div className="fixed inset-0 z-[120] flex items-end justify-center">
                    <button
                        type="button"
                        aria-label="閉じる"
                        className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-200"
                        onClick={() => setActiveLegal(null)}
                    />
                    <section className="relative w-full max-w-3xl max-h-[86vh] overflow-hidden rounded-t-2xl bg-white shadow-2xl animate-in slide-in-from-bottom duration-300">
                        <div className="flex items-center justify-between border-b bg-white px-6 py-4">
                            <div>
                                <p className="text-[11px] font-bold uppercase tracking-widest text-primary">TextNext</p>
                                <h2 className="text-lg font-bold text-gray-900">{legalTitle}</h2>
                            </div>
                            <button
                                type="button"
                                onClick={() => setActiveLegal(null)}
                                className="rounded-full p-2 hover:bg-gray-100"
                                aria-label="閉じる"
                            >
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>
                        <div className="max-h-[72vh] overflow-y-auto bg-gray-50 px-4 py-4">
                            <div className="rounded-xl border border-gray-100 bg-white px-5 py-6 shadow-sm">
                                {renderLegalText(legalText)}
                            </div>
                        </div>
                    </section>
                </div>
            )}
        </div>
    );
}
