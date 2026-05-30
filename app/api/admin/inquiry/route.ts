import { NextResponse, type NextRequest } from "next/server";
import { adminLog } from "@/lib/admin-utils";
import { isCurrentUserAdmin } from "@/lib/admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { sendInquiryReplyEmail } from "@/lib/email";
import { sendWebPushToUser } from "@/lib/web-push";

const allowedStatuses = new Set(["open", "checking", "replied", "completed", "no_action"]);

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
    const { inquiryId, status, adminNote, reason } = body;

    if (!inquiryId || !status) {
      return NextResponse.json({ error: "問い合わせIDと状態が必要です" }, { status: 400 });
    }

    if (!allowedStatuses.has(status)) {
      return NextResponse.json({ error: "指定できない状態です" }, { status: 400 });
    }

    const adminContext = await getAdminContext();
    if (adminContext.error) return adminContext.error;
    const { supabase, user } = adminContext;
    const { error } = await (supabase as any)
      .from("inquiries")
      .update({
        status,
        admin_note: adminNote ?? null,
        assignee_id: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", inquiryId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await adminLog(supabase, "inquiry_status_update", "inquiry", inquiryId, reason || `status: ${status}`, {
      status,
      adminNote: adminNote ?? null,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "問い合わせを更新できませんでした" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { inquiryId, message } = body;

    if (!inquiryId || !message || !String(message).trim()) {
      return NextResponse.json({ error: "問い合わせIDとメッセージが必要です" }, { status: 400 });
    }

    const adminContext = await getAdminContext();
    if (adminContext.error) return adminContext.error;
    const { supabase, user } = adminContext;
    const { data: inquiry, error: inquiryError } = await (supabase as any)
      .from("inquiries")
      .select("id, sender_user_id, sender_name, status, email")
      .eq("id", inquiryId)
      .single();

    if (inquiryError || !inquiry) {
      return NextResponse.json({ error: inquiryError?.message || "問い合わせが見つかりません" }, { status: 404 });
    }

    if (!inquiry.sender_user_id) {
      return NextResponse.json({ error: "この問い合わせは送信者ユーザーIDがないため、お知らせへ送信できません" }, { status: 400 });
    }

    const trimmedMessage = String(message).trim();

    // 言語設定の取得（デフォルトja）
    let userLocale = "ja";
    if (inquiry.sender_user_id) {
      const { data: profile } = await (supabase as any)
        .from("profiles")
        .select("locale")
        .eq("user_id", inquiry.sender_user_id)
        .single();
      if (profile?.locale) userLocale = profile.locale;
    }

    // メール送信（エラーを握り潰して続行、ログは残る）
    if (inquiry.email) {
      await sendInquiryReplyEmail(inquiry.email, trimmedMessage, userLocale);
    }

    const { error: messageInsertError } = await (supabase as any).from("inquiry_messages").insert({
      inquiry_id: inquiry.id,
      sender_user_id: user.id,
      sender_role: "admin",
      message: trimmedMessage,
    });

    if (messageInsertError) {
      return NextResponse.json({ error: messageInsertError.message }, { status: 500 });
    }

    const rpcResult = await (supabase as any).rpc("admin_send_user_notification", {
      target_user_id: inquiry.sender_user_id,
      notification_title: "お問い合わせへの返信",
      notification_message: trimmedMessage,
      notification_type: "admin_inquiry_reply",
      target_link_type: "inquiry",
      target_link_id: inquiry.id,
    });

    if (rpcResult.error) {
      const { error: insertError } = await (supabase as any).from("notifications").insert({
        user_id: inquiry.sender_user_id,
        type: "admin_inquiry_reply",
        title: "お問い合わせへの返信",
        message: trimmedMessage,
        link_type: "inquiry",
        link_id: inquiry.id,
        is_read: false,
      });

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://textnext.jp";
    await sendWebPushToUser(inquiry.sender_user_id, {
      title: "お問い合わせへの返信",
      body: trimmedMessage.slice(0, 120),
      url: `${baseUrl}/profile/inquiries/${inquiry.id}`,
    });

    await (supabase as any)
      .from("inquiries")
      .update({
        assignee_id: user.id,
        has_unread_user_message: false,
        last_admin_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", inquiryId);

    await adminLog(supabase, "inquiry_notification_sent", "inquiry", inquiryId, "問い合わせ送信者へお知らせ送信", {
      targetUserId: inquiry.sender_user_id,
      message: trimmedMessage,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "メッセージを送信できませんでした" }, { status: 500 });
  }
}
