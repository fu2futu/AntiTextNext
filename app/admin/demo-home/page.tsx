import Link from "next/link";
import { AdminPageHeader } from "../_components/admin-shell";
import { getStringParam, requireAdmin, type AdminSearchParams } from "@/lib/admin-utils";
import HomeClient from "@/app/home-client";
import type { HomeItem } from "@/components/home-item-card";

export const dynamic = "force-dynamic";

const departments = ["理学院", "工学院", "物質理工学院", "情報理工学院", "生命理工学院", "環境・社会理工学院"];
const previewSizes: Record<string, { label: string; className: string }> = {
  iphone: { label: "iPhone", className: "max-w-[390px]" },
  ipad: { label: "iPad", className: "max-w-[820px]" },
  pc: { label: "PC", className: "max-w-[1180px]" },
  full: { label: "Full", className: "max-w-none" },
};

const itemSelect =
  "id,title,selling_price,status,seller_id,front_image_url,front_thumbnail_url,front_image_storage_path,front_thumbnail_storage_path,image_storage_provider,created_at,favorites(count),profiles!inner(user_id,nickname,department,major)";

export default async function AdminDemoHomePage({ searchParams }: { searchParams: AdminSearchParams }) {
  const { supabase } = await requireAdmin();
  const department = getStringParam(searchParams, "department") || "工学院";
  const preview = previewSizes[getStringParam(searchParams, "preview")] ? getStringParam(searchParams, "preview") : "iphone";
  const viewMode = getStringParam(searchParams, "view") || "all";
  const selectedSize = previewSizes[preview] ?? previewSizes.iphone;

  const baseQuery = (supabase as any)
    .from("items")
    .select(itemSelect, { count: "exact" })
    .eq("is_demo", true)
    .in("status", ["available", "trading", "sold", "paused"]);

  const [{ data: recommendedData }, { data: allData, count }] = await Promise.all([
    (supabase as any)
      .from("items")
      .select(itemSelect, { count: "exact" })
      .eq("is_demo", true)
      .in("status", ["available", "trading"])
      .eq("profiles.department", department)
      .order("created_at", { ascending: false })
      .limit(12),
    baseQuery.order("created_at", { ascending: false }).limit(48),
  ]);

  const recommendedItems = mapItems(recommendedData);
  const recommendedIds = new Set(recommendedItems.map((item) => item.id));
  const allItems = mapItems(allData);
  const popularItems = allItems.filter((item) => !recommendedIds.has(item.id));
  const visibleRecommended = viewMode === "popular" ? [] : recommendedItems;
  const visiblePopular = viewMode === "recommended" ? [] : popularItems;

  const makeHref = (next: Record<string, string>) => {
    const params = new URLSearchParams({
      department,
      preview,
      view: viewMode,
      ...next,
    });
    return `/admin/demo-home?${params.toString()}`;
  };

  return (
    <>
      <AdminPageHeader
        title="スクショ・デモ用ホーム"
        description="is_demo=true の架空教材だけを、通常ホームに近いカードUIで表示します。通常ホーム・検索には表示されません。"
      />
      <main className="space-y-5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/demo-items/new" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-black text-white">
              デモ出品を追加
            </Link>
            <Link href="/admin/home-preview" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-700">
              既存Simulationへ
            </Link>
          </div>
          <p className="text-xs font-bold text-slate-500">デモ出品 {count ?? 0}件</p>
        </div>

        <form className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[180px_1fr_1fr_auto]">
          <label className="grid gap-1">
            <span className="text-xs font-black text-slate-500">学院</span>
            <select name="department" defaultValue={department} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold">
              {departments.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-black text-slate-500">プレビュー幅</span>
            <select name="preview" defaultValue={preview} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold">
              {Object.entries(previewSizes).map(([value, config]) => (
                <option key={value} value={value}>{config.label}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-black text-slate-500">表示</span>
            <select name="view" defaultValue={viewMode} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold">
              <option value="all">おすすめ + みんなの出品</option>
              <option value="recommended">おすすめのみ</option>
              <option value="popular">みんなの出品のみ</option>
            </select>
          </label>
          <button className="self-end rounded-xl bg-slate-900 px-5 py-3 text-sm font-black text-white">表示</button>
        </form>

        <div className="flex flex-wrap gap-2">
          {Object.entries(previewSizes).map(([value, config]) => (
            <Link
              key={value}
              href={makeHref({ preview: value })}
              className={`rounded-full px-3 py-1.5 text-xs font-black ${preview === value ? "bg-primary text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}
            >
              {config.label}
            </Link>
          ))}
        </div>

        <section className={`mx-auto overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl ${selectedSize.className}`}>
          <div className="max-h-[82vh] overflow-y-auto bg-white">
            <HomeClient
              items={visibleRecommended}
              popularItems={visiblePopular}
              totalPopularCount={visiblePopular.length}
              demoPreview
              demoItemHrefPrefix="/admin/demo-items"
            />
          </div>
        </section>
      </main>
    </>
  );
}

function mapItems(data: any[] | null): HomeItem[] {
  return (data ?? []).map((item) => ({
    ...item,
    favorite_count: item.favorites?.[0]?.count || 0,
    favorites: undefined,
    profiles: undefined,
  }));
}
