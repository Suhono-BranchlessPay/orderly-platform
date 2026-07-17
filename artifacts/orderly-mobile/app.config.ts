import type { ConfigContext } from "expo/config";
import fs from "node:fs";
import path from "node:path";

const aliases: Record<string, string> = {
  samurai: "samurai-martinsville",
  martinsville: "samurai-martinsville",
  linton: "samurai-linton",
};

let slug = (process.env.EXPO_PUBLIC_TENANT_SLUG || "samurai-martinsville").toLowerCase();
slug = aliases[slug] || slug;

const buildProfile =
  process.env.EAS_BUILD_PROFILE ||
  process.env.EAS_BUILD_PROFILE_NAME ||
  "";
const apiOverride = (process.env.EXPO_PUBLIC_API_BASE_URL || "").trim();

// Hard stop: production APK must never ship a staging/local API override.
if (buildProfile === "production" && apiOverride) {
  throw new Error(
    `Refusing production build: EXPO_PUBLIC_API_BASE_URL is set to "${apiOverride}". ` +
      "Unset it so the app uses tenants/*/config.json production apiBaseUrl (samurairesto.com).",
  );
}

if (
  buildProfile === "sandbox" &&
  (!apiOverride || apiOverride === "SET_ME_TO_STAGING_OR_LAN_API")
) {
  throw new Error(
    "sandbox profile requires a real EXPO_PUBLIC_API_BASE_URL (local/staging API with Square sandbox). " +
      "Edit eas.json sandbox.env or pass --env EXPO_PUBLIC_API_BASE_URL=...",
  );
}

// Load tenant config without require(): Expo compiles this file to ESM (it has
// `export default`), and Node 22's require-of-ESM makes a top-level require()
// throw "require is not defined in ES module scope". Read the JSON directly so
// it works whether the compiled module is CJS (__dirname) or ESM (cwd).
const baseDir =
  typeof __dirname !== "undefined" ? __dirname : process.cwd();
const tenant = JSON.parse(
  fs.readFileSync(
    path.join(baseDir, "tenants", slug, "config.json"),
    "utf8",
  ),
) as {
  appName: string;
  bundleId: string;
  androidPackage: string;
  theme: { primary: string; background: string };
  locationLabel?: string;
};

export default ({ config }: ConfigContext) => ({
  ...config,
  name: tenant.appName,
  slug: `orderly-${slug}`,
  owner: "branchlesspay",
  version: "1.0.0",
  orientation: "portrait" as const,
  icon: `./tenants/${slug}/assets/brand/icon.png`,
  userInterfaceStyle: (slug === "kirin" ? "light" : "dark") as "light" | "dark",
  splash: {
    image: `./tenants/${slug}/assets/brand/splash.png`,
    resizeMode: "contain" as const,
    backgroundColor: tenant.theme.background,
  },
  plugins: [
    // Official Square Expo config plugin (In-App Payments native setup)
    "react-native-square-in-app-payments",
    // Adds the Square SDK "setup" Run Script build phase so the nested Square
    // frameworks are un-nested + the unsigned `setup` helper self-deletes.
    // Without this App Store rejects with ITMS-90205/90206/90035.
    "./plugins/withSquareSetupScript",
    [
      "expo-notifications",
      {
        color: tenant.theme.primary,
        defaultChannel: "pickup-ready",
        // iOS background remote notifications for pickup-ready while app is backgrounded
        enableBackgroundRemoteNotifications: true,
      },
    ],
  ],
  ios: {
    supportsTablet: false,
    bundleIdentifier: tenant.bundleId,
    infoPlist: {
      UIBackgroundModes: ["remote-notification"],
      // App only uses standard TLS/HTTPS (exempt encryption) — avoids the
      // export-compliance question on every TestFlight upload.
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    adaptiveIcon: {
      // Safe-zone inset art (see scripts/make-adaptive-icon.py). Falls back to
      // full icon.png if adaptive-icon.png is missing for a new tenant.
      foregroundImage: fs.existsSync(
        path.join(baseDir, "tenants", slug, "assets", "brand", "adaptive-icon.png"),
      )
        ? `./tenants/${slug}/assets/brand/adaptive-icon.png`
        : `./tenants/${slug}/assets/brand/icon.png`,
      backgroundColor: tenant.theme.background,
    },
    package: tenant.androidPackage,
    permissions: [
      "INTERNET",
      "ACCESS_NETWORK_STATE",
      "POST_NOTIFICATIONS",
      "RECEIVE_BOOT_COMPLETED",
      "VIBRATE",
    ],
  },
  extra: {
    tenantSlug: slug,
    locationLabel: tenant.locationLabel ?? null,
    buildProfile: buildProfile || null,
    apiBaseUrlOverride: apiOverride || null,
    eas: {
      // Linked EAS project @branchlesspay/orderly-samurai-martinsville.
      projectId:
        process.env.EAS_PROJECT_ID || "e0320b2c-4323-490d-8f4b-33b5de4d3459",
    },
  },
});
