import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import MypageClient from "./client";
import { isCurrentUserAdmin } from "@/lib/admin";
import { resolveEarlyRegistrationEligible } from "@/lib/rewards";

export const dynamic = "force-dynamic";

export default async function Mypage() {
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                get(name: string) {
                    return cookies().get(name)?.value;
                },
                set(name: string, value: string, options: any) {
                    try {
                        cookies().set({ name, value, ...options });
                    } catch (error) {
                    }
                },
                remove(name: string, options: any) {
                    try {
                        cookies().set({ name, value: "", ...options });
                    } catch (error) {
                    }
                },
            },
        }
    );

    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
        return <MypageClient initialProfile={null} initialListingItems={[]} initialPastItems={[]} initialFavoriteItems={[]} averageRating={0} listingCount={0} transactionCount={0} earlyRegistrationEligible={false} badges={[]} isAdmin={false} />;
    }

    const userId = session.user.id;
    const isAdmin = await isCurrentUserAdmin(supabase as any);

    // Fetch data in parallel
    const [
        { data: profile },
        { data: ratingsData },
        { data: favoritesData },
        { data: sellerItems },
        { data: sellerTransactions },
        { data: buyerTransactions },
        { data: rewardSetting },
        { data: badges },
        { data: rewardOverride }
    ] = await Promise.all([
        supabase.from("profiles").select("user_id,nickname,department,avatar_url,created_at").eq("user_id", userId).single(),
        supabase.from("ratings").select("score").eq("rated_id", userId).eq("is_demo", false),
        supabase.from("favorites").select("item_id, items(id,title,selling_price,status,is_demo,front_image_url,front_thumbnail_url,front_image_storage_path,front_thumbnail_storage_path,image_storage_provider)").eq("user_id", userId),
        supabase.from("items").select("id,title,selling_price,status,front_image_url,front_thumbnail_url,front_image_storage_path,front_thumbnail_storage_path,image_storage_provider").eq("seller_id", userId).eq("is_demo", false),
        supabase.from("transactions").select("id, item_id, status").eq("seller_id", userId),
        supabase
            .from("transactions")
            .select("id, item_id, status, items(id,title,selling_price,status,front_image_url,front_thumbnail_url,front_image_storage_path,front_thumbnail_storage_path,image_storage_provider)")
            .eq("buyer_id", userId),
        (supabase as any).from("reward_settings").select("*").eq("id", "early_registration").single(),
        (supabase as any).from("user_badges").select("id,badge_type,badge_color,label,note").eq("user_id", userId).is("revoked_at", null).order("created_at", { ascending: false }),
        (supabase as any).from("user_reward_overrides").select("early_registration_override").eq("user_id", userId).maybeSingle()
    ]);

    // Calculate average rating
    const scores = (ratingsData || []).map(r => r.score);
    const ratingCount = scores.length;
    const averageRating = ratingCount > 0 ? scores.reduce((a, b) => a + b, 0) / ratingCount : 0;

    // Filter listing items: available status AND no transactions
    const txItemIds = new Set((sellerTransactions || []).map(tx => tx.item_id));
    const cumulativeListingCount = (sellerItems || []).filter(item => item.status !== 'deleted').length;
    const listingItems = (sellerItems || []).filter(item => item.status === 'available' && !txItemIds.has(item.id));

    // Filter past items: terminal transaction history. Keep transaction_id so the detail page can open the archived chat.
    const terminalStatuses = new Set(['completed', 'cancelled', 'rejected', 'declined', 'expired', 'auto_closed']);
    const sellerTerminalTransactions = (sellerTransactions || []).filter(tx => terminalStatuses.has(tx.status));
    const sellerTerminalTxByItemId = new Map(sellerTerminalTransactions.map(tx => [tx.item_id, tx]));
    const sellerPastItems = (sellerItems || [])
        .filter(item => item.status === 'sold' || sellerTerminalTxByItemId.has(item.id))
        .map((item: any) => {
            const tx = sellerTerminalTxByItemId.get(item.id);
            return tx ? { ...item, transaction_id: tx.id, transaction_status: tx.status } : item;
        });
    const buyerPastItems = ((buyerTransactions || []) as any[])
        .filter(tx => terminalStatuses.has(tx.status) || tx.items?.status === 'sold')
        .map(tx => tx.items ? { ...tx.items, transaction_id: tx.id, transaction_status: tx.status } : null)
        .filter(Boolean);
    const pastItems = Array.from(
        new Map([...sellerPastItems, ...buyerPastItems].map((item: any) => [item.transaction_id || item.id, item])).values()
    );

    // Extract favorite items
    const favoriteItems = (favoritesData || [])
        .map(f => f.items)
        .filter((item: any) => item && item.is_demo !== true && ["available", "trading", "transaction_pending"].includes(item.status));

    return (
        <MypageClient 
            initialProfile={profile as any}
            initialListingItems={listingItems as any[]}
            initialPastItems={pastItems as any[]}
            initialFavoriteItems={favoriteItems as any[]}
            averageRating={averageRating}
            listingCount={cumulativeListingCount}
            transactionCount={pastItems.length}
            earlyRegistrationEligible={resolveEarlyRegistrationEligible((profile as any)?.created_at, rewardSetting as any, rewardOverride as any)}
            badges={(badges ?? []) as any[]}
            isAdmin={isAdmin}
        />
    );
}
