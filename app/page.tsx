import { supabase } from "@/lib/supabase";
import HomeClient from "./home-client";

const HOME_ITEM_PAGE_SIZE = 7;

// Phase 2: 適切なキャッシュ戦略
// 30秒ごとに再検証することで、パフォーマンスを維持しつつ削除反映を早める
// クライアント側でも useEffect で最新データを取得するため、実質的にはより早く反映される
export const revalidate = 30;

export default async function HomePage() {
  // みんなの出品（新着順 上位7件）
  const { data: popularData, error: popularError } = await supabase
    .from("items")
    .select("id, title, selling_price, status, front_image_url, front_thumbnail_url, front_image_storage_path, front_thumbnail_storage_path, image_storage_provider, seller_id, favorites(count)")
    .in("status", ["available", "trading"])
    .order("created_at", { ascending: false })
    .range(0, HOME_ITEM_PAGE_SIZE - 1);

  // 出品物の総数を取得
  const { count: totalCount } = await supabase
    .from("items")
    .select("*", { count: "exact", head: true })
    .in("status", ["available", "trading"]);

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
    />
  );
}
