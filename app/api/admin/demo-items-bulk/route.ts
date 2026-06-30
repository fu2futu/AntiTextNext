import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { adminLog, requireAdmin } from "@/lib/admin-utils";

export async function PATCH(request: NextRequest) {
  try {
    const { supabase } = await requireAdmin();
    const body = await request.json();
    const itemIds = Array.isArray(body.itemIds) ? body.itemIds.filter((id: any) => typeof id === "string" && id.trim()) : [];
    const isDemo = Boolean(body.isDemo);

    if (!itemIds.length) {
      return NextResponse.json({ error: "出品を選択してください" }, { status: 400 });
    }

    if (itemIds.length > 50) {
      return NextResponse.json({ error: "一度に変更できるのは50件までです" }, { status: 400 });
    }

    // Update items
    const { error: itemError } = await (supabase as any)
      .from("items")
      .update({ is_demo: isDemo })
      .in("id", itemIds);

    if (itemError) throw itemError;

    // Also update related transactions' is_demo
    const { error: txError } = await (supabase as any)
      .from("transactions")
      .update({ is_demo: isDemo })
      .in("item_id", itemIds);

    if (txError) {
      console.error("Failed to update related transactions is_demo in bulk:", txError.message);
    }

    await adminLog(
      supabase,
      isDemo ? "items_bulk_marked_demo" : "items_bulk_unmarked_demo",
      "system",
      "bulk",
      isDemo ? `${itemIds.length}件の出品をデモに変更` : `${itemIds.length}件の出品を通常に変更`,
      { itemIds }
    );

    revalidatePath("/admin/items");
    revalidatePath("/admin/transactions");
    revalidatePath("/admin/demo-home");
    revalidatePath("/admin/demo-items");
    revalidatePath("/admin");
    return NextResponse.json({ success: true, updated: itemIds.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "デモ切り替えに失敗しました" }, { status: 500 });
  }
}
