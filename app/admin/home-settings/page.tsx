import { AdminPageHeader } from "../_components/admin-shell";
import { requireAdmin } from "@/lib/admin-utils";
import HomeSettingsForm from "./home-settings-form";

export const dynamic = "force-dynamic";

export default async function AdminHomeSettingsPage() {
  const { supabase } = await requireAdmin();
  const { data } = await (supabase as any)
    .from("app_home_settings")
    .select("recommended_enabled,updated_at")
    .eq("id", "global")
    .maybeSingle();

  return (
    <>
      <AdminPageHeader
        title="ホーム表示設定"
        description="ホーム画面の各セクションの表示/非表示を管理します。"
      />
      <main className="p-6">
        <HomeSettingsForm
          initialRecommendedEnabled={data?.recommended_enabled ?? true}
          initialUpdatedAt={data?.updated_at || null}
        />
      </main>
    </>
  );
}
