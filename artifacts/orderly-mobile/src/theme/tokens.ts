/**
 * Design tokens from tenant config — white-label, not a hardcoded look.
 * Screens should prefer these over magic numbers.
 *
 * D5 Fonts (pilot Samurai): heading = PlayfairDisplay (serif), body = DMSans.
 *     Do not swap per-screen; load aliases in App.tsx only.
 * D6 Theme: Samurai / Linton = dark locked (`userInterfaceStyle: dark`).
 *     Kirin = light. No in-app appearance toggle for the pilot.
 */
import { AccessibilityInfo } from "react-native";
import * as Font from "expo-font";
import { tenant } from "../tenant";

export type DesignTokens = {
  color: {
    primary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
    muted: string;
    danger: string;
    onPrimary: string;
    /** AA-safe text links (prefer over primary for small body copy). */
    link: string;
  };
  space: { xs: number; sm: number; md: number; lg: number; xl: number };
  radius: { sm: number; md: number; lg: number; card: number; pill: number };
  shadow: {
    card: {
      shadowColor: string;
      shadowOpacity: number;
      shadowRadius: number;
      shadowOffset: { width: number; height: number };
      elevation: number;
    };
  };
  type: {
    hero: number;
    title: number;
    body: number;
    caption: number;
    orderNumber: number;
  };
  touch: { min: number };
  motion: { duration: number };
};

const theme = tenant.theme as typeof tenant.theme & {
  radiusMd?: number;
  spaceMd?: number;
  danger?: string;
  fontHeading?: string;
  fontBody?: string;
};

export const tokens: DesignTokens = {
  color: {
    primary: theme.primary,
    accent: theme.accent,
    background: theme.background,
    surface: theme.surface,
    text: theme.text,
    muted: theme.muted,
    danger: theme.danger ?? "#f87171",
    onPrimary: "#FFFFFF",
    // Primary red on Samurai dark fails AA for normal text (~4.0:1).
    // Accent/gold (or Kirin darkened gold) is used for inline links.
    link: theme.accent,
  },
  space: {
    xs: 4,
    sm: 8,
    md: theme.spaceMd ?? 16,
    lg: 24,
    xl: 32,
  },
  radius: {
    sm: 8,
    md: theme.radiusMd ?? 12,
    lg: 16,
    /** Visual Food Feed product cards — Handoff ~16px */
    card: 16,
    pill: 999,
  },
  shadow: {
    card: {
      shadowColor: "#000",
      shadowOpacity: 0.28,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 5,
    },
  },
  type: {
    hero: 28,
    title: 22,
    body: 15,
    caption: 12,
    orderNumber: 36,
  },
  touch: { min: 44 },
  motion: { duration: 220 },
};

/**
 * Custom brand fonts (white-label, from tenant config theme.fontHeading/fontBody).
 * Returns the family name ONLY when it has actually been loaded (via App.tsx
 * useFonts), so a tenant whose font isn't bundled falls back to the system font
 * instead of referencing an unknown family. Apply inline at render time (not in
 * StyleSheet.create, which is evaluated before fonts finish loading).
 */
export const fontFamilies = {
  heading: theme.fontHeading,
  body: theme.fontBody,
};

export function headingFont(): string | undefined {
  const n = fontFamilies.heading;
  return n && Font.isLoaded(n) ? n : undefined;
}

export function bodyFont(): string | undefined {
  const n = fontFamilies.body;
  return n && Font.isLoaded(n) ? n : undefined;
}

let reduceMotionCached: boolean | null = null;

export function prefersReducedMotionSync(): boolean {
  return reduceMotionCached === true;
}

/** Call once at app start; caches AccessibilityInfo. */
export function startReducedMotionListener(): () => void {
  let sub: { remove: () => void } | undefined;
  AccessibilityInfo.isReduceMotionEnabled().then((v) => {
    reduceMotionCached = v;
  });
  sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (v) => {
    reduceMotionCached = v;
  });
  return () => sub?.remove();
}
