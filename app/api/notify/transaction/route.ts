import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { sendTransactionProgressEmail } from "@/lib/email";
import { sendWebPushToUser } from "@/lib/web-push";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { action, itemId, receiverId, extraData } = body;

        // action: 'request', 'approve', 'decline', 'message'
        if (!action || !itemId || !receiverId) {
            return NextResponse.json({ error: "パラメータ不足" }, { status: 400 });
        }

        const cookieStore = cookies();

        // 認証チェック用クライアント（通常のanonキー）
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    get(name: string) { return cookieStore.get(name)?.value; },
                    set(name: string, value: string, options: any) { cookieStore.set({ name, value, ...options }); },
                    remove(name: string, options: any) { cookieStore.set({ name, value: "", ...options }); },
                },
            }
        );

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            return NextResponse.json({ error: "未認証" }, { status: 401 });
        }

        const { data: actorProfile } = await (supabase.from("profiles") as any)
            .select("is_app_review_demo")
            .eq("user_id", session.user.id)
            .maybeSingle();
        const actorIsAppReviewDemo = Boolean(actorProfile?.is_app_review_demo);

        // 受信者の通知設定を取得
        const { data: profile } = await supabase
            .from("profiles")
            .select("email_notify_transaction_progress, locale")
            .eq("user_id", receiverId)
            .single();

        if (!profile) return NextResponse.json({ success: true, skipped: true });

        // 設定の確認
        const isTransactionAction = ["request", "approve", "decline", "rating_remind"].includes(action);
        const emailEnabled = !isTransactionAction || Boolean(profile.email_notify_transaction_progress);
        const locale = profile.locale || "ja";

        // 商品情報の取得
        const { data: item } = await supabase
            .from("items")
            .select("title, is_demo")
            .eq("id", itemId)
            .single();

        const itemTitle = item?.title || "商品";
        const itemIsDemo = Boolean((item as any)?.is_demo);

        if (actorIsAppReviewDemo && !itemIsDemo) {
            console.warn("Blocked app review notification for real item", {
                actorId: session.user.id,
                receiverId,
                itemId,
                action,
            });

            if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
                const supabaseAdmin = createClient(
                    process.env.NEXT_PUBLIC_SUPABASE_URL!,
                    process.env.SUPABASE_SERVICE_ROLE_KEY!
                );
                await (supabaseAdmin as any).from("admin_action_logs").insert({
                    admin_user_id: null,
                    action_type: "app_review_real_notification_blocked",
                    target_type: "item",
                    target_id: String(itemId),
                    reason: "App Review demo account attempted notification for a real item",
                    metadata: {
                        actorId: session.user.id,
                        receiverId,
                        action,
                    },
                });
            }

            return NextResponse.json({ success: true, blocked: true });
        }

        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://textnext.jp";
        const actionUrl = extraData?.transactionId
            ? `${baseUrl}/chat/${itemId}?tx=${extraData.transactionId}`
            : `${baseUrl}/chat/${itemId}`;

        if (action === "message") {
            await sendWebPushToUser(receiverId, {
                title: itemIsDemo ? "[デモ] 新しいチャットメッセージ" : "新しいチャットメッセージ",
                body: extraData?.preview ? `${itemIsDemo ? "[デモ] " : ""}${String(extraData.preview).slice(0, 80)}` : `${itemIsDemo ? "[デモ] " : ""}「${itemTitle}」に新しいメッセージがあります。`,
                url: actionUrl,
            });
            return NextResponse.json({ success: true, skippedEmail: true });
        }

        const pushPayloadByAction = (() => {
            if (action === "request") {
                return {
                    title: locale === "en" ? "Purchase Request Received" : "購入相談が届きました",
                    body: locale === "en"
                        ? `${itemIsDemo ? "[Demo] " : ""}You have received a purchase request for "${itemTitle}".`
                        : `${itemIsDemo ? "[デモ] " : ""}「${itemTitle}」に購入リクエストが届きました。チャットで確認してください。`,
                    url: actionUrl,
                };
            }
            if (action === "approve") {
                return {
                    title: locale === "en" ? "Purchase Request Approved" : "購入リクエストが承認されました",
                    body: locale === "en"
                        ? `${itemIsDemo ? "[Demo] " : ""}Your purchase request for "${itemTitle}" has been approved.`
                        : `${itemIsDemo ? "[デモ] " : ""}「${itemTitle}」の購入リクエストが承認されました。`,
                    url: actionUrl,
                };
            }
            if (action === "decline") {
                return {
                    title: locale === "en" ? "Purchase Request Declined" : "購入リクエストが見送られました",
                    body: locale === "en"
                        ? `${itemIsDemo ? "[Demo] " : ""}Your purchase request for "${itemTitle}" was declined.`
                        : `${itemIsDemo ? "[デモ] " : ""}「${itemTitle}」の購入リクエストは見送られました。`,
                    url: actionUrl,
                };
            }
            if (action === "rating_remind") {
                return {
                    title: locale === "en" ? "Please Rate Your Transaction" : "取引相手からの評価が完了しました",
                    body: locale === "en"
                        ? `${itemIsDemo ? "[Demo] " : ""}Please submit your rating for "${itemTitle}".`
                        : `${itemIsDemo ? "[デモ] " : ""}「${itemTitle}」の評価を完了してください。`,
                    url: `${baseUrl}/rating/${extraData?.transactionId}`,
                };
            }
            return null;
        })();

        if (pushPayloadByAction) {
            await sendWebPushToUser(receiverId, pushPayloadByAction);
        }

        if (!emailEnabled) {
            return NextResponse.json({ success: true, skippedEmail: true });
        }

        // ===== メールアドレス取得 =====
        // Service Role キーを使ってサーバーサイドでメールアドレスを安全に取得
        // （admin_get_user_email RPCは管理者専用のため使用不可）
        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
            console.warn("SUPABASE_SERVICE_ROLE_KEY is not set. Cannot send email notification.");
            return NextResponse.json({ success: true, skipped: true });
        }

        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { data: { user: targetUser }, error: userError } = await supabaseAdmin.auth.admin.getUserById(receiverId);

        if (userError || !targetUser?.email) {
            console.warn("Failed to get receiver email:", userError?.message);
            return NextResponse.json({ success: true, skipped: true });
        }

        const email = targetUser.email;

        if (action === "request") {
            const title = locale === "en" ? `${itemIsDemo ? "[Demo] " : ""}Purchase Request Received` : `${itemIsDemo ? "[デモ] " : ""}購入リクエストを受信しました`;
            const content = locale === "en"
                ? `${itemIsDemo ? "[Demo] " : ""}You have received a purchase request for your item "${itemTitle}". Please review it in the chat.`
                : `${itemIsDemo ? "[デモ] " : ""}出品した商品「${itemTitle}」に購入リクエストが届きました。チャットから内容を確認して、承認または辞退を行ってください。`;
            await sendTransactionProgressEmail(email, title, content, actionUrl, locale);
        } else if (action === "approve") {
            const title = locale === "en" ? `${itemIsDemo ? "[Demo] " : ""}Purchase Request Approved` : `${itemIsDemo ? "[デモ] " : ""}購入リクエストが承認されました`;
            const content = locale === "en"
                ? `${itemIsDemo ? "[Demo] " : ""}Your purchase request for "${itemTitle}" has been approved! The transaction has started.`
                : `${itemIsDemo ? "[デモ] " : ""}商品「${itemTitle}」の購入リクエストが承認されました！取引が開始されました。チャットで引き続き連絡を取り合ってください。`;
            await sendTransactionProgressEmail(email, title, content, actionUrl, locale);
        } else if (action === "decline") {
            const title = locale === "en" ? `${itemIsDemo ? "[Demo] " : ""}Purchase Request Declined` : `${itemIsDemo ? "[デモ] " : ""}購入リクエストが見送られました`;
            const content = locale === "en"
                ? `${itemIsDemo ? "[Demo] " : ""}Unfortunately, your purchase request for "${itemTitle}" was declined by the seller.`
                : `${itemIsDemo ? "[デモ] " : ""}残念ながら、商品「${itemTitle}」の購入リクエストは見送られました。`;
            await sendTransactionProgressEmail(email, title, content, actionUrl, locale);
        } else if (action === "rating_remind") {
            const title = locale === "en" ? `${itemIsDemo ? "[Demo] " : ""}Please Rate Your Transaction` : `${itemIsDemo ? "[デモ] " : ""}取引相手からの評価が完了しました`;
            const content = locale === "en"
                ? `${itemIsDemo ? "[Demo] " : ""}The other party has submitted their rating for "${itemTitle}". Please submit your rating to complete the transaction.`
                : `${itemIsDemo ? "[デモ] " : ""}取引相手が商品「${itemTitle}」の評価を完了しました。評価が完了していなければ評価をお願いします。評価が完了し次第取引は終了となります。`;
            const ratingUrl = `${baseUrl}/rating/${extraData?.transactionId}`;
            await sendTransactionProgressEmail(email, title, content, ratingUrl, locale);
        }

        return NextResponse.json({ success: true });
    } catch (err: any) {
        console.error("Notify error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
