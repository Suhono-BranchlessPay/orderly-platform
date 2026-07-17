import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import {
  tokens,
  prefersReducedMotionSync,
  headingFont,
  bodyFont,
} from "../theme/tokens";

export function Skeleton({
  height = 16,
  width = "100%",
  style,
}: {
  height?: number;
  width?: number | `${number}%`;
  style?: ViewStyle;
}) {
  const opacity = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    if (prefersReducedMotionSync()) {
      opacity.setValue(0.45);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.85,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.35,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          height,
          width: width as number | `${number}%`,
          borderRadius: tokens.radius.sm,
          backgroundColor: tokens.color.primary,
          opacity,
        },
        style,
      ]}
    />
  );
}

export function MenuSkeletonList({ rows = 6 }: { rows?: number }) {
  const pairCount = Math.ceil(rows / 2);
  return (
    <View style={{ gap: tokens.space.md, marginTop: tokens.space.sm }}>
      <Skeleton height={168} width="100%" style={{ borderRadius: tokens.radius.card }} />
      <View style={{ flexDirection: "row", gap: tokens.space.md }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <View key={`b${i}`} style={{ alignItems: "center", gap: 6 }}>
            <Skeleton
              height={64}
              width={64}
              style={{ borderRadius: 32, backgroundColor: tokens.color.primary }}
            />
            <Skeleton height={10} width={56} />
          </View>
        ))}
      </View>
      {Array.from({ length: pairCount }).map((_, i) => (
        <View
          key={i}
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            gap: tokens.space.sm,
          }}
        >
          {[0, 1].map((j) => (
            <View
              key={j}
              style={{
                flex: 1,
                backgroundColor: tokens.color.surface,
                borderRadius: tokens.radius.card,
                overflow: "hidden",
              }}
            >
              <Skeleton height={160} width="100%" style={{ borderRadius: 0 }} />
              <View style={{ padding: tokens.space.sm, gap: 8 }}>
                <Skeleton height={14} width="80%" />
                <Skeleton height={12} width="60%" />
              </View>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

export function EmptyState({
  title,
  body,
}: {
  title: string;
  body?: string;
}) {
  return (
    <View style={styles.empty} accessibilityRole="text">
      <Text style={[styles.emptyTitle, { color: tokens.color.text, fontFamily: headingFont() }]}>
        {title}
      </Text>
      {body ? (
        <Text
          style={{
            color: tokens.color.muted,
            marginTop: 6,
            textAlign: "center",
            fontFamily: bodyFont(),
          }}
        >
          {body}
        </Text>
      ) : null}
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  loadingLabel,
  busy,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  loadingLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled || busy), busy: Boolean(busy) }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.cta,
        {
          backgroundColor: tokens.color.primary,
          opacity: disabled || busy ? 0.55 : pressed ? 0.88 : 1,
          minHeight: tokens.touch.min,
        },
      ]}
    >
      <Text style={[styles.ctaTxt, { fontFamily: bodyFont() }]}>
        {busy ? loadingLabel || "Please wait…" : label}
      </Text>
    </Pressable>
  );
}

export function MoneyRow({
  label,
  value,
  emphasize,
  muted,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  muted?: boolean;
}) {
  const color = emphasize
    ? tokens.color.text
    : muted
      ? tokens.color.muted
      : tokens.color.text;
  const style: TextStyle = emphasize
    ? { fontSize: 18, fontWeight: "700" }
    : { fontSize: 14, fontWeight: "500" };
  return (
    <View style={styles.moneyRow}>
      <Text style={[{ color, fontFamily: bodyFont() }, style]}>{label}</Text>
      <Text style={[{ color, fontFamily: bodyFont() }, style]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    paddingVertical: tokens.space.xl,
    paddingHorizontal: tokens.space.md,
    alignItems: "center",
  },
  emptyTitle: { fontSize: tokens.type.title, fontWeight: "700" },
  cta: {
    borderRadius: tokens.radius.lg,
    paddingVertical: 14,
    paddingHorizontal: tokens.space.md,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaTxt: {
    color: tokens.color.onPrimary,
    fontWeight: "700",
    fontSize: 16,
  },
  moneyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
  },
});
