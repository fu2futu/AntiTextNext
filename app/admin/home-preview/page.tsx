import Image from "next/image";
import Link from "next/link";
import { AdminPageHeader } from "../_components/admin-shell";
import { AdminUserLink } from "../_components/admin-user-link";
import { getStringParam, requireAdmin, type AdminSearchParams } from "@/lib/admin-utils";
import { getItemImageUrl } from "@/lib/image-storage";

export const dynamic = "force-dynamic";

const departments = ["理学院", "工学院", "物質理工学院", "情報理工学院", "生命理工学院", "環境・社会理工学院"];
const majorsByDepartment: Record<string, string[]> = {
  "理学院": ["数学系", "物理学系", "化学系", "地球惑星科学系"],
  "工学院": ["機械系", "システム制御系", "電気電子系", "情報通信系", "経営工学系"],
  "物質理工学院": ["材料系", "応用化学系", "応用科学系"],
  "情報理工学院": ["数理・計算科学系", "情報工学系"],
  "生命理工学院": ["生命理工学系", "生命理工系"],
  "環境・社会理工学院": ["建築学系", "土木・環境工学系", "融合理工学系"],
};

const itemSelect =
  "id,title,selling_price,status,seller_id,front_image_url,front_thumbnail_url,front_image_storage_path,front_thumbnail_storage_path,image_storage_provider,created_at,favorites(count),profiles!inner(user_id,nickname,department,major)";

export default async function AdminHomePreviewPage({ searchParams }: { searchParams: AdminSearchParams }) {
  const { supabase } = await requireAdmin();
  const department = getStringParam(searchParams, "department") || "工学院";
  const major = getStringParam(searchParams, "major");
  const excludedSellerId = getStringParam(searchParams, "excludedSellerId");
  const limit = 15;

  let recommendedQuery = (supabase as any)
    .from("items")
    .select(itemSelect, { count: "exact" })
    .in("status", ["available", "trading"])
    .eq("is_demo", false)
    .eq("profiles.department", department);

  if (major) recommendedQuery = recommendedQuery.eq("profiles.major", major);
  if (excludedSellerId) recommendedQuery = recommendedQuery.neq("seller_id", excludedSellerId);

  let popularQuery = (supabase as any)
    .from("items")
    .select(itemSelect, { count: "exact" })
    .in("status", ["available", "trading"])
    .eq("is_demo", false);

  if (excludedSellerId) popularQuery = popularQuery.neq("seller_id", excludedSellerId);

  const [
    { data: recommendedData, count: recommendedCount, error: recommendedError },
    { data: popularData, count: popularCount, error: popularError },
  ] = await Promise.all([
    recommendedQuery.order("created_at", { ascending: false }).limit(limit),
    popularQuery.order("created_at", { ascending: false }).limit(limit),
  ]);

  const recommendedItems = mapItems(recommendedData);
  const recommendedIds = new Set(recommendedItems.map((item) => item.id));
  const popularItems = mapItems(popularData).filter((item) => !recommendedIds.has(item.id));

  const currentMajors = majorsByDepartment[department] ?? [];

  return (
    <>
      <AdminPageHeader
        title="ホームSimulation"
        description="仮想ユーザーから見たホームの「おすすめ」と「みんなの出品」を確認します。仮想ユーザーは取引当事者ではなく、出品を一つもしていない前提です。"
      />
      <main className="space-y-6 p-6">
        <form className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[220px_220px_1fr_auto]">
          <label className="grid gap-1">
            <span className="text-xs font-black text-slate-500">学院</span>
            <select name="department" defaultValue={department} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold">
              {departments.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-black text-slate-500">系</span>
            <select name="major" defaultValue={major} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold">
              <option value="">系は指定しない</option>
              {currentMajors.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-black text-slate-500">除外する出品者ID</span>
            <input
              name="excludedSellerId"
              defaultValue={excludedSellerId}
              placeholder="出品者本人視点を見たい場合、そのユーザーIDを入力"
              className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold"
            />
          </label>
          <button className="self-end rounded-xl bg-slate-900 px-5 py-3 text-sm font-black text-white">表示</button>
        </form>

        <section className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm font-bold leading-relaxed text-blue-800">
          <p>現在の条件: {department}{major ? ` / ${major}` : " / 系指定なし"} / 出品者除外: {excludedSellerId || "なし"}</p>
          <p className="mt-1 text-xs text-blue-700">
            一般ホームと同じく `available / trading` を表示します。仮想ユーザーは取引当事者ではない前提のため、取引中の商品も「取引中」として確認できます。
          </p>
        </section>

        {(recommendedError || popularError) && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            {recommendedError?.message || popularError?.message}
          </div>
        )}

        <PreviewSection
          title="おすすめの教材"
          meta={`${recommendedItems.length}件表示 / 該当 ${recommendedCount ?? 0}件`}
          emptyText="この条件に合うおすすめ出品はありません。"
          items={recommendedItems}
        />

        <PreviewSection
          title="みんなの出品"
          meta={`${popularItems.length}件表示 / 該当 ${popularCount ?? 0}件`}
          emptyText="みんなの出品に表示される出品はありません。"
          items={popularItems}
        />
      </main>
    </>
  );
}

function mapItems(data: any[] | null) {
  return (data ?? []).map((item) => ({
    ...item,
    favorite_count: item.favorites?.[0]?.count || 0,
    seller_profile: Array.isArray(item.profiles) ? item.profiles[0] : item.profiles,
    favorites: undefined,
    profiles: undefined,
  }));
}

function PreviewSection({ title, meta, emptyText, items }: { title: string; meta: string; emptyText: string; items: any[] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-900">{title}</h2>
          <p className="mt-1 text-xs font-bold text-slate-500">{meta}</p>
        </div>
      </div>
      {items.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item, index) => (
            <HomePreviewCard key={item.id} item={item} index={index + 1} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm font-bold text-slate-500">
          {emptyText}
        </div>
      )}
    </section>
  );
}

function HomePreviewCard({ item, index }: { item: any; index: number }) {
  const imageUrl = getItemImageUrl(item, "front", "thumbnail");
  const profile = item.seller_profile;
  const isTrading = item.status === "trading" || item.status === "transaction_pending";

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${isTrading ? "border-slate-300 bg-slate-100" : "border-slate-200 bg-white"}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-500">#{index}</span>
        <Link href={`/admin/items/${item.id}`} className="text-xs font-black text-primary hover:underline">出品詳細</Link>
      </div>
      <div className="flex gap-4">
        <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl bg-slate-100">
          {imageUrl ? <Image src={imageUrl} alt="" width={80} height={80} className={`h-full w-full object-cover ${isTrading ? "grayscale" : ""}`} /> : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <p className={`line-clamp-2 text-sm font-black ${isTrading ? "text-slate-600" : "text-slate-900"}`}>{item.title}</p>
            {isTrading && (
              <span className="shrink-0 rounded-full bg-slate-700 px-2 py-0.5 text-[10px] font-black text-white">取引中</span>
            )}
          </div>
          <p className={`mt-1 text-lg font-black ${isTrading ? "text-slate-500" : "text-primary"}`}>¥{Number(item.selling_price ?? 0).toLocaleString()}</p>
          <p className="mt-1 text-xs font-bold text-slate-500">お気に入り {item.favorite_count ?? 0}</p>
        </div>
      </div>
      <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2">
        <p className="text-xs font-bold text-slate-500">
          出品者: <AdminUserLink id={item.seller_id} name={profile?.nickname} />
        </p>
        <p className="mt-1 text-xs font-bold text-slate-500">
          所属: {[profile?.department, profile?.major].filter(Boolean).join(" / ") || "-"}
        </p>
      </div>
    </div>
  );
}
