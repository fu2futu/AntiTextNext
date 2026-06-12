import { NextResponse, type NextRequest } from "next/server";
import { adminLog } from "@/lib/admin-utils";
import { isCurrentUserAdmin } from "@/lib/admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { sendWebPushToUser } from "@/lib/web-push";

const allowedStatuses = new Set(["open", "posted", "done", "no_action"]);

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// 商品URL または 商品ID から商品IDを取り出す
const extractItemId = (ref: string): string | null => {
  const trimmed = String(ref || "").trim();
  if (!trimmed) return null;
  const match = trimmed.match(UUID_RE);
  return match ? match[0] : null;
};

async function getAdminContext() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: "ログインが必要です" }, { status: 401 }) };
  }

  const isAdmin = await isCurrentUserAdmin(supabase as any);
  if (!isAdmin) {
    return { error: NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 }) };
  }

  return { supabase, user };
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { requestId, status, adminNote, reason } = body;

    if (!requestId || !status) {
      return NextResponse.json({ error: "リクエストIDと状態が必要です" }, { status: 400 });
    }

    if (!allowedStatuses.has(status)) {
      return NextResponse.json({ error: "指定できない状態です" }, { status: 400 });
    }

    const adminContext = await getAdminContext();
    if (adminContext.error) return adminContext.error;
    const { supabase, user } = adminContext;

    const { error } = await (supabase as any)
      .from("book_requests")
      .update({
        status,
        admin_note: adminNote ?? null,
        assignee_id: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await adminLog(supabase, "book_request_status_update", "book_request", requestId, reason || `status: ${status}`, {
      status,
      adminNote: adminNote ?? null,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "本リクエストを更新できませんでした" }, { status: 500 });
  }
}

// 運営が出品を確認し、リクエスト者へ「出品されました」通知を手動送信する
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { requestId, itemRef } = body;

    if (!requestId || !itemRef) {
      return NextResponse.json({ error: "リクエストIDと商品URL/IDが必要です" }, { status: 400 });
    }

    const itemId = extractItemId(itemRef);
    if (!itemId) {
      return NextResponse.json({ error: "商品URLまたは商品IDを正しく入力してください" }, { status: 400 });
    }

    const adminContext = await getAdminContext();
    if (adminContext.error) return adminContext.error;
    const { supabase, user } = adminContext;

    const { data: req, error: reqError } = await (supabase as any)
      .from("book_requests")
      .select("id, requester_id, book_title")
      .eq("id", requestId)
      .single();

    if (reqError || !req) {
      return NextResponse.json({ error: reqError?.message || "リクエストが見つかりません" }, { status: 404 });
    }

    if (!req.requester_id) {
      return NextResponse.json({ error: "リクエスト者が不明なため通知できません" }, { status: 400 });
    }

    const { data: item } = await (supabase as any)
      .from("items")
      .select("id, title")
      .eq("id", itemId)
      .single();

    if (!item) {
      return NextResponse.json({ error: "指定された商品が見つかりません" }, { status: 404 });
    }

    const title = "リクエストした本が出品されました！";
    const message = `「${item.title}」が出品されました。早めにチェックしてみてください！`;

    const rpcResult = await (supabase as any).rpc("admin_send_user_notification", {
      target_user_id: req.requester_id,
      notification_title: title,
      notification_message: message,
      notification_type: "book_request_match",
      target_link_type: "product",
      target_link_id: item.id,
    });

    if (rpcResult.error) {
      const { error: insertError } = await (supabase as any).from("notifications").insert({
        user_id: req.requester_id,
        type: "book_request_match",
        title,
        message,
        link_type: "product",
        link_id: item.id,
        is_read: false,
      });
      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://textnext.jp";
    await sendWebPushToUser(req.requester_id, {
      title,
      body: message,
      url: `${baseUrl}/product/${item.id}`,
    });

    await (supabase as any)
      .from("book_requests")
      .update({ assignee_id: user.id, updated_at: new Date().toISOString() })
      .eq("id", requestId);

    await adminLog(supabase, "book_request_notify_listing", "book_request", requestId, `出品をリクエスト者へ通知（商品: ${item.title}）`, {
      itemId: item.id,
      itemTitle: item.title,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "通知を送信できませんでした" }, { status: 500 });
  }
}
