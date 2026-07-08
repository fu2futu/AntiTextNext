import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { normalizeEmail } from "@/lib/admin";

export const runtime = "nodejs";

const CAMPUS_EMAIL_DOMAIN = "@m.isct.ac.jp";

// テスト用に登録を許可するメールアドレス。
// 本番環境でenvを触れないため、ここに直接埋め込む。テスト後は削除すること。
// env(SIGNUP_TEST_ALLOWED_EMAILS カンマ区切り)でも追加できる。
const HARDCODED_TEST_ALLOWED_EMAILS = ["edamamemochi2004@gmail.com"];

const getTestAllowedEmails = () =>
  [
    ...HARDCODED_TEST_ALLOWED_EMAILS,
    ...(process.env.SIGNUP_TEST_ALLOWED_EMAILS || "").split(","),
  ]
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

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

export async function POST(request: NextRequest) {
  try {
    const serviceClient = createServiceClient();
    if (!serviceClient) {
      return NextResponse.json({ allowed: false, error: "登録確認の設定が不足しています" }, { status: 500 });
    }

    const body = await request.json().catch(() => ({}));
    const email = normalizeEmail(String(body.email || ""));

    if (!email || !email.includes("@")) {
      return NextResponse.json({ allowed: false, error: "メールアドレスを入力してください" }, { status: 400 });
    }

    const isCampusEmail = email.endsWith(CAMPUS_EMAIL_DOMAIN);
    const isTestAllowedEmail = getTestAllowedEmails().includes(email);
    const { data: isAdminEmail, error: adminEmailError } = await (serviceClient as any).rpc("is_allowed_admin_email", {
      target_email: email,
    });

    if (adminEmailError) throw adminEmailError;

    if (!isCampusEmail && !isAdminEmail && !isTestAllowedEmail) {
      return NextResponse.json({
        allowed: false,
        error: "学内メールアドレス（@m.isct.ac.jp）または登録済みの管理者メールアドレスを使用してください",
      });
    }

    const { data: alreadyRegistered, error: registeredError } = await (serviceClient as any).rpc("is_registered_email", {
      target_email: email,
    });

    if (registeredError) throw registeredError;

    if (alreadyRegistered) {
      return NextResponse.json({ allowed: false, error: "このアドレスはすでに登録されています" });
    }

    const emailHash = hashEmail(email);
    const { data: bans, error: banError } = await (serviceClient as any)
      .from("account_email_bans")
      .select("id")
      .eq("email_hash", emailHash)
      .is("lifted_at", null)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .limit(1);

    if (banError) throw banError;

    if ((bans ?? []).length > 0) {
      return NextResponse.json({
        allowed: false,
        error: "このメールアドレスでは登録できません。心当たりがない場合は運営へお問い合わせください。",
      });
    }

    return NextResponse.json({ allowed: true });
  } catch (err: any) {
    console.error("Signup eligibility error:", err);
    return NextResponse.json({ allowed: false, error: err.message || "登録確認に失敗しました" }, { status: 500 });
  }
}
