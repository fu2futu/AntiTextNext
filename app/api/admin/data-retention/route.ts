import { NextResponse, type NextRequest } from "next/server";
import { adminLog, requireAdmin } from "@/lib/admin-utils";

export async function POST(request: NextRequest) {
  try {
    const { action, settingId, retentionDays, enabled, dryRun } = await request.json();
    const { supabase } = await requireAdmin();

    if (action === "update_setting") {
      const days = Number(retentionDays);
      if (!settingId || !Number.isInteger(days) || days < 1 || days > 3650) {
        return NextResponse.json({ error: "保存期間は1日以上3650日以下で指定してください" }, { status: 400 });
      }

      const { error } = await (supabase as any).rpc("admin_update_data_retention_setting", {
        setting_id: settingId,
        new_retention_days: days,
        new_enabled: Boolean(enabled),
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      await adminLog(supabase, "data_retention_setting_updated", "data_retention_setting", settingId, "保存期間設定を更新", {
        retentionDays: days,
        enabled: Boolean(enabled),
      });

      return NextResponse.json({ success: true });
    }

    if (action === "run") {
      const { data, error } = await (supabase as any).rpc("admin_run_data_retention", {
        dry_run: dryRun !== false,
      });
      const { data: deletedAccountData, error: deletedAccountError } = await (supabase as any).rpc(
        "admin_run_deleted_account_retention",
        {
          dry_run: dryRun !== false,
        }
      );

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      if (deletedAccountError) {
        return NextResponse.json({ error: deletedAccountError.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        result: {
          ...(data ?? {}),
          deletedAccountRetention: deletedAccountData,
        },
      });
    }

    return NextResponse.json({ error: "不明な操作です" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "保存期間設定の処理に失敗しました" }, { status: 500 });
  }
}
