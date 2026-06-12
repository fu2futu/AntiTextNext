import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { INPUT_LIMITS } from '@/lib/input-limits';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const bookTitle = String(body.bookTitle || '').trim();
        const author = String(body.author || '').trim();
        const courseName = String(body.courseName || '').trim();

        if (!bookTitle) {
            return NextResponse.json(
                { success: false, error: '本のタイトルを入力してください' },
                { status: 400 }
            );
        }

        if (bookTitle.length > INPUT_LIMITS.bookRequestTitleMax) {
            return NextResponse.json(
                { success: false, error: `本のタイトルは${INPUT_LIMITS.bookRequestTitleMax}文字以内で入力してください` },
                { status: 400 }
            );
        }

        if (author.length > INPUT_LIMITS.bookRequestAuthorMax) {
            return NextResponse.json(
                { success: false, error: `著者・出版社は${INPUT_LIMITS.bookRequestAuthorMax}文字以内で入力してください` },
                { status: 400 }
            );
        }

        if (courseName.length > INPUT_LIMITS.bookRequestCourseMax) {
            return NextResponse.json(
                { success: false, error: `授業名・教科は${INPUT_LIMITS.bookRequestCourseMax}文字以内で入力してください` },
                { status: 400 }
            );
        }

        const supabase = createSupabaseServerClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json(
                { success: false, error: 'ログインが必要です' },
                { status: 401 }
            );
        }

        // プロフィールのニックネームをリクエスト者名として利用
        const { data: profile } = await (supabase as any)
            .from('profiles')
            .select('nickname')
            .eq('user_id', user.id)
            .single();

        const { error } = await (supabase as any).from('book_requests').insert({
            requester_id: user.id,
            requester_name: profile?.nickname ?? null,
            book_title: bookTitle,
            author: author || null,
            course_name: courseName || null,
            status: 'open',
        });

        if (error) {
            console.error('Book request insert error:', error);
            return NextResponse.json(
                { success: false, error: 'リクエストの送信に失敗しました' },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true });
    } catch (err: any) {
        console.error('Book request error:', err);
        return NextResponse.json(
            { success: false, error: err.message || 'サーバーエラー' },
            { status: 500 }
        );
    }
}
