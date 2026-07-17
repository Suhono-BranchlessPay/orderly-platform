import React from "react";
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { Image, tenantLogo } from "../theme/images";
import { tokens, bodyFont } from "../theme/tokens";
import { tenant } from "../tenant";

type Props = {
  source: ReturnType<typeof tenantLogo> | { uri: string } | number | null;
  style?: StyleProp<ViewStyle>;
  /** Used for accessibility + letter mark when no photo. */
  label?: string;
  contentFit?: "cover" | "contain";
};

/**
 * Branded image slot — never a blank gray box.
 * Missing photo → soft primary wash + tenant logo (or letter).
 */
export function ImageFallback({
  source,
  style,
  label,
  contentFit = "cover",
}: Props) {
  const t = tenant.theme;
  if (source) {
    return (
      <Image
        source={source}
        style={style as object}
        contentFit={contentFit}
        accessibilityLabel={label ? `Photo of ${label}` : undefined}
      />
    );
  }

  const letter = (label || tenant.shortName || tenant.appName || "O")
    .trim()
    .charAt(0)
    .toUpperCase();

  return (
    <View
      style={[
        styles.fallback,
        { backgroundColor: t.primary },
        style,
      ]}
      accessibilityLabel={label ? `${label} (no photo)` : "Brand placeholder"}
    >
      <View style={[styles.wash, { backgroundColor: t.background }]} />
      <Image
        source={tenantLogo()}
        style={styles.logo}
        contentFit="contain"
      />
      <Text
        style={[
          styles.letter,
          { color: t.text, fontFamily: bodyFont() },
        ]}
      >
        {letter}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  wash: {
    ...StyleSheet.absoluteFill,
    opacity: 0.55,
  },
  logo: {
    width: "42%",
    height: "42%",
    opacity: 0.85,
  },
  letter: {
    position: "absolute",
    bottom: tokens.space.sm,
    right: tokens.space.sm,
    fontSize: tokens.type.caption,
    fontWeight: "700",
    opacity: 0.7,
  },
});
