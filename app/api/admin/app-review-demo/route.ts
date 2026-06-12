import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-utils";

export async function POST(request: NextRequest) {
  try {
    const { supabase } = await requireAdmin();
    const body = await request.json().catch(() => ({}));
    const userId = String(body.userId || "").trim();
    const enabled = Boolean(body.enabled);
    const reason = String(body.reason || "App Review demo flag updated").trim();

    if (!userId) {
      return NextResponse.json({ error: "対象ユーザーが必要です" }, { status: 400 });
    }

    const { error } = await (supabase as any).rpc("admin_set_user_app_review_demo", {
      target_user_id: userId,
      enabled,
      reason,
    });

    if (error) throw error;

    revalidatePath(`/admin/users/${userId}`);
    revalidatePath("/admin/users");
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "App Review設定を更新できませんでした" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { supabase } = await requireAdmin();
    const body = await request.json().catch(() => ({}));
    const userId = String(body.userId || "").trim();
    const reason = String(body.reason || "App Review demo data reset").trim();

    if (!userId) {
      return NextResponse.json({ error: "対象ユーザーが必要です" }, { status: 400 });
    }

    const { data, error } = await (supabase as any).rpc("admin_reset_app_review_demo_data", {
      target_user_id: userId,
      reason,
    });

    if (error) throw error;

    revalidatePath(`/admin/users/${userId}`);
    revalidatePath("/admin/demo-home");
    revalidatePath("/admin/demo-items");
    return NextResponse.json({ success: true, result: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "デモデータをリセットできませんでした" }, { status: 500 });
  }
}
