import { NextResponse, type NextRequest } from "next/server";
import { adminLog, requireAdmin } from "@/lib/admin-utils";

export async function PATCH(request: NextRequest) {
  try {
    const { enabled, message } = await request.json();
    const normalizedMessage = String(message || "").trim();
    const { supabase, user } = await requireAdmin();

    if (normalizedMessage.length > 500) {
      return NextResponse.json({ error: "お知らせ本文は500文字以内にしてください" }, { status: 400 });
    }

    const { error } = await (supabase as any)
      .from("app_notice_banner")
      .upsert({
        id: "global",
        enabled: Boolean(enabled) && normalizedMessage.length > 0,
        message: normalizedMessage,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await adminLog(supabase, "app_notice_banner_update", "app_notice_banner", "global", "上部お知らせを更新", {
      enabled: Boolean(enabled) && normalizedMessage.length > 0,
      messageLength: normalizedMessage.length,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "上部お知らせを更新できませんでした" }, { status: 500 });
  }
}
