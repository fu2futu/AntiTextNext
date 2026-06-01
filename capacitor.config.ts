import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl = process.env.CAPACITOR_SERVER_URL || "https://textnext.jp";

const config: CapacitorConfig = {
  appId: "jp.textnext.app",
  appName: "TextNext",
  webDir: "public",
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith("http://"),
    allowNavigation: [
      "textnext.jp",
      "*.textnext.jp",
      "*.supabase.co",
      "localhost",
      "127.0.0.1",
    ],
  },
  ios: {
    contentInset: "never",
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
