import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { sendWebPushToUser } from "@/lib/web-push";

export async function POST() {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://textnext.jp";
    const result = await sendWebPushToUser(user.id, {
      title: "TextNext テスト通知",
      body: "ホーム画面通知の送信テストです。",
      url: `${baseUrl}/notifications`,
    });

    if (result.skipped) {
      return NextResponse.json(
        {
          success: false,
          reason: result.reason,
          message:
            result.reason === "no_active_subscription"
              ? "この端末の通知購読がまだ保存されていません。先に通知を有効化してください。"
              : "通知送信のサーバー設定が不足している可能性があります。",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "テスト通知を送信できませんでした" }, { status: 500 });
  }
}
