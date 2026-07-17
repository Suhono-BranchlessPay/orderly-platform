import React, { useRef } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  useWindowDimensions,
} from "react-native";
import type { MenuItem } from "../api/client";
import { resolveMenuImage } from "../theme/images";
import { ImageFallback } from "./ImageFallback";
import { StarRating } from "./StarRating";
import {
  tokens,
  prefersReducedMotionSync,
  bodyFont,
  headingFont,
} from "../theme/tokens";
import { tenant } from "../tenant";

type Props = {
  item: MenuItem;
  onPress: () => void;
  onQuickAdd: () => void;
  badge?: string | null;
};

function ingredientSnippet(description?: string | null): string | null {
  if (!description?.trim()) return null;
  // Prefer short ingredient-style lines; strip parentheses noise for cards.
  const cleaned = description
    .replace(/[()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= 56) return cleaned;
  return `${cleaned.slice(0, 53).trim()}…`;
}

export function ProductCard({ item, onPress, onQuickAdd, badge }: Props) {
  const t = tenant.theme;
  const { width } = useWindowDimensions();
  const cardW = (width - tokens.space.md * 2 - tokens.space.sm) / 2;
  const scale = useRef(new Animated.Value(1)).current;
  const img = resolveMenuImage(item.name, item.imageUrl);
  const snippet = ingredientSnippet(item.description);

  const pressIn = () => {
    if (prefersReducedMotionSync()) return;
    Animated.spring(scale, {
      toValue: 0.96,
      useNativeDriver: true,
      friction: 7,
    }).start();
  };
  const pressOut = () => {
    if (prefersReducedMotionSync()) {
      scale.setValue(1);
      return;
    }
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      friction: 7,
    }).start();
  };

  return (
    <Animated.View style={{ width: cardW, transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}, $${item.price.toFixed(2)}`}
        accessibilityHint="Opens item details"
        style={[
          styles.card,
          {
            backgroundColor: t.surface,
            borderRadius: tokens.radius.card,
            ...tokens.shadow.card,
          },
        ]}
      >
        <View style={styles.media}>
          <ImageFallback
            source={img}
            label={item.name}
            style={styles.photo}
          />
          <Text
            style={[
              styles.priceTag,
              { fontFamily: bodyFont(), backgroundColor: "rgba(0,0,0,0.55)" },
            ]}
          >
            ${item.price.toFixed(2)}
          </Text>
          {badge ? (
            <View style={[styles.badge, { backgroundColor: t.primary }]}>
              <Text style={styles.badgeTxt}>{badge}</Text>
            </View>
          ) : null}
          <Pressable
            onPress={onQuickAdd}
            accessibilityRole="button"
            accessibilityLabel={`Quick add ${item.name}`}
            hitSlop={8}
            style={[styles.plus, { backgroundColor: t.primary }]}
          >
            <Text style={styles.plusTxt}>+</Text>
          </Pressable>
        </View>
        <View style={styles.body}>
          <Text
            style={[styles.name, { color: t.text, fontFamily: headingFont() }]}
            numberOfLines={2}
          >
            {item.name}
          </Text>
          <StarRating
            ratingValue={item.ratingValue}
            reviewCount={item.reviewCount}
          />
          {snippet ? (
            <Text
              style={[styles.snip, { color: t.muted, fontFamily: bodyFont() }]}
              numberOfLines={2}
            >
              {snippet}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { overflow: "hidden", marginBottom: tokens.space.sm },
  media: {
    width: "100%",
    aspectRatio: 1,
    backgroundColor: tokens.color.background,
  },
  photo: { width: "100%", height: "100%" },
  priceTag: {
    position: "absolute",
    top: tokens.space.sm,
    left: tokens.space.sm,
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: tokens.radius.sm,
    overflow: "hidden",
  },
  badge: {
    position: "absolute",
    top: tokens.space.sm,
    right: tokens.space.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: tokens.radius.sm,
  },
  badgeTxt: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  plus: {
    position: "absolute",
    right: tokens.space.sm,
    bottom: tokens.space.sm,
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  plusTxt: { color: "#fff", fontSize: 22, fontWeight: "700", marginTop: -2 },
  body: { padding: tokens.space.sm, gap: 2, minHeight: 72 },
  name: { fontSize: 14, fontWeight: "700" },
  snip: { fontSize: 11, lineHeight: 15, marginTop: 2 },
});
