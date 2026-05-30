import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { adminLog, requireAdmin } from "@/lib/admin-utils";
import { deleteR2Object } from "@/lib/r2-server";

const CONFIRM_TEXT = "完全削除";

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

export async function POST(request: NextRequest) {
  try {
    const { itemId, confirmationText, reason } = await request.json();
    const trimmedReason = String(reason || "").trim();

    if (!itemId || confirmationText !== CONFIRM_TEXT || trimmedReason.length < 5) {
      return NextResponse.json({ error: "完全削除には確認文字と理由が必要です" }, { status: 400 });
    }

    const { supabase } = await requireAdmin();
    const { data: item, error: itemError } = await (supabase as any)
      .from("items")
      .select("id,title,status,seller_id,image_storage_provider,front_image_url,back_image_url,front_thumbnail_url,back_thumbnail_url,front_image_storage_path,back_image_storage_path,front_thumbnail_storage_path,back_thumbnail_storage_path,transactions(id)")
      .eq("id", itemId)
      .maybeSingle();

    if (itemError) throw itemError;
    if (!item) {
      return NextResponse.json({ error: "出品が見つかりません" }, { status: 404 });
    }

    const { count: transactionCount, error: transactionCountError } = await (supabase as any)
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("item_id", itemId);

    if (transactionCountError) throw transactionCountError;

    if ((transactionCount ?? 0) > 0) {
      return NextResponse.json({ error: "関連取引がある出品は完全削除できません。非表示で対応してください。" }, { status: 400 });
    }

    let storageDeleted = 0;
    let storageDeleteFailed = 0;
    let storageDeleteTargets: string[] = [];

    if (item.image_storage_provider === "r2") {
      storageDeleteTargets = safeR2Paths(itemId, item);
      const results = await Promise.allSettled(storageDeleteTargets.map((path) => deleteR2Object(path)));
      storageDeleteFailed = results.filter((result) => result.status === "rejected").length;
      storageDeleted = storageDeleteTargets.length - storageDeleteFailed;
    } else {
      storageDeleteTargets = safeSupabasePaths(item);
      if (storageDeleteTargets.length > 0) {
        const { error } = await supabase.storage.from("item-images").remove(storageDeleteTargets);
        if (error) {
          storageDeleteFailed = storageDeleteTargets.length;
        } else {
          storageDeleted = storageDeleteTargets.length;
        }
      }
    }

    if (storageDeleteFailed > 0) {
      return NextResponse.json({
        error: "画像削除に失敗したため、DBの完全削除を中止しました",
        storageDeleteTargets,
        storageDeleteFailed,
      }, { status: 500 });
    }

    const { data: purgeResult, error: purgeError } = await (supabase as any).rpc("admin_purge_item", {
      target_item_id: itemId,
      reason: trimmedReason,
    });

    if (purgeError) {
      const message = purgeError.message === "cannot purge item with transactions"
        ? "関連取引がある出品は完全削除できません。非表示で対応してください。"
        : purgeError.message;
      return NextResponse.json({ error: message }, { status: 500 });
    }

    await adminLog(supabase, "item_purged", "item", itemId, trimmedReason, {
      title: item.title,
      sellerId: item.seller_id,
      previousStatus: item.status,
      imageStorageProvider: item.image_storage_provider,
      storageDeleteTargets,
      storageDeleted,
      storageDeleteFailed,
      purgeResult,
    });

    revalidatePath("/");
    revalidatePath("/search");
    revalidatePath(`/product/${itemId}`);
    revalidatePath(`/seller/${item.seller_id}`);
    revalidatePath("/admin/items");
    revalidatePath(`/admin/items/${itemId}`);

    return NextResponse.json({ success: true, storageDeleted, purgeResult });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "完全削除に失敗しました" }, { status: 500 });
  }
}
