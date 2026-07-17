import React, { useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Animated,
} from "react-native";
import { ImageFallback } from "./ImageFallback";
import {
  tokens,
  prefersReducedMotionSync,
  bodyFont,
  headingFont,
} from "../theme/tokens";
import { tenant } from "../tenant";

export type CategoryBubble = {
  id: string;
  name: string;
  /** Thumbnail source (first item photo or null → brand fallback). */
  image: ReturnType<typeof import("../theme/images").resolveMenuImage>;
  highlight?: boolean;
};

type Props = {
  categories: CategoryBubble[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};

export function CategoryCarousel({
  categories,
  selectedId,
  onSelect,
}: Props) {
  const t = tenant.theme;

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text
          style={[styles.title, { color: t.text, fontFamily: headingFont() }]}
        >
          Categories
        </Text>
        {selectedId ? (
          <Pressable onPress={() => onSelect(null)} hitSlop={8}>
            <Text style={{ color: t.accent, fontFamily: bodyFont(), fontSize: 13 }}>
              See all →
            </Text>
          </Pressable>
        ) : (
          <Text style={{ color: t.muted, fontFamily: bodyFont(), fontSize: 13 }}>
            Scroll →
          </Text>
        )}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {categories.map((c) => (
          <Bubble
            key={c.id}
            cat={c}
            selected={selectedId === c.id}
            onPress={() => onSelect(selectedId === c.id ? null : c.id)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function Bubble({
  cat,
  selected,
  onPress,
}: {
  cat: CategoryBubble;
  selected: boolean;
  onPress: () => void;
}) {
  const t = tenant.theme;
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        if (!prefersReducedMotionSync()) {
          Animated.spring(scale, {
            toValue: 0.96,
            useNativeDriver: true,
            friction: 7,
          }).start();
        }
      }}
      onPressOut={() => {
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          friction: 7,
        }).start();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`Category ${cat.name}`}
      style={styles.bubbleWrap}
    >
      <Animated.View style={{ transform: [{ scale }], alignItems: "center" }}>
        <View
          style={[
            styles.ring,
            {
              borderColor: selected || cat.highlight ? t.primary : "transparent",
            },
          ]}
        >
          <ImageFallback
            source={cat.image}
            label={cat.name}
            style={styles.thumb}
          />
        </View>
        <Text
          style={[
            styles.label,
            {
              color: selected ? t.text : t.muted,
              fontFamily: bodyFont(),
              fontWeight: selected ? "700" : "500",
            },
          ]}
          numberOfLines={2}
        >
          {cat.name}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: tokens.space.md },
  head: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: tokens.space.sm,
    paddingHorizontal: 2,
  },
  title: { fontSize: 17, fontWeight: "700" },
  row: { gap: tokens.space.md, paddingRight: tokens.space.md },
  bubbleWrap: { width: 76, alignItems: "center" },
  ring: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 2.5,
    padding: 2,
    marginBottom: 6,
  },
  thumb: {
    width: "100%",
    height: "100%",
    borderRadius: 32,
    overflow: "hidden",
  },
  label: { fontSize: 11, textAlign: "center", lineHeight: 14 },
});
