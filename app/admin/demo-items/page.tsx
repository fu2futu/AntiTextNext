import Image from "next/image";
import Link from "next/link";
import { AdminPageHeader, StatusBadge } from "../_components/admin-shell";
import { formatAdminDate, requireAdmin } from "@/lib/admin-utils";
import { getItemImageUrl } from "@/lib/image-storage";
import DemoItemsActions from "./demo-items-actions";

export const dynamic = "force-dynamic";

export default async function AdminDemoItemsPage() {
  const { supabase } = await requireAdmin();
  const { data, error } = await (supabase as any)
    .from("items")
    .select("id,title,status,selling_price,created_at,demo_purpose,front_image_url,front_thumbnail_url,front_image_storage_path,front_thumbnail_storage_path,image_storage_provider,transactions(id)")
    .eq("is_demo", true)
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = (data ?? []) as any[];

  return (
    <>
      <AdminPageHeader
        title="デモ出品管理"
        description="スクショ・取引検証用の is_demo=true 出品だけを管理します。通常出品は表示・削除対象にしません。"
      />
      <main className="space-y-5 p-6">
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/demo-items/new" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-black text-white">
            デモ出品を追加
          </Link>
          <Link href="/admin/demo-home" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-700">
            デモホームを見る
          </Link>
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error.message}</div>}
        {rows.length > 0 && <DemoItemsActions itemIds={rows.map((item) => item.id)} />}

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">画像</th>
                <th className="px-4 py-3">タイトル</th>
                <th className="px-4 py-3">価格</th>
                <th className="px-4 py-3">状態</th>
                <th className="px-4 py-3">用途</th>
                <th className="px-4 py-3">関連取引</th>
                <th className="px-4 py-3">作成日時</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Thumb src={getItemImageUrl(item, "front", "thumbnail")} />
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-black text-slate-900">{item.title}</p>
                    <p className="mt-1 font-mono text-[11px] text-slate-400">{item.id}</p>
                  </td>
                  <td className="px-4 py-3 font-black text-primary">¥{Number(item.selling_price ?? 0).toLocaleString()}</td>
                  <td className="px-4 py-3"><StatusBadge value={item.status} /></td>
                  <td className="px-4 py-3 font-bold text-slate-600">{item.demo_purpose || "-"}</td>
                  <td className="px-4 py-3 font-bold text-slate-600">{item.transactions?.length ?? 0}</td>
                  <td className="px-4 py-3 font-bold text-slate-600">{formatAdminDate(item.created_at)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm font-bold text-slate-500">
                    デモ出品はまだありません。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}

function Thumb({ src }: { src?: string | null }) {
  if (!src) return <div className="h-14 w-10 rounded-lg bg-slate-100" />;
  return <Image src={src} alt="" width={40} height={56} className="h-14 w-10 rounded-lg object-cover" />;
}
