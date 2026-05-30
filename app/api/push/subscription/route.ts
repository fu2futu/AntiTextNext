import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const trimText = (value: unknown, maxLength: number) => {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
};

const isValidEndpoint = (endpoint: string) => {
  if (!endpoint || endpoint.length > 2048) return false;
  return endpoint.startsWith("https://");
};

export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

    const body = await request.json();
    const endpoint = trimText(body?.endpoint, 2048);
    const p256dh = trimText(body?.keys?.p256dh, 512);
    const auth = trimText(body?.keys?.auth, 512);

    if (!isValidEndpoint(endpoint) || !p256dh || !auth) {
      return NextResponse.json({ error: "通知購読情報が不正です" }, { status: 400 });
    }

    const { error } = await (supabase.from("web_push_subscriptions") as any).upsert(
      {
        user_id: user.id,
        endpoint,
        p256dh,
        auth,
        user_agent: trimText(request.headers.get("user-agent"), 500) || null,
        updated_at: new Date().toISOString(),
        revoked_at: null,
      },
      { onConflict: "endpoint" }
    );

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "通知設定を保存できませんでした" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const endpoint = trimText(body?.endpoint, 2048);

    if (!isValidEndpoint(endpoint)) {
      return NextResponse.json({ error: "通知購読情報が不正です" }, { status: 400 });
    }

    const { error } = await (supabase.from("web_push_subscriptions") as any)
      .update({
        revoked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .eq("endpoint", endpoint);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "通知設定を解除できませんでした" }, { status: 500 });
  }
}
