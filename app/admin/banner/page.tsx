import { AdminPageHeader } from "../_components/admin-shell";
import { requireAdmin } from "@/lib/admin-utils";
import BannerSettingsForm from "./banner-settings-form";

export const dynamic = "force-dynamic";

export default async function AdminBannerPage() {
  const { supabase } = await requireAdmin();
  const { data } = await (supabase as any)
    .from("app_notice_banner")
    .select("enabled,message,updated_at")
    .eq("id", "global")
    .maybeSingle();

  return (
    <>
      <AdminPageHeader
        title="上部お知らせ"
        description="アプリ画面上部に表示するお知らせを管理します。表示文言は完成版アプリとして自然な内容にしてください。"
      />
      <main className="p-6">
        <BannerSettingsForm
          initialEnabled={Boolean(data?.enabled)}
          initialMessage={data?.message || ""}
          initialUpdatedAt={data?.updated_at || null}
        />
      </main>
    </>
  );
}
