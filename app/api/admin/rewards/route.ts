import { NextResponse, type NextRequest } from "next/server";
import { adminLog, requireAdmin } from "@/lib/admin-utils";
import { normalizeBadgeColor } from "@/lib/rewards";

export async function PATCH(request: NextRequest) {
  try {
    const { enabled, startsAt, endsAt, userId, earlyRegistrationOverride, note } = await request.json();
    const { supabase, user } = await requireAdmin();

    if (userId) {
      const override = earlyRegistrationOverride || "auto";
      if (!["auto", "force_on", "force_off"].includes(override)) {
        return NextResponse.json({ error: "指定できない個別設定です" }, { status: 400 });
      }

      const { error } = await (supabase as any)
        .from("user_reward_overrides")
        .upsert({
          user_id: userId,
          early_registration_override: override,
          note: note || null,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        });

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      await adminLog(supabase, "user_reward_override_update", "user", userId, "早期登録特典の個別設定を更新", {
        earlyRegistrationOverride: override,
        note: note || null,
      });

      return NextResponse.json({ success: true });
    }

    const { error } = await (supabase as any)
      .from("reward_settings")
      .upsert({
        id: "early_registration",
        enabled: Boolean(enabled),
        starts_at: startsAt || null,
        ends_at: endsAt || null,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await adminLog(supabase, "reward_setting_update", "reward_setting", "early_registration", "早期登録特典設定を更新", {
      enabled: Boolean(enabled),
      startsAt: startsAt || null,
      endsAt: endsAt || null,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "特典設定を更新できませんでした" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId, badgeType, badgeColor, label, note } = await request.json();
    if (!userId || !badgeType || !label) {
      return NextResponse.json({ error: "ユーザーID、バッジ種別、表示名が必要です" }, { status: 400 });
    }
    const normalizedBadgeColor = normalizeBadgeColor(badgeColor);

    const { supabase, user } = await requireAdmin();
    const { data, error } = await (supabase as any)
      .from("user_badges")
      .insert({
        user_id: userId,
        badge_type: badgeType,
        badge_color: normalizedBadgeColor,
        label,
        note: note || null,
        granted_by: user.id,
      })
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await adminLog(supabase, "user_badge_grant", "user", userId, `バッジ付与: ${label}`, {
      badgeId: data?.id,
      badgeType,
      badgeColor: normalizedBadgeColor,
      note: note || null,
    });

    return NextResponse.json({ success: true, badgeId: data?.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "バッジを付与できませんでした" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { badgeId, reason } = await request.json();
    if (!badgeId) return NextResponse.json({ error: "バッジIDが必要です" }, { status: 400 });

    const { supabase } = await requireAdmin();
    const { data: badge, error: fetchError } = await (supabase as any)
      .from("user_badges")
      .select("*")
      .eq("id", badgeId)
      .single();

    if (fetchError || !badge) return NextResponse.json({ error: fetchError?.message || "バッジが見つかりません" }, { status: 404 });

    const { error } = await (supabase as any)
      .from("user_badges")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", badgeId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await adminLog(supabase, "user_badge_revoke", "user", badge.user_id, reason || `バッジ取り消し: ${badge.label}`, {
      badgeId,
      badgeType: badge.badge_type,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "バッジを取り消せませんでした" }, { status: 500 });
  }
}
