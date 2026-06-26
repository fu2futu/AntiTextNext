import { NextResponse, type NextRequest } from "next/server";
import { adminLog, requireAdmin } from "@/lib/admin-utils";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!userId) {
      return NextResponse.json({ error: "対象ユーザーが必要です" }, { status: 400 });
    }

    if (!message) {
      return NextResponse.json({ error: "通知本文が必要です" }, { status: 400 });
    }

    if (title.length > 80) {
      return NextResponse.json({ error: "タイトルは80文字以内にしてください" }, { status: 400 });
    }

    if (message.length > 1000) {
      return NextResponse.json({ error: "本文は1000文字以内にしてください" }, { status: 400 });
    }

    const { supabase } = await requireAdmin();

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    if (!profile) {
      return NextResponse.json({ error: "対象ユーザーが見つかりません" }, { status: 404 });
    }

    const { data: notificationId, error } = await (supabase as any).rpc("admin_send_user_notification", {
      target_user_id: userId,
      notification_title: title || "運営からのお知らせ",
      notification_message: message,
      notification_type: "admin_message",
      target_link_type: "profile",
      target_link_id: userId,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await adminLog(supabase, "user_notification_sent", "user", userId, "ユーザーへ任意通知を送信", {
      notificationId,
      title: title || "運営からのお知らせ",
      messageLength: message.length,
    });

    return NextResponse.json({ success: true, notificationId });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "通知を送信できませんでした" }, { status: 500 });
  }
}
