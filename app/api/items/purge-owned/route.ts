import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { deleteR2Object } from "@/lib/r2-server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const safeR2Paths = (itemId: string, item: Record<string, unknown>) => [
  item.front_image_storage_path,
  item.back_image_storage_path,
  item.front_thumbnail_storage_path,
  item.back_thumbnail_storage_path,
]
  .map((path) => String(path || "").trim())
  .filter((path) => path.startsWith(`items/${itemId}/`) && !path.includes(".."));

const parseSupabasePublicPath = (value?: string | null) => {
  if (!value) return null;
  if (!/^https?:\/\//.test(value)) return value.replace(/^\/+/, "");

  try {
    const url = new URL(value);
    const marker = "/storage/v1/object/public/item-images/";
    const index = url.pathname.indexOf(marker);
    if (index === -1) return null;
    return decodeURIComponent(url.pathname.slice(index + marker.length));
  } catch {
    return null;
  }
};

const safeSupabasePaths = (item: Record<string, unknown>) => Array.from(new Set([
  item.front_image_storage_path,
  item.back_image_storage_path,
  item.front_thumbnail_storage_path,
  item.back_thumbnail_storage_path,
  parseSupabasePublicPath(item.front_image_url as string | null),
  parseSupabasePublicPath(item.back_image_url as string | null),
  parseSupabasePublicPath(item.front_thumbnail_url as string | null),
  parseSupabasePublicPath(item.back_thumbnail_url as string | null),
]
  .map((path) => String(path || "").trim())
  .filter((path) => path && !path.includes("..") && !path.startsWith("http"))));

const createServiceClient = () => {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);
};

export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

    const serviceSupabase = createServiceClient();
    if (!serviceSupabase) {
      return NextResponse.json({ error: "削除処理の設定が不足しています" }, { status: 500 });
    }

    const { itemId } = await request.json();
    if (!uuidPattern.test(String(itemId))) {
      return NextResponse.json({ error: "削除対象が不正です" }, { status: 400 });
    }

    const { data: item, error: itemError } = await (serviceSupabase as any)
      .from("items")
      .select("id,title,status,seller_id,image_storage_provider,front_image_url,back_image_url,front_thumbnail_url,back_thumbnail_url,front_image_storage_path,back_image_storage_path,front_thumbnail_storage_path,back_thumbnail_storage_path")
      .eq("id", itemId)
      .maybeSingle();

    if (itemError) throw itemError;
    if (!item) {
      return NextResponse.json({ error: "出品が見つかりません" }, { status: 404 });
    }
    if (item.seller_id !== session.user.id) {
      return NextResponse.json({ error: "削除権限がありません" }, { status: 403 });
    }

    let storageDeleteTargets: string[] = [];
    let storageDeleteFailed = 0;
    let storageDeleteErrors: string[] = [];

    if (item.image_storage_provider === "r2") {
      storageDeleteTargets = safeR2Paths(itemId, item);
    } else {
      storageDeleteTargets = safeSupabasePaths(item);
    }

    const { data: relatedTransactions, error: txLoadError } = await (serviceSupabase as any)
      .from("transactions")
      .select("id")
      .eq("item_id", itemId);
    if (txLoadError) throw txLoadError;

    const transactionIds = ((relatedTransactions ?? []) as Array<{ id: string }>).map((tx) => tx.id);
    const deleteCounts: Record<string, number | null> = {};

    const deleteFrom = async (table: string, column: string, value: string | string[]) => {
      const query = (serviceSupabase as any).from(table).delete();
      const result = Array.isArray(value) ? await query.in(column, value) : await query.eq(column, value);
      if (result.error) throw result.error;
      deleteCounts[table] = result.count ?? null;
    };

    if (transactionIds.length > 0) {
      await deleteFrom("ratings", "transaction_id", transactionIds);
      await deleteFrom("messages", "transaction_id", transactionIds);
      await deleteFrom("transactions", "id", transactionIds);
    }

    await deleteFrom("favorites", "item_id", itemId);
    await deleteFrom("messages", "item_id", itemId);
    await deleteFrom("purchase_lock_attempts", "item_id", itemId);
    await deleteFrom("purchase_request_history", "item_id", itemId);
    await deleteFrom("reports", "item_id", itemId);
    await deleteFrom("item_moderation_flags", "item_id", itemId);
    await deleteFrom("listing_image_error_logs", "item_id", itemId);

    const notificationDelete = await (serviceSupabase as any)
      .from("notifications")
      .delete()
      .or([
        `link_id.eq.${itemId}`,
        `link_id.like.${itemId}?tx=%`,
        ...transactionIds.map((txId) => `link_id.eq.${txId}`),
        ...transactionIds.map((txId) => `link_id.like.%${txId}%`),
      ].join(","));
    if (notificationDelete.error) throw notificationDelete.error;
    deleteCounts.notifications = notificationDelete.count ?? null;

    const itemDelete = await (serviceSupabase as any)
      .from("items")
      .delete()
      .eq("id", itemId)
      .eq("seller_id", session.user.id);

    if (itemDelete.error) throw itemDelete.error;
    deleteCounts.items = itemDelete.count ?? null;

    if (itemDelete.count === 0) {
      return NextResponse.json({ error: "出品を削除できませんでした" }, { status: 500 });
    }

    if (item.image_storage_provider === "r2") {
      const results = await Promise.allSettled(storageDeleteTargets.map((path) => deleteR2Object(path)));
      storageDeleteFailed = results.filter((result) => result.status === "rejected").length;
      storageDeleteErrors = results
        .filter((result): result is PromiseRejectedResult => result.status === "rejected")
        .map((result) => result.reason?.message || String(result.reason || "unknown error"));
    } else if (storageDeleteTargets.length > 0) {
      const { error } = await serviceSupabase.storage.from("item-images").remove(storageDeleteTargets);
      if (error) {
        storageDeleteFailed = storageDeleteTargets.length;
        storageDeleteErrors = [error.message];
      }
    }

    if (storageDeleteFailed > 0) {
      console.error("Item purged but image deletion failed", {
        itemId,
        storageProvider: item.image_storage_provider,
        failed: storageDeleteFailed,
        errors: storageDeleteErrors,
      });

      await (serviceSupabase as any).from("listing_image_error_logs").insert({
        user_id: session.user.id,
        item_id: null,
        stage: "purge_owned_storage_delete",
        side: "unknown",
        message: "出品DB削除後の画像削除に失敗しました",
        metadata: {
          storageProvider: item.image_storage_provider,
          targets: storageDeleteTargets,
          errors: storageDeleteErrors,
        },
      });
    }

    return NextResponse.json({
      success: true,
      storageDeleted: storageDeleteTargets.length,
      storageDeleteFailed,
      warning: storageDeleteFailed > 0 ? "storage_delete_failed" : undefined,
      purgeResult: {
        itemId,
        title: item.title,
        sellerId: item.seller_id,
        previousStatus: item.status,
        deletedTransactions: transactionIds.length,
        deleteCounts,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "出品の削除に失敗しました" }, { status: 500 });
  }
}
