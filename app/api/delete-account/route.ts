import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { deleteR2Object } from "@/lib/r2-server";

export const runtime = "nodejs";

const ACTIVE_TRANSACTION_STATUSES = ["requested", "accepted", "scheduling", "scheduled", "awaiting_rating"];

const createServiceClient = () => {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};

const hashEmail = (email: string) =>
  createHash("sha256")
    .update(`${email.trim().toLowerCase()}:${process.env.ACCOUNT_DELETION_HASH_PEPPER || ""}`)
    .digest("hex");

const notifyAdminsOfDeletionIssue = async (
  serviceClient: ReturnType<typeof createServiceClient>,
  payload: {
    title: string;
    message: string;
    userId: string;
  }
) => {
  if (!serviceClient) return;

  const { data: adminEmails } = await (serviceClient as any)
    .from("admin_emails")
    .select("email");

  const adminEmailSet = new Set(
    ((adminEmails ?? []) as Array<{ email?: string }>)
      .map((row) => String(row.email || "").trim().toLowerCase())
      .filter(Boolean)
  );

  if (adminEmailSet.size === 0) return;

  const adminUserIds: string[] = [];
  let page = 1;
  const perPage = 1000;

  for (;;) {
    const { data, error } = await serviceClient.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error("Failed to list admin users for deletion issue notification:", error);
      return;
    }

    for (const authUser of data.users ?? []) {
      const email = String(authUser.email || "").trim().toLowerCase();
      if (adminEmailSet.has(email)) adminUserIds.push(authUser.id);
    }

    if ((data.users ?? []).length < perPage) break;
    page += 1;
  }

  if (adminUserIds.length === 0) return;

  await (serviceClient as any)
    .from("notifications")
    .insert(
      adminUserIds.map((adminUserId) => ({
        user_id: adminUserId,
        type: "admin_alert",
        title: payload.title,
        message: payload.message,
        link_type: "admin",
        link_id: `deleted-accounts:${payload.userId}`,
        is_read: false,
      }))
    );
};

const safeR2Paths = (itemId: string, item: Record<string, unknown>) =>
  [
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

const safeSupabasePaths = (item: Record<string, unknown>) =>
  Array.from(
    new Set(
      [
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
        .filter((path) => path && !path.includes("..") && !path.startsWith("http"))
    )
  );

export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const serviceClient = createServiceClient();

    if (!serviceClient) {
      return NextResponse.json({ error: "削除処理の設定が不足しています" }, { status: 500 });
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";

    const { count: activeTransactionCount, error: activeTransactionError } = await (supabase as any)
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .or(`buyer_id.eq.${session.user.id},seller_id.eq.${session.user.id}`)
      .in("status", ACTIVE_TRANSACTION_STATUSES);

    if (activeTransactionError) throw activeTransactionError;
    if ((activeTransactionCount ?? 0) > 0) {
      return NextResponse.json(
        { error: "進行中の取引があるため、アカウントを削除できません" },
        { status: 400 }
      );
    }

    const { data: profile, error: profileError } = await (supabase as any)
      .from("profiles")
      .select("avatar_url")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (profileError) throw profileError;

    const { data: items, error: itemsError } = await (supabase as any)
      .from("items")
      .select(
        "id,image_storage_provider,front_image_url,back_image_url,front_thumbnail_url,back_thumbnail_url,front_image_storage_path,back_image_storage_path,front_thumbnail_storage_path,back_thumbnail_storage_path"
      )
      .eq("seller_id", session.user.id);

    if (itemsError) throw itemsError;

    const avatarPaths = Array.from(
      new Set(
        [
          parseSupabasePublicPath(profile?.avatar_url),
          `${session.user.id}/avatar.jpg`,
          `${session.user.id}/avatar.jpeg`,
          `${session.user.id}/avatar.png`,
          `${session.user.id}/avatar.webp`,
        ]
          .map((path) => String(path || "").trim())
          .filter((path) => path && path.startsWith(`${session.user.id}/`) && !path.includes(".."))
      )
    );

    const r2DeleteTargets: string[] = [];
    const supabaseDeleteTargets = new Set<string>(avatarPaths);

    for (const item of (items ?? []) as any[]) {
      if (item.image_storage_provider === "r2") {
        r2DeleteTargets.push(...safeR2Paths(item.id, item));
      } else {
        safeSupabasePaths(item).forEach((path) => supabaseDeleteTargets.add(path));
      }
    }

    const emailHash = hashEmail(session.user.email || session.user.id);
    const { data: deleteResult, error: deleteError } = await (supabase as any).rpc("delete_current_user_account", {
      target_email_hash: emailHash,
      deletion_reason: reason || null,
    });

    if (deleteError) {
      const message =
        deleteError.message === "active transactions exist"
          ? "進行中の取引があるため、アカウントを削除できません"
          : deleteError.message || "アカウント削除に失敗しました";
      return NextResponse.json({ error: message }, { status: 500 });
    }

    const storageFailures: Array<{ provider: string; path: string; error: string }> = [];
    if (r2DeleteTargets.length > 0) {
      const results = await Promise.allSettled(r2DeleteTargets.map((path) => deleteR2Object(path)));
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          storageFailures.push({
            provider: "r2",
            path: r2DeleteTargets[index],
            error: result.reason?.message || "R2画像削除に失敗しました",
          });
        }
      });
    }

    const supabasePaths = Array.from(supabaseDeleteTargets);
    if (supabasePaths.length > 0) {
      const { error } = await serviceClient.storage.from("item-images").remove(supabasePaths);
      if (error) {
        supabasePaths.forEach((path) => {
          storageFailures.push({ provider: "supabase", path, error: error.message });
        });
      }
    }

    if (storageFailures.length > 0) {
      await (serviceClient as any)
        .from("account_deletion_storage_errors")
        .insert(
          storageFailures.map((failure) => ({
            user_id: session.user.id,
            storage_provider: failure.provider,
            object_path: failure.path,
            error_message: failure.error,
          }))
        );

      await (serviceClient as any)
        .from("account_deletion_issues")
        .insert({
          user_id: session.user.id,
          issue_type: "storage_delete_failed",
          severity: "warning",
          message: "アカウント削除後の画像削除に失敗しました。管理者確認が必要です。",
          metadata: {
            failures: storageFailures,
          },
        });

      await notifyAdminsOfDeletionIssue(serviceClient, {
        userId: session.user.id,
        title: "アカウント削除の画像削除エラー",
        message: "アカウント削除後の画像削除に失敗しました。削除済みアカウント画面を確認してください。",
      });
    }

    const { error: deleteUserError } = await serviceClient.auth.admin.deleteUser(session.user.id);
    let authDeletionMode: "deleted" | "auth_delete_failed" = "deleted";
    if (deleteUserError) {
      authDeletionMode = "auth_delete_failed";
      await (serviceClient as any)
        .from("account_deletion_issues")
        .insert({
          user_id: session.user.id,
          issue_type: "auth_delete_failed",
          severity: "critical",
          message: "Supabase Authユーザーの物理削除に失敗しました。管理者対応が必要です。",
          metadata: {
            error: deleteUserError.message,
          },
        });

      await notifyAdminsOfDeletionIssue(serviceClient, {
        userId: session.user.id,
        title: "アカウント削除のAuth削除失敗",
        message: "ユーザー情報は匿名化済みですが、Supabase Authユーザーの物理削除に失敗しました。削除済みアカウント画面を確認してください。",
      });

      console.error("Supabase Auth user physical deletion failed; admin issue was recorded.", deleteUserError);
    }

    await supabase.auth.signOut();

    return NextResponse.json({
      success: true,
      deleteResult,
      authDeletionMode,
      storageFailureCount: storageFailures.length,
    });
  } catch (err: any) {
    console.error("Delete account error:", err);
    return NextResponse.json({ error: err.message || "アカウント削除に失敗しました" }, { status: 500 });
  }
}
