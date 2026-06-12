import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import ProductDetailClient, { Item } from "./client";
import { resolveEarlyRegistrationEligible } from "@/lib/rewards";

export const dynamic = "force-dynamic";

export default async function ProductDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;

  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    let isAppReviewDemo = false;
    if (session?.user) {
      const { data: viewerProfile } = await (supabase.from("profiles") as any)
        .select("is_app_review_demo")
        .eq("user_id", session.user.id)
        .maybeSingle();
      isAppReviewDemo = Boolean(viewerProfile?.is_app_review_demo);
    }

    // 2. Fetch profile
    // Attempt to join first (Optimized path)
    let fullItem: Item | null = null;
    
    const itemFields = "id, title, description, selling_price, original_price, status, front_image_url, back_image_url, front_thumbnail_url, back_thumbnail_url, front_image_storage_path, back_image_storage_path, front_thumbnail_storage_path, back_thumbnail_storage_path, image_storage_provider, created_at, seller_id, is_demo";

    // 1. Fetch item and profile
    let itemQuery = supabase
      .from("items")
      .select(`${itemFields}, profiles!items_seller_id_fkey_profiles(nickname, avatar_url, department, major, degree, grade, created_at)`)
      .eq("id", id);

    if (!isAppReviewDemo) {
      itemQuery = itemQuery.eq("is_demo", false);
    }

    const { data: itemData, error: itemError } = await itemQuery.single();

    if (itemError || !itemData) {
      console.error("Error loading item:", itemError);
      return <ErrorDisplay message={itemError ? "商品の読み込みに失敗しました" : "商品が見つかりませんでした"} />;
    }

    if ((itemData as any).status === "deleted") {
      return <ErrorDisplay message="商品が見つかりませんでした" />;
    }

    const sellerId = (itemData as any).seller_id;

    const [
      { data: ratingsData },
      { count: sellerListingCount },
      { count: sellerTransactionCount },
      { data: rewardSetting },
      { data: sellerBadges },
      { data: sellerRewardOverride },
    ] = await Promise.all([
      supabase.from("ratings").select("score").eq("rated_id", sellerId).eq("is_demo", false),
      supabase.from("items").select("*", { count: "exact", head: true }).eq("seller_id", sellerId).neq("status", "deleted").eq("is_demo", false),
      supabase.from("transactions").select("*", { count: "exact", head: true }).eq("seller_id", sellerId).eq("status", "completed"),
      (supabase as any).from("reward_settings").select("*").eq("id", "early_registration").single(),
      (supabase as any).from("user_badges").select("id,badge_type,badge_color,label,note").eq("user_id", sellerId).is("revoked_at", null).order("created_at", { ascending: false }),
      (supabase as any).from("user_reward_overrides").select("early_registration_override").eq("user_id", sellerId).maybeSingle(),
    ]);

    const scores = (ratingsData as any[] || []).map(r => r.score);
    const ratingCount = scores.length;
    const averageRating = ratingCount > 0 ? scores.reduce((a, b) => a + b, 0) / ratingCount : 0;

    const profile = (itemData as any).profiles;
    let avatarUrl = profile?.avatar_url;
    if (avatarUrl && !avatarUrl.startsWith('http')) {
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(avatarUrl);
      avatarUrl = publicUrl;
    }

    fullItem = { 
      ...(itemData as any), 
      seller_nickname: profile?.nickname || "匿名",
      seller_avatar_url: avatarUrl,
      seller_department: profile?.department,
      seller_major: profile?.major,
      seller_rating: averageRating,
      seller_rating_count: ratingCount,
      seller_listing_count: sellerListingCount ?? 0,
      seller_transaction_count: sellerTransactionCount ?? 0,
      seller_early_registration: resolveEarlyRegistrationEligible(profile?.created_at, rewardSetting as any, sellerRewardOverride as any),
      seller_badges: sellerBadges ?? []
    };

    return <ProductDetailClient item={fullItem as any} isAppReviewDemo={isAppReviewDemo} />;

  } catch (err) {
    console.error("Error in ProductDetailPage:", err);
    return <ErrorDisplay message="予期せぬエラーが発生しました" />;
  }
}

function ErrorDisplay({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-center">
        <p className="text-gray-600 mb-4">{message}</p>
        <Link href="/" className="text-primary hover:underline">
          ホームに戻る
        </Link>
      </div>
    </div>
  );
}
