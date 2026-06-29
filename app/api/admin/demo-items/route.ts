import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { adminLog, requireAdmin } from "@/lib/admin-utils";
import { deleteR2Object, uploadR2Object } from "@/lib/r2-server";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxBytes = 5 * 1024 * 1024;
const demoPurposes = new Set(["app_store_screenshot", "flow_test", "other"]);

const extensionForContentType = (contentType: string) => {
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/png") return "png";
  return "jpg";
};

const readOptionalImage = async (formData: FormData, name: string) => {
  const value = formData.get(name);
  if (!(value instanceof File) || value.size <= 0) return null;
  if (!allowedTypes.has(value.type)) {
    throw new Error("対応していない画像形式です");
  }
  if (value.size > maxBytes) {
    throw new Error("画像は5MB以内にしてください");
  }
  return value;
};

const uploadDemoImage = async (itemId: string, side: "front" | "back", file: File) => {
  const buffer = Buffer.from(await file.arrayBuffer());
  const objectId = crypto.randomUUID();
  const extension = extensionForContentType(file.type);
  const detailPath = `demo-items/${itemId}/${objectId}-${side}-detail.${extension}`;
  const thumbPath = `demo-items/${itemId}/${objectId}-${side}-thumb.${extension}`;

  await uploadR2Object({ key: detailPath, body: buffer, contentType: file.type });
  await uploadR2Object({ key: thumbPath, body: buffer, contentType: file.type });

  return { detailPath, thumbPath };
};

const safeDemoPaths = (itemId: string, item: Record<string, unknown>) => [
  item.front_image_storage_path,
  item.back_image_storage_path,
  item.front_thumbnail_storage_path,
  item.back_thumbnail_storage_path,
]
  .map((path) => String(path || "").trim())
  .filter((path) => path.startsWith(`demo-items/${itemId}/`) && !path.includes(".."));

export async function POST(request: NextRequest) {
  const uploadedPaths: string[] = [];
  try {
    const { supabase, user } = await requireAdmin();
    const formData = await request.formData();

    const title = String(formData.get("title") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const originalPrice = Number(formData.get("originalPrice") || 0);
    const sellingPrice = Number(formData.get("sellingPrice") || 0);
    const status = String(formData.get("status") || "available");
    const purposeValue = String(formData.get("demoPurpose") || "app_store_screenshot");
    const demoPurpose = demoPurposes.has(purposeValue) ? purposeValue : "other";

    if (title.length < 1 || title.length > 80) {
      return NextResponse.json({ error: "タイトルは1〜80文字で入力してください" }, { status: 400 });
    }
    if (!Number.isInteger(sellingPrice) || sellingPrice < 0 || sellingPrice > 50000) {
      return NextResponse.json({ error: "価格は0〜50000円の整数で入力してください" }, { status: 400 });
    }
    if (!Number.isInteger(originalPrice) || originalPrice < 0 || originalPrice > 100000) {
      return NextResponse.json({ error: "定価は0〜100000円の整数で入力してください" }, { status: 400 });
    }
    if (!["available", "trading", "sold", "paused"].includes(status)) {
      return NextResponse.json({ error: "ステータスが不正です" }, { status: 400 });
    }

    const frontFile = await readOptionalImage(formData, "frontImage");
    const backFile = await readOptionalImage(formData, "backImage");
    const itemId = crypto.randomUUID();

    const front = frontFile ? await uploadDemoImage(itemId, "front", frontFile) : null;
    if (front) uploadedPaths.push(front.detailPath, front.thumbPath);
    const back = backFile ? await uploadDemoImage(itemId, "back", backFile) : null;
    if (back) uploadedPaths.push(back.detailPath, back.thumbPath);

    const { error } = await (supabase as any).from("items").insert({
      id: itemId,
      seller_id: user.id,
      title,
      description: description || null,
      original_price: originalPrice,
      selling_price: sellingPrice,
      status,
      is_demo: true,
      created_by_admin_id: user.id,
      demo_purpose: demoPurpose,
      image_storage_provider: "r2",
      front_image_storage_path: front?.detailPath ?? null,
      front_thumbnail_storage_path: front?.thumbPath ?? null,
      back_image_storage_path: back?.detailPath ?? null,
      back_thumbnail_storage_path: back?.thumbPath ?? null,
    });

    if (error) throw error;

    await adminLog(supabase, "demo_item_created", "item", itemId, "demo item created", {
      title,
      status,
      demoPurpose,
      uploadedPaths,
    });

    revalidatePath("/admin/demo-home");
    revalidatePath("/admin/demo-items");
    return NextResponse.json({ success: true, itemId });
  } catch (err: any) {
    await Promise.allSettled(uploadedPaths.map((path) => deleteR2Object(path)));
    return NextResponse.json({ error: err.message || "デモ出品を作成できませんでした" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { supabase } = await requireAdmin();
    const { itemIds } = await request.json();
    const ids = Array.isArray(itemIds) ? itemIds.map((id) => String(id)) : [];
    if (ids.length === 0 || ids.length > 50) {
      return NextResponse.json({ error: "削除対象が不正です" }, { status: 400 });
    }

    const { data: items, error } = await (supabase as any)
      .from("items")
      .select("id,title,front_image_storage_path,back_image_storage_path,front_thumbnail_storage_path,back_thumbnail_storage_path,transactions(id)")
      .in("id", ids)
      .eq("is_demo", true);

    if (error) throw error;
    const rows = (items ?? []) as any[];
    const blocked = rows.filter((item) => (item.transactions ?? []).length > 0);
    if (blocked.length > 0) {
      return NextResponse.json({ error: "関連取引があるデモ出品はPhase 1では削除できません" }, { status: 400 });
    }

    const paths = rows.flatMap((item) => safeDemoPaths(item.id, item));
    const deleteResults = await Promise.allSettled(paths.map((path) => deleteR2Object(path)));
    const failed = deleteResults.filter((result) => result.status === "rejected").length;
    if (failed > 0) {
      return NextResponse.json({ error: "R2画像削除に失敗したためDB削除を中止しました" }, { status: 500 });
    }

    const { error: deleteError } = await (supabase as any)
      .from("items")
      .delete()
      .in("id", rows.map((item) => item.id))
      .eq("is_demo", true);

    if (deleteError) throw deleteError;

    await adminLog(supabase, "demo_items_deleted", "item", rows.map((item) => item.id).join(","), "demo items deleted", {
      count: rows.length,
      titles: rows.map((item) => item.title),
      r2Deleted: paths.length,
    });

    revalidatePath("/admin/demo-home");
    revalidatePath("/admin/demo-items");
    return NextResponse.json({ success: true, deleted: rows.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "デモ出品を削除できませんでした" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase } = await requireAdmin();
    const body = await request.json();
    const itemId = String(body.itemId || "").trim();
    const isDemo = Boolean(body.isDemo);

    if (!itemId) {
      return NextResponse.json({ error: "出品IDを指定してください" }, { status: 400 });
    }

    const { data: item, error: fetchError } = await (supabase as any)
      .from("items")
      .select("id, title, is_demo")
      .eq("id", itemId)
      .single();

    if (fetchError || !item) {
      return NextResponse.json({ error: "出品が見つかりません" }, { status: 404 });
    }

    const { error: updateError } = await (supabase as any)
      .from("items")
      .update({ is_demo: isDemo })
      .eq("id", itemId);

    if (updateError) throw updateError;

    // Also update related transactions' is_demo
    const { error: txError } = await (supabase as any)
      .from("transactions")
      .update({ is_demo: isDemo })
      .eq("item_id", itemId);

    if (txError) {
      console.error("Failed to update related transactions is_demo:", txError.message);
    }

    await adminLog(
      supabase,
      isDemo ? "item_marked_demo" : "item_unmarked_demo",
      "item",
      itemId,
      isDemo ? "出品をデモに変更" : "出品を通常に変更",
      { title: item.title, previousIsDemo: item.is_demo }
    );

    revalidatePath("/admin/items");
    revalidatePath(`/admin/items/${itemId}`);
    revalidatePath("/admin");
    revalidatePath("/admin/demo-home");
    revalidatePath("/admin/demo-items");
    revalidatePath("/admin/transactions");
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "デモ切り替えに失敗しました" }, { status: 500 });
  }
}
