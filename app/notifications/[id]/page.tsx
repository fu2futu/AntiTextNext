"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Inbox, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { supabase } from "@/lib/supabase";

type NotificationDetail = {
  id: string;
  type: string;
  title: string;
  message: string;
  created_at: string;
  is_read: boolean;
};

export default function NotificationDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { user } = useAuth();
  const [notification, setNotification] = useState<NotificationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) {
      router.push("/auth/login");
      return;
    }

    const loadNotification = async () => {
      setLoading(true);
      setError("");

      const { data, error: fetchError } = await (supabase as any)
        .from("notifications")
        .select("id,type,title,message,created_at,is_read")
        .eq("id", params.id)
        .eq("user_id", user.id)
        .single();

      const notificationData = data as NotificationDetail | null;

      if (fetchError || !notificationData) {
        setError(fetchError?.message || "お知らせが見つかりませんでした");
        setLoading(false);
        return;
      }

      setNotification(notificationData);

      if (!notificationData.is_read) {
        await (supabase.from("notifications") as any)
          .update({ is_read: true })
          .eq("id", params.id)
          .eq("user_id", user.id);
      }

      setLoading(false);
    };

    loadNotification();
  }, [params.id, router, user]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white pb-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-24">
      <header className="rounded-b-[32px] bg-white px-5 pb-5 pt-7 shadow-sm">
        <button
          type="button"
          onClick={() => router.push("/notifications")}
          className="mb-5 inline-flex items-center gap-2 rounded-full bg-gray-100 px-4 py-2 text-sm font-black text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          お知らせへ戻る
        </button>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Inbox className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-black text-primary">運営からのお知らせ</p>
            <h1 className="text-2xl font-black tracking-tight text-gray-900">
              {notification?.title || "お知らせ"}
            </h1>
          </div>
        </div>
      </header>

      <main className="px-6 py-8">
        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-bold text-red-700">{error}</div>
        ) : (
          <article className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
            <p className="mb-5 text-xs font-bold text-gray-400">
              {notification?.created_at ? new Date(notification.created_at).toLocaleString("ja-JP") : ""}
            </p>
            <div className="whitespace-pre-wrap text-[15px] font-bold leading-8 text-gray-800">
              {notification?.message}
            </div>
          </article>
        )}
      </main>
    </div>
  );
}
