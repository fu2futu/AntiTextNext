import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { sendTransactionReminderEmail, sendTransactionProgressEmail } from "@/lib/email";
import { sendWebPushToUser } from "@/lib/web-push";

// Vercel Cronなどで呼び出す場合は、Authorizationヘッダーで保護する
// Supabase pg_cronから呼び出す場合は、HTTPリクエストでシークレットを渡す
export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get("Authorization");
        const secret = process.env.CRON_SECRET;
        if (secret && authHeader !== `Bearer ${secret}`) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // サービスロールキーを使用してSupabaseクライアントを作成（RLSをバイパスして全データを取得）
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const results = {
            remindersSent: 0,
            expiredRequests: 0,
            errors: [] as string[],
        };

        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

        // 1. 明日のリマインド通知
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowMonth = tomorrow.getMonth() + 1;
        const tomorrowDate = tomorrow.getDate();
        const tomorrowPrefix = `${tomorrowMonth}/${tomorrowDate}(`; // 例: "5/14("

        const { data: upcomingTxs, error: upcomingError } = await supabase
            .from("transactions")
            .select("*, items(title), buyer:profiles!transactions_buyer_id_fkey(user_id, nickname, email_notify_reminders, locale), seller:profiles!transactions_seller_id_fkey(user_id, nickname, email_notify_reminders, locale)")
            .eq("status", "scheduled")
            .like("final_meetup_time", `${tomorrowPrefix}%`);

        if (upcomingError) {
            results.errors.push(`Fetch upcoming error: ${upcomingError.message}`);
        } else if (upcomingTxs && upcomingTxs.length > 0) {
            for (const tx of upcomingTxs) {
                const itemTitle = tx.items?.title || "商品";
                const chatUrl = `${baseUrl}/chat/${tx.item_id}?tx=${tx.id}`;

                // Buyerへ通知
                await sendWebPushToUser(tx.buyer_id, {
                    title: "明日の受け渡し予定",
                    body: `「${itemTitle}」の受け渡し予定があります。時間と場所を確認してください。`,
                    url: chatUrl,
                });
                if (tx.buyer?.email_notify_reminders) {
                    const { data: buyerEmail } = await supabase.rpc("admin_get_user_email", { target_user_id: tx.buyer_id, reason: "前日リマインド" });
                    if (buyerEmail) {
                        await sendTransactionReminderEmail(buyerEmail, tx.seller?.nickname || "出品者", itemTitle, tx.final_meetup_time, tx.final_meetup_location || "未設定", chatUrl, tx.buyer.locale || "ja");
                        results.remindersSent++;
                    }
                }

                // Sellerへ通知
                await sendWebPushToUser(tx.seller_id, {
                    title: "明日の受け渡し予定",
                    body: `「${itemTitle}」の受け渡し予定があります。時間と場所を確認してください。`,
                    url: chatUrl,
                });
                if (tx.seller?.email_notify_reminders) {
                    const { data: sellerEmail } = await supabase.rpc("admin_get_user_email", { target_user_id: tx.seller_id, reason: "前日リマインド" });
                    if (sellerEmail) {
                        await sendTransactionReminderEmail(sellerEmail, tx.buyer?.nickname || "購入希望者", itemTitle, tx.final_meetup_time, tx.final_meetup_location || "未設定", chatUrl, tx.seller.locale || "ja");
                        results.remindersSent++;
                    }
                }
            }
        }

        // 2. 1週間放置された「承認待ち」リクエストの期限切れ処理
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        
        const { data: oldPendingTxs, error: oldPendingError } = await supabase
            .from("transactions")
            .select("*, items(title), buyer:profiles!transactions_buyer_id_fkey(user_id, email_notify_transaction_progress, locale)")
            .eq("status", "requested")
            .lt("created_at", oneWeekAgo.toISOString());

        if (oldPendingError) {
            results.errors.push(`Fetch old requested error: ${oldPendingError.message}`);
        } else if (oldPendingTxs && oldPendingTxs.length > 0) {
            for (const tx of oldPendingTxs) {
                const reason = "一定期間（1週間）出品者からの応答がなかったため、購入リクエストは期限切れになりました。";
                
                // トランザクションのステータス更新。requested の間は item.status は available のまま。
                await supabase
                    .from("transactions")
                    .update({ status: "expired", decline_reason: reason, declined_at: new Date().toISOString() })
                    .eq("id", tx.id);
                await supabase
                    .from("purchase_request_history")
                    .update({ status: "expired", decline_reason: reason, resolved_at: new Date().toISOString() })
                    .eq("item_id", tx.item_id)
                    .eq("buyer_id", tx.buyer_id)
                    .eq("status", "requested");

                // システムメッセージを挿入
                await supabase.from("messages").insert({
                    item_id: tx.item_id,
                    sender_id: tx.seller_id,
                    receiver_id: tx.buyer_id,
                    message: `【リクエスト期限切れ】\n${reason}`,
                    is_read: false
                });

                // 通知を作成
                await supabase.from("notifications").insert({
                    user_id: tx.buyer_id,
                    type: "transaction_cancelled",
                    title: "購入リクエストが期限切れになりました",
                    message: `「${tx.items?.title}」への購入リクエストは一定期間応答がなかったため期限切れになりました。`,
                    link_type: "chat",
                    link_id: `${tx.item_id}?tx=${tx.id}`,
                    is_read: false
                });

                await sendWebPushToUser(tx.buyer_id, {
                    title: "購入リクエストが期限切れになりました",
                    body: `「${tx.items?.title}」への購入リクエストは一定期間応答がなかったため期限切れになりました。`,
                    url: `${baseUrl}/chat/${tx.item_id}?tx=${tx.id}`,
                });

                // 購入者へメール通知
                if (tx.buyer?.email_notify_transaction_progress) {
                    const { data: buyerEmail } = await supabase.rpc("admin_get_user_email", { target_user_id: tx.buyer_id, reason: "自動キャンセル通知" });
                    if (buyerEmail) {
                        const title = tx.buyer.locale === "en" ? "Purchase Request Expired" : "購入リクエストが期限切れになりました";
                        const content = tx.buyer.locale === "en" 
                            ? `Your purchase request for "${tx.items?.title}" expired because there was no response from the seller for 7 days.` 
                            : `商品「${tx.items?.title}」への購入リクエストは、出品者からの応答が1週間なかったため、期限切れになりました。`;
                        const chatUrl = `${baseUrl}/chat/${tx.item_id}?tx=${tx.id}`;
                        await sendTransactionProgressEmail(buyerEmail, title, content, chatUrl, tx.buyer.locale || "ja");
                    }
                }

                results.expiredRequests++;
            }
        }

        return NextResponse.json({ success: true, results });
    } catch (err: any) {
        console.error("Cron Error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
