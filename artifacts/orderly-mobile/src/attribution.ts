/**
 * Mobile first-touch attribution (Blok D4).
 * Persists utm_* and src from deep links / universal links into AsyncStorage.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import { tenant } from "./tenant";

const KEY = `orderly_mobile_attribution_${tenant.appId}`;

export type MobileAttribution = {
  channel: string;
  source_detail: Record<string, unknown>;
  captured_at: string;
};

function mapChannel(utmSource?: string | null, src?: string | null): string {
  const u = (utmSource || "").trim().toLowerCase();
  const s = (src || "").trim().toLowerCase();
  if (u === "google" || s === "google" || s === "gbp") return "google";
  if (u === "facebook" || u === "fb" || s === "facebook") return "facebook";
  if (u === "instagram" || u === "ig" || s === "instagram") return "instagram";
  if (u === "tiktok" || s === "tiktok") return "tiktok";
  if (s === "flyer" || s === "qr" || u === "qr") return "qr";
  if (u || s) return "other";
  // No deep-link UTM — checkout resolves ios/android via Platform.OS
  return "";
}

function parseUrl(url: string): MobileAttribution {
  let utm_source: string | null = null;
  let utm_medium: string | null = null;
  let utm_campaign: string | null = null;
  let src: string | null = null;
  try {
    const parsed = Linking.parse(url);
    const q = (parsed.queryParams || {}) as Record<string, string | undefined>;
    utm_source = q.utm_source || null;
    utm_medium = q.utm_medium || null;
    utm_campaign = q.utm_campaign || null;
    src = q.src || null;
  } catch {
    /* ignore */
  }
  const channel = mapChannel(utm_source, src);
  const source_detail: Record<string, unknown> = {
    surface: "orderly-mobile",
    deep_link: url,
  };
  if (utm_source) source_detail.utm_source = utm_source;
  if (utm_medium) source_detail.utm_medium = utm_medium;
  if (utm_campaign) source_detail.utm_campaign = utm_campaign;
  if (src) source_detail.src = src;
  return {
    channel,
    source_detail,
    captured_at: new Date().toISOString(),
  };
}

/** First-touch: only set if nothing stored yet (unless force). */
export async function captureMobileAttributionFromUrl(
  url: string,
  opts?: { force?: boolean },
): Promise<MobileAttribution> {
  if (!opts?.force) {
    const existing = await getMobileAttribution();
    if (existing) return existing;
  }
  const attr = parseUrl(url);
  await AsyncStorage.setItem(KEY, JSON.stringify(attr));
  return attr;
}

export async function getMobileAttribution(): Promise<MobileAttribution | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as MobileAttribution;
  } catch {
    return null;
  }
}

/** Call from App mount: cold start URL + subscribe to future links. */
export function startMobileAttributionListener(): () => void {
  let sub: { remove: () => void } | null = null;
  void (async () => {
    try {
      const initial = await Linking.getInitialURL();
      if (initial) await captureMobileAttributionFromUrl(initial);
    } catch {
      /* ignore */
    }
  })();
  sub = Linking.addEventListener("url", (ev) => {
    void captureMobileAttributionFromUrl(ev.url);
  });
  return () => {
    try {
      sub?.remove();
    } catch {
      /* ignore */
    }
  };
}
