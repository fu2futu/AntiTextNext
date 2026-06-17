import MypageClient from "./client";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { resolveEarlyRegistrationEligible } from "@/lib/rewards";

export const dynamic = "force-dynamic";

const ITEM_COLUMNS =
    "id,title,selling_price,status,is_demo,front_image_url,front_thumbnail_url,front_image_storage_path,front_thumbnail_storage_path,image_storage_provider";

const TERMINAL_STATUSES = new Set([
    "completed",
    "cancelled",
    "rejected",
    "declined",
    "expired",
    "auto_closed",
]);

const EMPTY_PROPS = {
    initialProfile: null,
    initialListingItems: [],
    initialPastItems: [],
    initialFavoriteItems: [],
    averageRating: 0,
    listingCount: 0,
    transactionCount: 0,
    earlyRegistrationEligible: false,
    badges: [],
    isAdmin: false,
};

export default async function Mypage() {
    const supabase = createSupabaseServerClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    // 未ログイン時はクライアント側で /auth/login にリダイレクトさせる
    if (!user) {
        return <MypageClient {...EMPTY_PROPS} />;
    }

    try {
        const [
            { data: profileData },
            { data: ratingsData },
            { data: favoritesData },
            { data: sellerItems },
            { data: sellerTransactions },
            { data: buyerTransactions },
            { data: rewardSetting },
            { data: userBadges },
            { data: rewardOverride },
            { data: adminStatus },
        ] = await Promise.all([
            supabase.from("profiles").select("user_id,nickname,department,avatar_url,created_at,is_app_review_demo").eq("user_id", user.id).single(),
            supabase.from("ratings").select("score").eq("rated_id", user.id).eq("is_demo", false),
            supabase.from("favorites").select("item_id, items(id,title,selling_price,status,is_demo,front_image_url,front_thumbnail_url,front_image_storage_path,front_thumbnail_storage_path,image_storage_provider)").eq("user_id", user.id),
            supabase.from("items").select(ITEM_COLUMNS).eq("seller_id", user.id).eq("is_demo", false),
            supabase.from("transactions").select("id, item_id, status").eq("seller_id", user.id),
            supabase
                .from("transactions")
                .select("id, item_id, status, items(id,title,selling_price,status,front_image_url,front_thumbnail_url,front_image_storage_path,front_thumbnail_storage_path,image_storage_provider)")
                .eq("buyer_id", user.id),
            (supabase as any).from("reward_settings").select("*").eq("id", "early_registration").single(),
            (supabase as any).from("user_badges").select("id,badge_type,badge_color,label,note").eq("user_id", user.id).is("revoked_at", null).order("created_at", { ascending: false }),
            (supabase as any).from("user_reward_overrides").select("early_registration_override").eq("user_id", user.id).maybeSingle(),
            supabase.rpc("is_current_user_admin" as any),
        ]);

        const profileRecord = profileData as any;
        const isAppReviewDemo = Boolean(profileRecord?.is_app_review_demo);

        let effectiveSellerItems = (sellerItems || []) as any[];
        if (isAppReviewDemo) {
            const { data: demoSellerItems } = await supabase
                .from("items")
                .select(ITEM_COLUMNS)
                .eq("seller_id", user.id)
                .eq("is_demo", true);
            effectiveSellerItems = (demoSellerItems || []) as any[];
        }

        const scores = (ratingsData || []).map((rating: any) => rating.score);
        const averageRating = scores.length > 0
            ? scores.reduce((sum: number, score: number) => sum + score, 0) / scores.length
            : 0;

        const txItemIds = new Set(((sellerTransactions || []) as any[]).map((tx) => tx.item_id));
        const listingCount = effectiveSellerItems.filter((item: any) => item.status !== "deleted").length;
        const listingItems = effectiveSellerItems.filter((item: any) => item.status === "available" && !txItemIds.has(item.id));

        const sellerTerminalTransactions = ((sellerTransactions || []) as any[]).filter((tx) => TERMINAL_STATUSES.has(tx.status));
        const sellerTerminalTxByItemId = new Map(sellerTerminalTransactions.map((tx) => [tx.item_id, tx]));
        const sellerPastItems = effectiveSellerItems
            .filter((item: any) => item.status === "sold" || sellerTerminalTxByItemId.has(item.id))
            .map((item: any) => {
                const tx = sellerTerminalTxByItemId.get(item.id);
                return tx ? { ...item, transaction_id: tx.id, transaction_status: tx.status } : item;
            });
        const buyerPastItems = ((buyerTransactions || []) as any[])
            .filter((tx) => TERMINAL_STATUSES.has(tx.status) || tx.items?.status === "sold")
            .map((tx) => (tx.items ? { ...tx.items, transaction_id: tx.id, transaction_status: tx.status } : null))
            .filter(Boolean);
        const pastItems = Array.from(
            new Map([...sellerPastItems, ...buyerPastItems].map((item: any) => [item.transaction_id || item.id, item])).values()
        );

        const favoriteItems = ((favoritesData || []) as any[])
            .map((f) => f.items)
            .filter((item: any) => item && item.is_demo !== true && ["available", "trading", "transaction_pending"].includes(item.status));

        return (
            <MypageClient
                initialProfile={profileRecord ?? null}
                initialListingItems={listingItems as any}
                initialPastItems={pastItems as any}
                initialFavoriteItems={favoriteItems as any}
                averageRating={averageRating}
                listingCount={listingCount}
                transactionCount={pastItems.length}
                earlyRegistrationEligible={resolveEarlyRegistrationEligible(profileRecord?.created_at, rewardSetting as any, rewardOverride as any)}
                badges={(userBadges ?? []) as any}
                isAdmin={Boolean(adminStatus)}
            />
        );
    } catch (err) {
        console.error("Error loading profile data (SSR):", err);
        return <MypageClient {...EMPTY_PROPS} />;
    }
}
