import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { isCurrentUserAdmin } from "@/lib/admin";

export type AdminSearchParams = Record<string, string | string[] | undefined>;

export const maskEmail = (email?: string | null) => {
  if (!email || !email.includes("@")) return "未登録";
  const [local, domain] = email.split("@");
  const prefix = local.length <= 3 ? local.slice(0, 1) : local.slice(0, 3);
  return `${prefix}***@${domain}`;
};

export const formatAdminDate = (value?: string | null) => {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
};

export const getStringParam = (params: AdminSearchParams, key: string) => {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
};

export const requireAdmin = async () => {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    redirect("/auth/login?redirectTo=/admin");
  }

  const isAdmin = await isCurrentUserAdmin(supabase);
  if (!isAdmin) {
    redirect("/profile");
  }

  return { supabase, user: session.user };
};

export const adminLog = async (
  supabase: ReturnType<typeof createSupabaseServerClient>,
  actionType: string,
  targetType: string,
  targetId: string,
  reason?: string,
  metadata?: Record<string, unknown>
) => {
  await (supabase as any).rpc("admin_log_action", {
    action_type: actionType,
    target_type: targetType,
    target_id: targetId,
    reason: reason ?? null,
    metadata: metadata ?? {},
  });
};
