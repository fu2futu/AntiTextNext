const vapidPublicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY || "";

export type PushPermissionState = NotificationPermission | "unsupported";

export const getPushSupport = () => {
  if (typeof window === "undefined") return false;
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
};

export const getServiceWorkerRegistration = async () => {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  return navigator.serviceWorker.register("/sw.js");
};

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
};

export const getCurrentPushStatus = async () => {
  const supported = getPushSupport();
  if (!supported) {
    return {
      supported,
      permission: "unsupported" as PushPermissionState,
      subscribed: false,
    };
  }

  try {
    const registration = await getServiceWorkerRegistration();
    const subscription = await registration.pushManager.getSubscription();
    return {
      supported,
      permission: Notification.permission as PushPermissionState,
      subscribed: Boolean(subscription),
    };
  } catch {
    return {
      supported,
      permission: Notification.permission as PushPermissionState,
      subscribed: false,
    };
  }
};

export const enableWebPush = async () => {
  if (!getPushSupport()) {
    return {
      subscribed: false,
      permission: "unsupported" as PushPermissionState,
      message: "このブラウザではホーム画面通知に対応していません。",
    };
  }

  if (!vapidPublicKey) {
    return {
      subscribed: false,
      permission: Notification.permission as PushPermissionState,
      message: "通知用の公開キーがまだ設定されていません。",
    };
  }

  const permission = await Notification.requestPermission();

  if (permission !== "granted") {
    return {
      subscribed: false,
      permission,
      message: "通知が許可されませんでした。ブラウザの設定から許可できます。",
    };
  }

  const registration = await getServiceWorkerRegistration();
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
  }

  const response = await fetch("/api/push/subscription", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });

  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || "通知設定を保存できませんでした。");
  }

  return {
    subscribed: true,
    permission,
    message: "ホーム画面通知を有効にしました。",
  };
};

export const disableWebPush = async () => {
  if (!getPushSupport()) {
    return {
      subscribed: false,
      permission: "unsupported" as PushPermissionState,
      message: "このブラウザではホーム画面通知に対応していません。",
    };
  }

  const registration = await getServiceWorkerRegistration();
  const subscription = await registration.pushManager.getSubscription();

  if (subscription) {
    await fetch("/api/push/subscription", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
    await subscription.unsubscribe();
  }

  return {
    subscribed: false,
    permission: Notification.permission as PushPermissionState,
    message: "ホーム画面通知を停止しました。",
  };
};
