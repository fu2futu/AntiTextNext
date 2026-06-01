import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "jp.textnext.app",
  appName: "TextNext",
  webDir: "public",
  server: {
    url: process.env.CAPACITOR_SERVER_URL || "https://textnext.jp",
    cleartext: false,
  },
  ios: {
    contentInset: "automatic",
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
