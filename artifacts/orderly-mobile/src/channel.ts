import { Platform } from "react-native";

/** Native store channel for orders.channel (never invent web here). */
export function mobileOrderChannel(): "ios" | "android" {
  return Platform.OS === "ios" ? "ios" : "android";
}

/**
 * Prefer deep-link UTM channel (instagram/facebook/…) when present;
 * otherwise native store channel.
 */
export function resolveCheckoutChannel(attrChannel?: string | null): string {
  const c = (attrChannel || "").trim().toLowerCase();
  if (c && c !== "other") return c;
  return mobileOrderChannel();
}
