import { createSupabaseServerClient } from "@/lib/supabase-server";
import HomeClient from "./home-client";

const HOME_ITEM_PAGE_SIZE = 7;

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  let isAppReviewDemo = false;
  if (session?.user) {
    const { data: profile } = await (supabase.from("profiles") as any)
      .select("is_app_review_demo")
      .eq("user_id", session.user.id)
      .maybeSingle();
    isAppReviewDemo = Boolean(profile?.is_app_review_demo);
  }

  const demoFilter = isAppReviewDemo;

  // みんなの出品（新着順 上位7件）
  const { data: popularData, error: popularError } = await supabase
    .from("items")
    .select("id, title, selling_price, status, front_image_url, front_thumbnail_url, front_image_storage_path, front_thumbnail_storage_path, image_storage_provider, seller_id, favorites(count)")
    .in("status", ["available", "trading"])
    .eq("is_demo", demoFilter)
    .order("created_at", { ascending: false })
    .range(0, HOME_ITEM_PAGE_SIZE - 1);

  // 出品物の総数を取得
  const { count: totalCount } = await supabase
    .from("items")
    .select("*", { count: "exact", head: true })
    .in("status", ["available", "trading"])
    .eq("is_demo", demoFilter);

  if (popularError) {
    console.error("Error loading popular items:", popularError);
  }

  const mapItems = (data: any[] | null) => {
    return (data || []).map(item => ({
      ...item,
      favorite_count: item.favorites?.[0]?.count || 0,
      favorites: undefined // Clean up the object
    }));
  };

  return (
    <HomeClient 
      items={[]} 
      popularItems={mapItems(popularData)}
      totalPopularCount={totalCount || 0}
      appReviewDemo={isAppReviewDemo}
    />
  );
}
