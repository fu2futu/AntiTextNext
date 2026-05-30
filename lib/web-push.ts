import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

type PushPayload = {
  title: string;
  body: string;
  url?: string;
  badgeCount?: number;
};

type PushSubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

const getPushConfig = () => {
  const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  const subject = process.env.WEB_PUSH_CONTACT || "mailto:textnextbbs@gmail.com";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!publicKey || !privateKey || !serviceRoleKey || !supabaseUrl) {
    return null;
  }

  return { publicKey, privateKey, subject, serviceRoleKey, supabaseUrl };
};

const getSupabaseAdmin = () => {
  const config = getPushConfig();
  if (!config) return null;
  return createClient(config.supabaseUrl, config.serviceRoleKey);
};

const configureWebPush = () => {
  const config = getPushConfig();
  if (!config) return null;

  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  return config;
};

export const sendWebPushToUser = async (userId: string | null | undefined, payload: PushPayload) => {
  if (!userId) return { sent: 0, failed: 0, skipped: true, reason: "missing_user_id" };

  const config = configureWebPush();
  const supabaseAdmin = getSupabaseAdmin();
  if (!config || !supabaseAdmin) return { sent: 0, failed: 0, skipped: true, reason: "missing_server_config" };

  const { data: subscriptions, error } = await (supabaseAdmin as any)
    .from("web_push_subscriptions")
    .select("endpoint,p256dh,auth")
    .eq("user_id", userId)
    .is("revoked_at", null);

  if (error || !subscriptions?.length) {
    return {
      sent: 0,
      failed: error ? 1 : 0,
      skipped: !error,
      reason: error ? "subscription_fetch_failed" : "no_active_subscription",
    };
  }

  let sent = 0;
  let failed = 0;

  for (const subscription of subscriptions as PushSubscriptionRow[]) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        JSON.stringify(payload)
      );
      sent += 1;
    } catch (err: any) {
      failed += 1;
      const statusCode = err?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await (supabaseAdmin as any)
          .from("web_push_subscriptions")
          .update({
            revoked_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("endpoint", subscription.endpoint);
      } else {
        console.warn("web push delivery failed", {
          statusCode,
          endpointPrefix: subscription.endpoint.slice(0, 32),
        });
      }
    }
  }

  return { sent, failed, skipped: false, reason: null };
};
