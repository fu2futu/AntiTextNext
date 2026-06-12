import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { normalizeEmail } from "@/lib/admin";

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

export async function POST(request: NextRequest) {
  try {
    const serviceClient = createServiceClient();
    if (!serviceClient) {
      return NextResponse.json({ isAppReviewDemo: false });
    }

    const body = await request.json().catch(() => ({}));
    const email = normalizeEmail(String(body.email || ""));
    if (!email || !email.includes("@")) {
      return NextResponse.json({ isAppReviewDemo: false });
    }

    let page = 1;
    let targetUserId: string | null = null;

    while (!targetUserId && page <= 20) {
      const { data, error } = await serviceClient.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;

      const found = data.users.find((user) => normalizeEmail(user.email || "") === email);
      if (found) {
        targetUserId = found.id;
        break;
      }

      if (data.users.length < 1000) break;
      page += 1;
    }

    if (!targetUserId) {
      return NextResponse.json({ isAppReviewDemo: false });
    }

    const { data: profile, error: profileError } = await (serviceClient as any)
      .from("profiles")
      .select("is_app_review_demo")
      .eq("user_id", targetUserId)
      .maybeSingle();

    if (profileError) throw profileError;

    return NextResponse.json({ isAppReviewDemo: Boolean(profile?.is_app_review_demo) });
  } catch (err) {
    console.error("Password reset check error:", err);
    return NextResponse.json({ isAppReviewDemo: false });
  }
}
