import Link from "next/link";
import { AdminPageHeader } from "../../_components/admin-shell";
import { requireAdmin } from "@/lib/admin-utils";
import DemoItemForm from "./demo-item-form";

export const dynamic = "force-dynamic";

export default async function NewDemoItemPage() {
  await requireAdmin();

  return (
    <>
      <AdminPageHeader
        title="デモ出品を作成"
        description="App Storeスクショや取引フロー検証用の架空教材を作成します。通常ホーム・通常検索には表示されません。"
      />
      <main className="space-y-5 p-6">
        <Link href="/admin/demo-home" className="inline-flex rounded-xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-700 hover:border-slate-300">
          デモホームへ戻る
        </Link>
        <DemoItemForm />
      </main>
    </>
  );
}
