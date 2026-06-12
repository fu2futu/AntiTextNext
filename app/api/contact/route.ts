import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { INPUT_LIMITS } from '@/lib/input-limits';

const createServiceClient = () => {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!serviceKey || !supabaseUrl) return null;
    return createClient(supabaseUrl, serviceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
};

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const username = String(body.username || '').trim();
        const email = String(body.email || '').trim().toLowerCase();
        const category = String(body.category || '').trim();
        const categoryLabel = String(body.categoryLabel || '').trim();
        const content = String(body.content || '').trim();

        // バリデーション
        if (!username || !email || !category || !content) {
            return NextResponse.json(
                { success: false, error: '必須項目が入力されていません' },
                { status: 400 }
            );
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return NextResponse.json(
                { success: false, error: '有効なメールアドレスを入力してください' },
                { status: 400 }
            );
        }

        if (username.length > INPUT_LIMITS.contactUsernameMax) {
            return NextResponse.json(
                { success: false, error: `ユーザー名は${INPUT_LIMITS.contactUsernameMax}文字以内で入力してください` },
                { status: 400 }
            );
        }

        if (content.length < INPUT_LIMITS.contactContentMin) {
            return NextResponse.json(
                { success: false, error: `お問い合わせ内容は${INPUT_LIMITS.contactContentMin}文字以上で入力してください` },
                { status: 400 }
            );
        }

        if (content.length > INPUT_LIMITS.contactContentMax) {
            return NextResponse.json(
                { success: false, error: `お問い合わせ内容は${INPUT_LIMITS.contactContentMax}文字以内で入力してください` },
                { status: 400 }
            );
        }

        const gasUrl = process.env.CONTACT_FORM_GAS_URL;
        const supabase = createSupabaseServerClient();
        const { data: { user } } = await supabase.auth.getUser();

        const storageClient = user ? supabase : createServiceClient();
        let inquiryError: any = storageClient
            ? null
            : { message: 'SUPABASE_SERVICE_ROLE_KEY is not set for guest contact submission' };
        let inquiry: { id?: string } | null = null;

        if (storageClient) {
            const result = await (storageClient as any).from('inquiries').insert({
                sender_user_id: user?.id ?? null,
                sender_name: username,
                email,
                category,
                content,
                status: 'open',
                has_unread_user_message: true,
                last_user_message_at: new Date().toISOString(),
            }).select('id').single();
            inquiry = result.data;
            inquiryError = result.error;
        }

        if (inquiryError) {
            console.error('Inquiry insert error:', inquiryError);
        } else if (user && inquiry?.id) {
            const { error: messageError } = await (supabase as any).from('inquiry_messages').insert({
                inquiry_id: inquiry.id,
                sender_user_id: user.id,
                sender_role: 'user',
                message: content,
            });
            if (messageError) {
                console.error('Inquiry initial message insert error:', messageError);
            }
        }

        if (!gasUrl) {
            if (!inquiryError) {
                return NextResponse.json({ success: true, storage: 'inquiries' });
            }

            console.error('CONTACT_FORM_GAS_URL is not set and inquiry insert failed');
            return NextResponse.json({ success: false, error: 'サーバー設定エラー' }, { status: 500 });
        }

        // Google Apps Script に送信
        const gasResponse = await fetch(gasUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username,
                email,
                category,
                categoryLabel,
                content,
                userId: user?.id ?? null,
                isGuest: !user,
                timestamp: new Date().toISOString(),
            }),
        });

        // GAS は redirect (302) を返すことがあるので、リダイレクト先もフォローする
        if (gasResponse.ok || gasResponse.redirected) {
            return NextResponse.json({ success: true, storage: inquiryError ? 'gas_only' : 'inquiries_and_gas' });
        }

        // GAS からのレスポンスを取得
        const gasText = await gasResponse.text().catch(() => 'Unknown error');
        console.error('GAS response error:', gasResponse.status, gasText);

        if (!inquiryError) {
            return NextResponse.json({ success: true, storage: 'inquiries', warning: 'gas_failed' });
        }

        return NextResponse.json({ success: false, error: 'お問い合わせの記録に失敗しました' }, { status: 502 });
    } catch (err: any) {
        console.error('Contact form error:', err);
        return NextResponse.json(
            { success: false, error: err.message || 'サーバーエラー' },
            { status: 500 }
        );
    }
}
