import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { adminLog, requireAdmin } from "@/lib/admin-utils";
import { sendAdminNoticeEmail } from "@/lib/email";

const allowedRestrictionTypes = new Set(["warning", "temporary_suspend", "permanent_ban"]);

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, restrictionType, reason, endsAt, adminNote, userNotice } = body;

    if (!userId || !restrictionType || !reason || !String(reason).trim()) {
      return NextResponse.json({ error: "対象ユーザー、制限種別、理由が必要です" }, { status: 400 });
    }

    if (!allowedRestrictionTypes.has(restrictionType)) {
      return NextResponse.json({ error: "指定できない制限種別です" }, { status: 400 });
    }

    const { supabase, user } = await requireAdmin();
    if (user.id === userId && restrictionType === "permanent_ban") {
      return NextResponse.json({ error: "自分自身を永久BANにはできません" }, { status: 400 });
    }

    const { data, error } = await (supabase as any)
      .from("user_restrictions")
      .insert({
        user_id: userId,
        restriction_type: restrictionType,
        reason: String(reason).trim(),
        ends_at: restrictionType === "temporary_suspend" ? endsAt || null : null,
        admin_note: adminNote || null,
        user_notice: userNotice || null,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let targetEmail: string | null = null;
    if (restrictionType === "permanent_ban") {
      const { data: email, error: emailError } = await (supabase as any).rpc("admin_get_user_email", {
        target_user_id: userId,
        reason: `永久BANに伴う再登録ブロックのため`,
      });

      if (emailError) {
        return NextResponse.json({ error: emailError.message }, { status: 500 });
      }

      targetEmail = email || null;
      if (targetEmail) {
        const serviceClient = createServiceClient();
        if (!serviceClient) {
          return NextResponse.json({ error: "BANリスト登録の設定が不足しています" }, { status: 500 });
        }

        const emailHash = hashEmail(targetEmail);
        const { error: banError } = await (serviceClient as any)
          .from("account_email_bans")
          .upsert(
            {
              email_hash: emailHash,
              reason: String(reason).trim(),
              created_by: user.id,
              lifted_at: null,
              lifted_by: null,
              admin_note: adminNote || null,
            },
            { onConflict: "email_hash" }
          );

        if (banError) {
          return NextResponse.json({ error: banError.message }, { status: 500 });
        }
      }
    }

    if (userNotice && String(userNotice).trim()) {
      const trimmedNotice = String(userNotice).trim();
      
      await (supabase as any).rpc("admin_send_user_notification", {
        target_user_id: userId,
        notification_title: "アカウント状態について",
        notification_message: trimmedNotice,
        notification_type: "admin_restriction_notice",
        target_link_type: "profile",
        target_link_id: userId,
      });

      // メール送信処理
      try {
        const { data: email } = await (supabase as any).rpc("admin_get_user_email", {
          target_user_id: userId,
          reason: `制限実行(${restrictionType})に伴う通知メール送信のため`,
        });

        if (email) {
          let userLocale = "ja";
          const { data: profile } = await (supabase as any)
            .from("profiles")
            .select("locale")
            .eq("user_id", userId)
            .single();
          if (profile?.locale) userLocale = profile.locale;

          let emailContent = "";
          if (restrictionType === "warning") {
            emailContent = userLocale === "en" ? `You have received a warning.\nReason: ${trimmedNotice}` : `アカウントに警告が行われました。\n理由: ${trimmedNotice}`;
          } else if (restrictionType === "temporary_suspend") {
            const endsAtStr = endsAt ? new Date(endsAt).toLocaleString(userLocale) : "不明";
            emailContent = userLocale === "en" 
              ? `Your account has been temporarily suspended.\nReason: ${trimmedNotice}\nSuspension ends at: ${endsAtStr}` 
              : `アカウントが一時停止されました。\n理由: ${trimmedNotice}\n停止解除予定: ${endsAtStr}`;
          } else if (restrictionType === "permanent_ban") {
            emailContent = userLocale === "en" ? `Your account has been permanently banned.\nReason: ${trimmedNotice}` : `アカウントが永久停止（BAN）されました。\n理由: ${trimmedNotice}`;
          }

          await sendAdminNoticeEmail(email, "アカウント状態について", emailContent, userLocale);
        }
      } catch (emailErr) {
        console.error("Failed to send restriction email:", emailErr);
      }
    }

    await adminLog(supabase, "user_restriction_created", "user", userId, String(reason).trim(), {
      restrictionId: data?.id,
      restrictionType,
      endsAt: restrictionType === "temporary_suspend" ? endsAt || null : null,
      emailBanSynced: restrictionType === "permanent_ban" && Boolean(targetEmail),
    });

    return NextResponse.json({ success: true, restrictionId: data?.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "制限を登録できませんでした" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, reason } = body;

    if (!userId || !reason || !String(reason).trim()) {
      return NextResponse.json({ error: "対象ユーザーと解除理由が必要です" }, { status: 400 });
    }

    const { supabase, user } = await requireAdmin();
    const { data: email } = await (supabase as any).rpc("admin_get_user_email", {
      target_user_id: userId,
      reason: `BAN/制限解除に伴う再登録ブロック解除のため`,
    });

    const { error } = await (supabase as any)
      .from("user_restrictions")
      .update({ lifted_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("lifted_at", null);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (email) {
      const serviceClient = createServiceClient();
      if (!serviceClient) {
        return NextResponse.json({ error: "BANリスト解除の設定が不足しています" }, { status: 500 });
      }

      const { error: liftBanError } = await (serviceClient as any)
        .from("account_email_bans")
        .update({
          lifted_at: new Date().toISOString(),
          lifted_by: user.id,
          admin_note: String(reason).trim(),
        })
        .eq("email_hash", hashEmail(email))
        .is("lifted_at", null);

      if (liftBanError) {
        return NextResponse.json({ error: liftBanError.message }, { status: 500 });
      }
    }

    await adminLog(supabase, "user_restrictions_lifted", "user", userId, String(reason).trim());

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "制限を解除できませんでした" }, { status: 500 });
  }
}
