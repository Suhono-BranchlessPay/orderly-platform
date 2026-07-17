import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { tokens, bodyFont } from "../theme/tokens";
import { tenant } from "../tenant";

type Props = {
  ratingValue?: number | string | null;
  reviewCount?: number | string | null;
};

/**
 * Full rating UI — rendered only when reviewCount > 0.
 * Never invent stars from placeholders.
 */
export function StarRating({ ratingValue, reviewCount }: Props) {
  const count = Number(reviewCount);
  const value = Number(ratingValue);
  if (!Number.isFinite(count) || count <= 0) return null;
  if (!Number.isFinite(value) || value <= 0) return null;

  const filled = Math.max(0, Math.min(5, Math.round(value)));
  const t = tenant.theme;

  return (
    <View style={styles.row} accessibilityLabel={`Rated ${value} from ${count} reviews`}>
      <Text style={[styles.stars, { color: t.accent }]}>
        {"★".repeat(filled)}
        {"☆".repeat(5 - filled)}
      </Text>
      <Text style={[styles.meta, { color: t.muted, fontFamily: bodyFont() }]}>
        {value.toFixed(1)} ({count.toLocaleString()})
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  stars: { fontSize: 11, letterSpacing: 1 },
  meta: { fontSize: tokens.type.caption },
});
