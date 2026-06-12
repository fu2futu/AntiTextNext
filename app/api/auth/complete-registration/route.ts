import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

const createServiceClient = () => {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};

const hashEmail = (email: string) =>
  createHash("sha256")
    .update(`${email.trim().toLowerCase()}:${process.env.ACCOUNT_DELETION_HASH_PEPPER || ""}`)
    .digest("hex");

export async function POST() {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user?.email) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

    const serviceClient = createServiceClient();
    if (!serviceClient) {
      return NextResponse.json({ error: "登録完了処理の設定が不足しています" }, { status: 500 });
    }

    const emailHash = hashEmail(session.user.email);
    const { data, error } = await (serviceClient as any).rpc("clear_deleted_account_retention_by_hash", {
      target_email_hash: emailHash,
    });

    if (error) throw error;

    return NextResponse.json({ success: true, clearedDeletedAccounts: data ?? 0 });
  } catch (err: any) {
    console.error("Complete registration cleanup error:", err);
    return NextResponse.json({ error: err.message || "登録完了処理に失敗しました" }, { status: 500 });
  }
}
