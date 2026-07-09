import { NextResponse, type NextRequest } from "next/server";
import { adminLog, requireAdmin } from "@/lib/admin-utils";

export async function PATCH(request: NextRequest) {
  try {
    const { recommendedEnabled } = await request.json();
    const { supabase, user } = await requireAdmin();

    const nextRecommendedEnabled = Boolean(recommendedEnabled);

    const { error } = await (supabase as any)
      .from("app_home_settings")
      .upsert({
        id: "global",
        recommended_enabled: nextRecommendedEnabled,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await adminLog(supabase, "app_home_settings_update", "app_home_settings", "global", "ホーム表示設定を更新", {
      recommendedEnabled: nextRecommendedEnabled,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "ホーム表示設定を更新できませんでした" }, { status: 500 });
  }
}
