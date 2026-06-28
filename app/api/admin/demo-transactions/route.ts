import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { adminLog, requireAdmin } from "@/lib/admin-utils";

const parseArray = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry).trim()).filter(Boolean).slice(0, 12);
};

export async function GET(request: NextRequest) {
  try {
    const { supabase, user } = await requireAdmin();
    const q = request.nextUrl.searchParams.get("q")?.trim() || "";

    if (q.length < 1) {
      return NextResponse.json({ users: [] });
    }

    let query = (supabase as any)
      .from("profiles")
      .select("user_id,nickname,avatar_url,department,degree,grade,major")
      .neq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(12);

    const safe = q.replaceAll("%", "").replaceAll(",", " ");
    const filters = [
      `nickname.ilike.%${safe}%`,
      `department.ilike.%${safe}%`,
      `degree.ilike.%${safe}%`,
      `major.ilike.%${safe}%`,
    ];
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(safe)) {
      filters.push(`user_id.eq.${safe}`);
    }
    query = query.or(filters.join(","));

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ users: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "ユーザー検索に失敗しました" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase } = await requireAdmin();
    const body = await request.json();
    const itemId = String(body.itemId || "").trim();
    const buyerId = String(body.buyerId || "").trim();
    const paymentMethod = String(body.paymentMethod || "other").trim() || "other";
    const timeSlots = parseArray(body.timeSlots);
    const locations = parseArray(body.locations);
    const autoMessage = String(body.autoMessage || "").trim();

    if (!itemId || !buyerId) {
      return NextResponse.json({ error: "デモ出品と購入者を指定してください" }, { status: 400 });
    }

    const { data: transactionId, error } = await (supabase as any).rpc("admin_create_demo_transaction", {
      target_item_id: itemId,
      target_buyer_id: buyerId,
      payment_method: paymentMethod,
      meetup_time_slots: timeSlots,
      meetup_locations: locations,
      auto_message: autoMessage || null,
    });

    if (error) throw error;

    await adminLog(supabase, "demo_transaction_created", "transaction", String(transactionId), "demo transaction created", {
      itemId,
      buyerId,
      paymentMethod,
      timeSlotCount: timeSlots.length,
      locationCount: locations.length,
    });

    revalidatePath("/admin/demo-home");
    revalidatePath(`/admin/demo-items/${itemId}/preview`);
    return NextResponse.json({ success: true, transactionId });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "デモ取引を作成できませんでした" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase } = await requireAdmin();
    const body = await request.json();
    const transactionId = String(body.transactionId || "").trim();
    const isDemo = Boolean(body.isDemo);

    if (!transactionId) {
      return NextResponse.json({ error: "取引IDを指定してください" }, { status: 400 });
    }

    // Fetch transaction to get item_id
    const { data: tx, error: fetchError } = await (supabase as any)
      .from("transactions")
      .select("id, item_id, is_demo")
      .eq("id", transactionId)
      .single();

    if (fetchError || !tx) {
      return NextResponse.json({ error: "取引が見つかりません" }, { status: 404 });
    }

    // Update transaction is_demo
    const { error: txError } = await (supabase as any)
      .from("transactions")
      .update({ is_demo: isDemo })
      .eq("id", transactionId);

    if (txError) throw txError;

    // Also update the related item's is_demo
    if (tx.item_id) {
      await (supabase as any)
        .from("items")
        .update({ is_demo: isDemo })
        .eq("id", tx.item_id);
    }

    await adminLog(
      supabase,
      isDemo ? "transaction_marked_demo" : "transaction_unmarked_demo",
      "transaction",
      transactionId,
      isDemo ? "取引をデモに変更" : "取引を通常に変更",
      { itemId: tx.item_id, previousIsDemo: tx.is_demo }
    );

    revalidatePath("/admin/transactions");
    revalidatePath(`/admin/transactions/${transactionId}`);
    revalidatePath("/admin");
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "デモ切り替えに失敗しました" }, { status: 500 });
  }
}
