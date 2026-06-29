import Image from "next/image";
import Link from "next/link";
import { AdminPageHeader, StatusBadge } from "../_components/admin-shell";
import { AdminUserLink } from "../_components/admin-user-link";
import { formatAdminDate, getStringParam, requireAdmin, type AdminSearchParams } from "@/lib/admin-utils";
import ItemsListClient from "./items-list-client";

export const dynamic = "force-dynamic";

export default async function AdminItemsPage({ searchParams }: { searchParams: AdminSearchParams }) {
  const { supabase } = await requireAdmin();
  const q = getStringParam(searchParams, "q");
  const status = getStringParam(searchParams, "status");
  let query = (supabase as any)
    .from("items")
    .select("id, title, is_demo, front_image_url, back_image_url, front_thumbnail_url, back_thumbnail_url, front_image_storage_path, back_image_storage_path, front_thumbnail_storage_path, back_thumbnail_storage_path, image_storage_provider, seller_id, created_at, status, transactions(id,status)");

  if (q) query = query.ilike("title", `%${q}%`);
  if (status) query = query.eq("status", status);

  const { data, error } = await query.order("created_at", { ascending: false }).limit(200);
  const itemIds = ((data ?? []) as any[]).map((item) => item.id);
  const sellerIds = Array.from(new Set(((data ?? []) as any[]).map((item) => item.seller_id).filter(Boolean)));
  const { data: reports } = itemIds.length
    ? await (supabase as any).from("reports").select("item_id").in("item_id", itemIds)
    : { data: [] };
  const { data: profiles } = sellerIds.length
    ? await supabase.from("profiles").select("user_id,nickname").in("user_id", sellerIds)
    : { data: [] };
  const reportedIds = new Set(((reports ?? []) as any[]).map((report) => report.item_id));
  const profileMap = new Map(((profiles ?? []) as any[]).map((profile) => [profile.user_id, profile.nickname]));

  return (
    <>
      <AdminPageHeader title="出品管理" description="非公開・削除などの危険操作はログ記録 API を通して実装する前提で、まず監視用一覧を提供します。" />
      <main className="space-y-5 p-6">
        <form className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[1fr_180px_auto]">
          <input name="q" defaultValue={q} placeholder="出品タイトルで検索" className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold" />
          <select name="status" defaultValue={status} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold">
            <option value="">すべて</option>
            <option value="available">出品中</option>
            <option value="trading">取引中</option>
            <option value="sold">完了</option>
          </select>
          <button className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-black text-white">検索</button>
        </form>
        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error.message}</div>}
        <ItemsListClient 
          items={data ?? []} 
          reportedIds={Array.from(reportedIds)} 
          profileMap={Object.fromEntries(profileMap)} 
        />
      </main>
    </>
  );
}
