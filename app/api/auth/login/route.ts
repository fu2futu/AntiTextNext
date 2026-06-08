import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { isCurrentUserAdmin, normalizeEmail } from "@/lib/admin";

export const runtime = "nodejs";

const GENERIC_LOGIN_ERROR = "ログイン情報が正しくありません";
const ACCOUNT_UNAVAILABLE_ERROR = "このアカウントは利用できません。心当たりがない場合は運営へお問い合わせください。";

const getClientIp = (request: NextRequest) => {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") || "unknown";
};

const sanitizeRedirectTo = (value?: string | null) => {
  if (!value) return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
};

const createRouteSupabaseClient = () => {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          cookieStore.set({ name, value: "", ...options });
        },
      },
    }
  );
};

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

const recordLoginAttempt = async (
  supabase: ReturnType<typeof createRouteSupabaseClient>,
  email: string,
  ipAddress: string,
  userAgent: string,
  success: boolean
) => {
  await (supabase as any).rpc("record_login_attempt", {
    target_email: email,
    target_ip_address: ipAddress,
    target_user_agent: userAgent,
    was_success: success,
  });
};

export async function POST(request: NextRequest) {
  const supabase = createRouteSupabaseClient();
  const ipAddress = getClientIp(request);
  const userAgent = request.headers.get("user-agent") || "unknown";

  let email = "";
  let password = "";
  let redirectTo = "/";

  try {
    const body = await request.json();
    email = normalizeEmail(String(body.email || ""));
    password = String(body.password || "");
    redirectTo = sanitizeRedirectTo(body.redirectTo);
  } catch {
    return NextResponse.json({ error: GENERIC_LOGIN_ERROR }, { status: 400 });
  }

  if (!email || !password) {
    return NextResponse.json({ error: GENERIC_LOGIN_ERROR }, { status: 400 });
  }

  const { data: isLimited, error: limitError } = await (supabase as any).rpc(
    "is_login_rate_limited",
    {
      target_email: email,
      target_ip_address: ipAddress,
    }
  );

  if (limitError) {
    console.error("Failed to check login rate limit:", limitError);
  }

  if (isLimited) {
    return NextResponse.json(
      { error: "ログイン試行が多すぎます。しばらく時間をおいて再度お試しください。" },
      { status: 429 }
    );
  }

  const serviceClient = createServiceClient();
  if (serviceClient) {
    const { data: emailBans, error: emailBanError } = await (serviceClient as any)
      .from("account_email_bans")
      .select("id")
      .eq("email_hash", hashEmail(email))
      .is("lifted_at", null)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .limit(1);

    if (emailBanError) {
      console.error("Failed to check account email ban:", emailBanError);
    } else if ((emailBans ?? []).length > 0) {
      await recordLoginAttempt(supabase, email, ipAddress, userAgent, false);
      return NextResponse.json({ error: ACCOUNT_UNAVAILABLE_ERROR }, { status: 403 });
    }
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    await recordLoginAttempt(supabase, email, ipAddress, userAgent, false);
    return NextResponse.json({ error: GENERIC_LOGIN_ERROR }, { status: 401 });
  }

  if (!data.user.email_confirmed_at) {
    await supabase.auth.signOut();
    await recordLoginAttempt(supabase, email, ipAddress, userAgent, false);
    return NextResponse.json({ error: GENERIC_LOGIN_ERROR }, { status: 401 });
  }

  await recordLoginAttempt(supabase, email, ipAddress, userAgent, true);

  const { data: activeRestriction } = await (supabase as any)
    .from("user_restrictions")
    .select("restriction_type, ends_at, lifted_at, reason")
    .eq("user_id", data.user.id)
    .in("restriction_type", ["temporary_suspend", "permanent_ban"])
    .is("lifted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeRestriction) {
    const isActiveTemporarySuspend =
      activeRestriction.restriction_type === "temporary_suspend" &&
      activeRestriction.ends_at &&
      new Date(activeRestriction.ends_at).getTime() > Date.now();
    const isPermanentBan = activeRestriction.restriction_type === "permanent_ban";

    if (isPermanentBan && serviceClient) {
      await (serviceClient as any)
        .from("account_email_bans")
        .upsert(
          {
            email_hash: hashEmail(email),
            reason: activeRestriction.reason || "既存の永久BAN",
            lifted_at: null,
            lifted_by: null,
            admin_note: "login_sync_from_user_restrictions",
          },
          { onConflict: "email_hash" }
        );
    }

    if (isPermanentBan || isActiveTemporarySuspend) {
      await supabase.auth.signOut();
      return NextResponse.json({ error: ACCOUNT_UNAVAILABLE_ERROR }, { status: 403 });
    }
  }

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("user_id, is_deactivated")
    .eq("user_id", data.user.id)
    .single();

  let nextPath = redirectTo;
  if (!profile) {
    nextPath = "/auth/setup-profile";
  } else if (profile.is_deactivated) {
    await supabase.auth.signOut();
    return NextResponse.json({ error: GENERIC_LOGIN_ERROR }, { status: 401 });
  }

  const isAdmin = await isCurrentUserAdmin(supabase as any);
  if (isAdmin) {
    await (supabase as any).rpc("admin_log_action", {
      action_type: "admin_login",
      target_type: "user",
      target_id: data.user.id,
      reason: "admin login",
      metadata: {
        ip_address: ipAddress,
        user_agent: userAgent,
      },
    });
  }

  return NextResponse.json({ success: true, redirectTo: nextPath });
}
