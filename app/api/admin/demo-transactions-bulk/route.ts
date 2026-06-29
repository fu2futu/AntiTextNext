import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { adminLog, requireAdmin } from "@/lib/admin-utils";

export async function PATCH(request: NextRequest) {
  try {
    const { supabase } = await requireAdmin();
    const body = await request.json();
    const transactionIds = Array.isArray(body.transactionIds) ? body.transactionIds.filter((id) => typeof id === "string" && id.trim()) : [];
    const isDemo = Boolean(body.isDemo);

    if (!transactionIds.length) {
      return NextResponse.json({ error: "取引を選択してください" }, { status: 400 });
    }

    if (transactionIds.length > 50) {
      return NextResponse.json({ error: "一度に変更できるのは50件までです" }, { status: 400 });
    }

    // Update transactions
    const { error: txError } = await (supabase as any)
      .from("transactions")
      .update({ is_demo: isDemo })
      .in("id", transactionIds);

    if (txError) throw txError;

    // Get the affected items to update them too
    const { data: txs } = await (supabase as any)
      .from("transactions")
      .select("item_id")
      .in("id", transactionIds);

    const itemIds = Array.from(new Set(((txs ?? []) as any[]).map((t) => t.item_id).filter(Boolean)));

    if (itemIds.length > 0) {
      const { error: itemError } = await (supabase as any)
        .from("items")
        .update({ is_demo: isDemo })
        .in("id", itemIds);

      if (itemError) {
        console.error("Failed to update related items is_demo in bulk:", itemError.message);
      }
    }

    await adminLog(
      supabase,
      isDemo ? "transactions_bulk_marked_demo" : "transactions_bulk_unmarked_demo",
      "system",
      "bulk",
      isDemo ? `${transactionIds.length}件の取引をデモに変更` : `${transactionIds.length}件の取引を通常に変更`,
      { transactionIds, itemIds }
    );

    revalidatePath("/admin/transactions");
    revalidatePath("/admin/items");
    revalidatePath("/admin/demo-home");
    revalidatePath("/admin/demo-items");
    revalidatePath("/admin");
    return NextResponse.json({ success: true, updated: transactionIds.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "デモ切り替えに失敗しました" }, { status: 500 });
  }
}
