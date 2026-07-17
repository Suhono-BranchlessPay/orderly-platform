import React from "react";
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { Image, tenantLogo } from "../theme/images";
import { tokens, bodyFont, headingFont } from "../theme/tokens";
import { tenant } from "../tenant";

type Props = {
  source: ReturnType<typeof tenantLogo> | { uri: string } | number | null;
  style?: StyleProp<ViewStyle>;
  /** Used for accessibility + caption when no photo. */
  label?: string;
  contentFit?: "cover" | "contain";
};

/**
 * Branded image slot — never a blank gray box.
 * Missing photo → primary brand wash + logo + item name.
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
      <View style={[styles.accentBar, { backgroundColor: t.accent }]} />
      <Image
        source={tenantLogo()}
        style={styles.logo}
        contentFit="contain"
      />
      {label ? (
        <Text
          style={[
            styles.caption,
            { color: t.text, fontFamily: headingFont() },
          ]}
          numberOfLines={2}
        >
          {label}
        </Text>
      ) : (
        <Text
          style={[
            styles.letter,
            { color: t.text, fontFamily: bodyFont() },
          ]}
        >
          {letter}
        </Text>
      )}
      <Text
        style={[
          styles.brandHint,
          { color: t.muted, fontFamily: bodyFont() },
        ]}
      >
        {tenant.shortName || tenant.appName}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: tokens.space.sm,
  },
  wash: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.62,
  },
  accentBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  logo: {
    width: "38%",
    height: "38%",
    maxWidth: 88,
    maxHeight: 88,
    opacity: 0.9,
  },
  caption: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
    opacity: 0.92,
  },
  letter: {
    marginTop: 6,
    fontSize: tokens.type.caption,
    fontWeight: "700",
    opacity: 0.7,
  },
  brandHint: {
    position: "absolute",
    bottom: tokens.space.sm,
    fontSize: 10,
    fontWeight: "600",
    opacity: 0.75,
  },
});
