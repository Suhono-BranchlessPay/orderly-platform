import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, Linking, ScrollView } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../api/client";
import { pickupAddressLine, tenant } from "../tenant";
import {
  normalizePickupStage,
  pickupEtaLabel,
  stageIndex,
  PICKUP_STEPS,
  type PickupStage,
} from "../lib/pickupEta";
import { PrimaryButton, Skeleton } from "../components/ui";
import { tokens, headingFont, bodyFont } from "../theme/tokens";
import { registerForPickupPush } from "../push";
import { rememberOrder } from "../lib/recentOrders";
import type { RootStackParamList } from "../navigation";

type Props = NativeStackScreenProps<RootStackParamList, "Confirmation">;

export function ConfirmationScreen({ route, navigation }: Props) {
  const { orderId, initialStatus } = route.params;
  const insets = useSafeAreaInsets();
  const t = tokens.color;
  const [stage, setStage] = useState<PickupStage>(
    normalizePickupStage(initialStatus || "pending"),
  );
  // These may be absent when opened from a push tap — hydrated on first poll.
  const [total, setTotal] = useState<number | null>(
    typeof route.params.total === "number" ? route.params.total : null,
  );
  const [pushOk, setPushOk] = useState<boolean | null>(null);

  useEffect(() => {
    void rememberOrder(orderId, total);
  }, [orderId, total]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const token = await registerForPickupPush();
      if (cancelled) return;
      if (!token) {
        setPushOk(false);
        return;
      }
      try {
        await api.registerPushToken(orderId, token);
        if (!cancelled) setPushOk(true);
      } catch {
        if (!cancelled) setPushOk(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const o = await api.getOrder(orderId);
        if (!cancelled) {
          setStage(normalizePickupStage(o.status));
          if (typeof o.total === "number") setTotal(o.total);
        }
      } catch {
        /* keep last known */
      }
    };
    tick();
    const id = setInterval(tick, 12_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [orderId]);

  const idx = stageIndex(stage);
  const shortId = orderId.slice(0, 8).toUpperCase();
  const phone = tenant.restaurant.phone?.replace(/\s/g, "") || "";
  const mapsQuery = encodeURIComponent(pickupAddressLine());

  const openMaps = () => {
    Linking.openURL(`https://maps.apple.com/?q=${mapsQuery}`);
  };
  const callRestaurant = () => {
    if (phone) Linking.openURL(`tel:${phone}`);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.background }}
      contentContainerStyle={[
        styles.root,
        { paddingTop: Math.max(insets.top, 48), paddingBottom: Math.max(insets.bottom, 24) },
      ]}
    >
      <Text
        style={[styles.title, { color: t.text, fontFamily: headingFont() }]}
        accessibilityRole="header"
      >
        {stage === "ready"
          ? "Ready for pickup"
          : stage === "completed"
            ? "Thanks for ordering"
            : "Order confirmed"}
      </Text>
      <Text style={{ color: t.muted }}>
        Pickup at {tenant.appName}
        {tenant.locationLabel ? ` · ${tenant.locationLabel}` : ""}
      </Text>
      <Text style={{ color: t.muted, marginTop: 4 }}>{pickupAddressLine()}</Text>

      <Text
        style={[styles.orderNum, { color: t.accent, fontFamily: headingFont() }]}
        accessibilityLabel={`Order number ${shortId.split("").join(" ")}`}
      >
        #{shortId}
      </Text>
      <Text style={{ color: t.muted, fontSize: 13, marginTop: 4 }}>
        Show this number at the counter
      </Text>
      {total != null ? (
        <Text
          style={{
            color: t.text,
            fontSize: 18,
            marginTop: 12,
            fontWeight: "600",
            fontFamily: bodyFont(),
          }}
        >
          Total ${total.toFixed(2)}
        </Text>
      ) : (
        <Skeleton height={20} width={120} style={{ marginTop: 12 }} />
      )}
      <Text style={{ color: t.primary, fontWeight: "700", marginTop: 10 }}>
        {pickupEtaLabel(stage)}
      </Text>

      <View style={styles.timeline}>
        {PICKUP_STEPS.map((step, i) => {
          const done = idx >= i && stage !== "cancelled";
          const current = idx === i && stage !== "completed" && stage !== "cancelled";
          return (
            <View key={step.key} style={styles.stepRow}>
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor: done ? t.primary : t.surface,
                    borderColor: current ? t.accent : done ? t.primary : t.muted,
                  },
                ]}
              />
              <Text
                style={{
                  color: done ? t.text : t.muted,
                  fontWeight: current ? "700" : "500",
                  fontSize: 15,
                }}
              >
                {step.label}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={openMaps}
          accessibilityRole="button"
          style={[styles.secondary, { borderColor: t.muted, minHeight: tokens.touch.min }]}
        >
          <Text style={{ color: t.text, fontWeight: "600" }}>Open maps</Text>
        </Pressable>
        {phone ? (
          <Pressable
            onPress={callRestaurant}
            accessibilityRole="button"
            style={[styles.secondary, { borderColor: t.muted, minHeight: tokens.touch.min }]}
          >
            <Text style={{ color: t.text, fontWeight: "600" }}>Call restaurant</Text>
          </Pressable>
        ) : null}
      </View>

      <Pressable
        onPress={() => navigation.navigate("Receipt", { orderId })}
        accessibilityRole="button"
        accessibilityLabel="View receipt for this order"
        style={[styles.badge, { borderColor: t.accent }]}
      >
        <Text style={{ color: t.text, fontWeight: "600", fontFamily: bodyFont() }}>
          Order confirmed
        </Text>
        <Text style={{ color: t.primary, marginTop: 6, fontWeight: "700" }}>
          View receipt →
        </Text>
      </Pressable>

      <Text style={{ color: t.muted, fontSize: 12, marginTop: 20, lineHeight: 18 }}>
        {pushOk === true
          ? "We will send a push notification when your order is ready for pickup."
          : pushOk === false
            ? "Push alerts need notification permission (and a native/EAS build). You can still watch status on this screen."
            : "Checking notification permission…"}
      </Text>

      <View style={{ marginTop: 28 }}>
        <PrimaryButton label="Back to menu" onPress={() => navigation.popToTop()} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: 20 },
  title: { fontSize: tokens.type.hero, fontWeight: "700" },
  orderNum: {
    fontSize: tokens.type.orderNumber,
    fontWeight: "800",
    marginTop: 20,
    letterSpacing: 1,
  },
  timeline: { marginTop: 28, gap: 14 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 24 },
  secondary: {
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    paddingHorizontal: 16,
    paddingVertical: 10,
    justifyContent: "center",
  },
  badge: {
    marginTop: 24,
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    padding: 14,
  },
});
