import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { adminLog, requireAdmin } from "@/lib/admin-utils";
import { deleteR2Object } from "@/lib/r2-server";

const safeR2Paths = (itemId: string, item: Record<string, unknown>) => [
  item.front_image_storage_path,
  item.back_image_storage_path,
  item.front_thumbnail_storage_path,
  item.back_thumbnail_storage_path,
]
  .map((path) => String(path || "").trim())
  .filter((path) => path.startsWith(`items/${itemId}/`) || path.startsWith(`demo-items/${itemId}/`))
  .filter((path) => !path.includes(".."));

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

export async function DELETE(request: NextRequest) {
  try {
    const { supabase } = await requireAdmin();
    const body = await request.json();
    const itemIds = Array.isArray(body.itemIds) ? body.itemIds.filter((id: any) => typeof id === "string" && id.trim()) : [];

    if (!itemIds.length) {
      return NextResponse.json({ error: "削除する出品を選択してください" }, { status: 400 });
    }

    if (itemIds.length > 50) {
      return NextResponse.json({ error: "一度に削除できるのは50件までです" }, { status: 400 });
    }

    // 1. Fetch items to ensure they exist and check for transactions
    const { data: items, error: itemsError } = await (supabase as any)
      .from("items")
      .select("id, title, image_storage_provider, front_image_url, back_image_url, front_thumbnail_url, back_thumbnail_url, front_image_storage_path, back_image_storage_path, front_thumbnail_storage_path, back_thumbnail_storage_path, transactions(id)")
      .in("id", itemIds);

    if (itemsError) throw itemsError;
    if (!items || items.length === 0) {
      return NextResponse.json({ error: "指定された出品が見つかりません" }, { status: 404 });
    }

    // Block deletion if ANY item has transactions
    const itemsWithTx = items.filter((item: any) => item.transactions && item.transactions.length > 0);
    if (itemsWithTx.length > 0) {
      return NextResponse.json({ 
        error: `取引が関連付けられている出品（${itemsWithTx.length}件）は削除できません。先に取引を削除するか、非表示にしてください。` 
      }, { status: 400 });
    }

    const foundIds = items.map((i: any) => i.id);

    // 2. Delete images
    let r2DeletedCount = 0;
    for (const item of items) {
      const isR2 = item.image_storage_provider === "r2";
      if (isR2) {
        const paths = safeR2Paths(item.id, item);
        for (const path of paths) {
          try {
            await deleteR2Object(path);
            r2DeletedCount++;
          } catch (err) {
            console.error(`Failed to delete R2 object: ${path}`, err);
            // Continue with other deletions even if one fails
          }
        }
      } else {
        const paths = safeSupabasePaths(item);
        if (paths.length > 0) {
          const { error: storageError } = await supabase.storage.from("item-images").remove(paths);
          if (storageError) {
            console.error(`Failed to delete Supabase storage objects for item ${item.id}`, storageError);
          }
        }
      }
    }

    // 3. Delete database records (rpc or direct)
    // We'll delete directly since we already verified no transactions
    // and this is a bulk admin action
    const { error: deleteError } = await (supabase as any)
      .from("items")
      .delete()
      .in("id", foundIds);

    if (deleteError) throw deleteError;

    // 4. Log actions
    await adminLog(
      supabase,
      "items_bulk_purged",
      "system",
      "bulk",
      `${foundIds.length}件の出品を完全削除しました`,
      { itemIds: foundIds, titles: items.map((i: any) => i.title), r2DeletedCount }
    );

    revalidatePath("/admin/items");
    revalidatePath("/admin/demo-home");
    revalidatePath("/admin/demo-items");
    revalidatePath("/admin");
    return NextResponse.json({ success: true, deleted: foundIds.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "出品を削除できませんでした" }, { status: 500 });
  }
}
