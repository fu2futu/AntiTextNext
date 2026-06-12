import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { sendWatchKeywordEmail } from '@/lib/email';
import { sendWebPushToUser } from '@/lib/web-push';

// POST: 新しい出品に対してウォッチキーワードをチェックし、マッチしたユーザーに通知
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { itemId } = body;

        if (!itemId) {
            return NextResponse.json({ error: 'パラメータ不足' }, { status: 400 });
        }

        const cookieStore = cookies();
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    get(name: string) { return cookieStore.get(name)?.value; },
                    set(name: string, value: string, options: any) { cookieStore.set({ name, value, ...options }); },
                    remove(name: string, options: any) { cookieStore.set({ name, value: '', ...options }); },
                },
            }
        );

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            return NextResponse.json({ error: '未認証' }, { status: 401 });
        }

        const { data: targetItem } = await (supabase.from("items") as any)
            .select("is_demo")
            .eq("id", itemId)
            .maybeSingle();

        if (targetItem?.is_demo) {
            return NextResponse.json({ matched: 0, skipped: "demo_item" });
        }

        const { data, error } = await (supabase as any).rpc("notify_watch_keyword_matches", {
            target_item_id: itemId,
        });

        if (error) {
            console.error("Watch keyword notification error:", error);
            return NextResponse.json({ matched: 0 });
        }

        // --- メール送信処理 ---
        // notify_watch_keyword_matches は通知を作成するため、直近作成された通知を検索して対象ユーザーを特定
        if (data > 0) {
            try {
                // 対象のアイテム情報を取得
                const { data: item } = await supabase
                    .from("items")
                    .select("title")
                    .eq("id", itemId)
                    .single();

                if (item) {
                    // 直近1分以内に作成されたこのアイテムに関する通知を取得
                    const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
                    const { data: notifications } = await supabase
                        .from("notifications")
                        .select("user_id, message")
                        .eq("link_id", itemId)
                        .eq("type", "watch_keyword_match")
                        .gte("created_at", oneMinuteAgo);

                    if (notifications && notifications.length > 0) {
                        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
                        const itemUrl = `${baseUrl}/product/${itemId}`;

                        for (const notif of notifications) {
                            await sendWebPushToUser(notif.user_id, {
                                title: "探している教科書が出品されました",
                                body: notif.message || `「${item.title}」が出品されました。`,
                                url: itemUrl,
                            });

                            // 設定とメールアドレスを取得
                            const { data: userProfile } = await supabase
                                .from("profiles")
                                .select("email_notify_watch_keywords, locale")
                                .eq("user_id", notif.user_id)
                                .single();

                            if (userProfile && userProfile.email_notify_watch_keywords) {
                                // ユーザーのメールアドレスを取得（サービスロール相当が必要な場合があるが、まずはadmin RPCで試す）
                                const { data: email } = await (supabase as any).rpc("admin_get_user_email", {
                                    target_user_id: notif.user_id,
                                    reason: "新着出品の自動メール通知",
                                });

                                if (email) {
                                    // message: "探しているキーワード「XXX」に一致する商品..." からキーワードを抽出
                                    const keywordMatch = notif.message.match(/「(.+?)」/);
                                    const keyword = keywordMatch ? keywordMatch[1] : "登録キーワード";
                                    
                                    await sendWatchKeywordEmail(
                                        email,
                                        keyword,
                                        item.title,
                                        itemUrl,
                                        userProfile.locale || "ja"
                                    );
                                }
                            }
                        }
                    }
                }
            } catch (emailErr) {
                console.error("Error sending watch keyword emails:", emailErr);
            }
        }

        return NextResponse.json({ matched: data ?? 0 });
    } catch (err: any) {
        console.error("Check watch keywords error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
