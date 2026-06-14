"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle, Loader2, Mail } from "lucide-react";
import { supabase } from "@/lib/supabase";

const RATE_LIMIT_COOLDOWN_MS = 60 * 1000;
const APP_REVIEW_RESET_MESSAGE =
  "このアカウントではパスワード再設定は不要です。提供されたパスワードでログインしてください。";

const formatRemainingTime = (seconds: number) => {
  if (seconds >= 60) {
    const minutes = Math.ceil(seconds / 60);
    return `${minutes}分後`;
  }
  return `${seconds}秒後`;
};

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setInfoMessage("");
    if (cooldownUntil && Date.now() < cooldownUntil) {
      const remainingSeconds = Math.max(1, Math.ceil((cooldownUntil - Date.now()) / 1000));
      setError(`現在メール送信の上限に達しています。${formatRemainingTime(remainingSeconds)}に再度お試しください。`);
      return;
    }
    setLoading(true);

    try {
      const checkResponse = await fetch("/api/auth/password-reset-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const checkPayload = await checkResponse.json().catch(() => ({}));
      if (checkPayload?.isAppReviewDemo) {
        setInfoMessage(APP_REVIEW_RESET_MESSAGE);
        return;
      }

      const appOrigin = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
      const redirectTo = `${appOrigin.replace(/\/$/, "")}/auth/callback?next=/auth/update-password`;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo,
      });

      if (resetError) throw resetError;
      setSent(true);
    } catch (err: any) {
      console.error("Password reset email error:", err);
      const isRateLimited =
        err?.status === 429 ||
        err?.code === "over_email_send_rate_limit" ||
        String(err?.message || "").toLowerCase().includes("rate limit");

      if (isRateLimited) {
        setCooldownUntil(Date.now() + RATE_LIMIT_COOLDOWN_MS);
        setError(
          "現在メール送信の上限に達しています。短時間の連続送信だけでなく、認証メール全体の送信上限に達している可能性があります。しばらく時間を置いてから再度お試しください。"
        );
      } else {
        setError("メール送信に失敗しました。時間を置いて再度お試しください。");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <header className="bg-white px-6 pt-8 pb-6 border-b">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/auth/login">
            <ArrowLeft className="w-6 h-6 text-gray-600 hover:text-primary transition-colors" />
          </Link>
          <h1 className="text-3xl font-bold text-primary">パスワード再設定</h1>
        </div>
      </header>

      <div className="px-6 py-8">
        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-2xl shadow-lg border p-8">
            {sent ? (
              <div className="text-center">
                <CheckCircle className="w-14 h-14 text-green-500 mx-auto mb-4" />
                <h2 className="text-xl font-bold text-gray-900 mb-3">メールを送信しました</h2>
                <p className="text-sm text-gray-600 leading-6">
                  入力されたメールアドレス宛にパスワード再設定用のリンクを送信しました。
                  メール内のリンクを開いて、新しいパスワードを設定してください。届かない場合は迷惑メールを確認し、
                  再送は60秒以上あけてください。同じエラーが続く場合は、認証メール全体の送信上限に達している可能性があります。
                </p>
                <Link
                  href="/auth/login"
                  className="mt-6 inline-flex px-5 py-3 rounded-xl bg-primary text-white font-semibold hover:bg-primary/90 transition-colors"
                >
                  ログイン画面へ
                </Link>
              </div>
            ) : (
              <>
                <h2 className="text-xl font-bold text-gray-900 mb-3">登録メールアドレスを入力</h2>
                <p className="text-sm text-gray-600 mb-6">
                  パスワード再設定用の認証リンクを送信します。
                </p>

                <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
                  <div className="mb-2 flex items-center gap-2 text-sm font-bold">
                    <AlertTriangle className="h-4 w-4" />
                    連続送信に注意してください
                  </div>
                  <p className="text-xs leading-6">
                    再設定メールは短時間に何度も送れません。届かない場合は迷惑メールを確認し、
                    少なくとも60秒以上あけてから再送してください。
                  </p>
                  <p className="mt-2 text-xs leading-6">
                    同じエラーが続く場合は、パスワード再設定だけでなく認証メール全体の送信上限に達している可能性があります。
                    その場合はしばらく時間を置いてからお試しください。
                  </p>
                  <p className="mt-2 text-xs leading-6">
                    大学メールでは受信側のフィルタにより、認証メールが遅延・ブロックされる場合があります。
                    登録に使ったメールアドレスを正確に入力してください。
                  </p>
                </div>

                {error && (
                  <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                    {error}
                  </div>
                )}

                {infoMessage && (
                  <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 text-sm leading-6">
                    {infoMessage}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <Mail className="w-4 h-4 inline mr-1" />
                      メールアドレス
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="example@m.isct.ac.jp"
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading || cooldownSeconds > 0}
                    className="w-full py-4 bg-primary text-white rounded-xl font-semibold text-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
                  >
                    {loading ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        送信中...
                      </span>
                    ) : cooldownSeconds > 0 ? (
                      `${formatRemainingTime(cooldownSeconds)}に再送できます`
                    ) : (
                      "再設定メールを送信"
                    )}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
