import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import type { MenuItem } from "../api/client";
import { resolveMenuImage } from "../theme/images";
import { ImageFallback } from "./ImageFallback";
import {
  tokens,
  prefersReducedMotionSync,
  bodyFont,
  headingFont,
} from "../theme/tokens";
import { tenant } from "../tenant";

type Props = {
  items: MenuItem[];
  onSelect: (item: MenuItem) => void;
};

/**
 * Generic promo/best-seller carousel (Handoff HeroSlot).
 * Deep-links to a menu item — not hard-coded reservations.
 */
export function HeroSlot({ items, onSelect }: Props) {
  const t = tenant.theme;
  const { width } = useWindowDimensions();
  const slideW = width - tokens.space.md * 2;
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const slides = items.slice(0, 5);

  useEffect(() => {
    if (slides.length < 2 || prefersReducedMotionSync()) return;
    const id = setInterval(() => {
      setIndex((i) => {
        const next = (i + 1) % slides.length;
        scrollRef.current?.scrollTo({ x: next * (slideW + tokens.space.sm), animated: true });
        return next;
      });
    }, 4500);
    return () => clearInterval(id);
  }, [slides.length, slideW]);

  if (slides.length === 0) return null;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const i = Math.round(x / (slideW + tokens.space.sm));
    if (i !== index && i >= 0 && i < slides.length) setIndex(i);
  };

  return (
    <View style={styles.wrap}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled={false}
        decelerationRate="fast"
        snapToInterval={slideW + tokens.space.sm}
        snapToAlignment="start"
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ gap: tokens.space.sm }}
      >
        {slides.map((item) => {
          const img = resolveMenuImage(item.name, item.imageUrl);
          return (
            <Pressable
              key={item.id}
              onPress={() => onSelect(item)}
              accessibilityRole="button"
              accessibilityLabel={`Featured: ${item.name}`}
              style={[
                styles.slide,
                {
                  width: slideW,
                  backgroundColor: t.surface,
                  borderRadius: tokens.radius.card,
                  ...tokens.shadow.card,
                },
              ]}
            >
              <ImageFallback
                source={img}
                label={item.name}
                style={styles.photo}
              />
              <View style={styles.overlay} />
              <View style={styles.copy}>
                <Text
                  style={[
                    styles.eyebrow,
                    { color: t.accent, fontFamily: bodyFont() },
                  ]}
                >
                  Popular now
                </Text>
                <Text
                  style={[
                    styles.headline,
                    { color: "#fff", fontFamily: headingFont() },
                  ]}
                  numberOfLines={2}
                >
                  {item.name}
                </Text>
                <View
                  style={[styles.cta, { backgroundColor: t.accent }]}
                >
                  <Text style={styles.ctaTxt}>
                    Order · ${item.price.toFixed(2)}
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      {slides.length > 1 ? (
        <View style={styles.dots}>
          {slides.map((s, i) => (
            <View
              key={s.id}
              style={[
                styles.dot,
                {
                  backgroundColor: i === index ? t.primary : t.muted,
                  opacity: i === index ? 1 : 0.4,
                },
              ]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: tokens.space.lg },
  slide: {
    height: 168,
    overflow: "hidden",
  },
  photo: { ...StyleSheet.absoluteFill },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.42)",
  },
  copy: {
    flex: 1,
    justifyContent: "flex-end",
    padding: tokens.space.md,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  headline: { fontSize: 22, fontWeight: "700", marginBottom: 10 },
  cta: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: tokens.radius.sm,
  },
  ctaTxt: { color: "#111", fontWeight: "800", fontSize: 13 },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginTop: tokens.space.sm,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
