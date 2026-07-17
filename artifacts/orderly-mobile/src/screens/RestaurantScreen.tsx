import React from "react";
import { View, Text, Pressable, StyleSheet, Linking, ScrollView } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Image, tenantLogo } from "../theme/images";
import { pickupAddressLine, tenant } from "../tenant";
import { tokens } from "../theme/tokens";
import type { RootStackParamList } from "../navigation";

type Props = NativeStackScreenProps<RootStackParamList, "Restaurant">;

export function RestaurantScreen(_props: Props) {
  const t = tenant.theme;
  const phone = tenant.restaurant.phone;
  const address = pickupAddressLine();
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.background }}
      contentContainerStyle={styles.root}
    >
      <Image source={tenantLogo()} style={styles.logo} contentFit="contain" />
      <Text style={[styles.title, { color: t.text }]}>{tenant.appName}</Text>
      <Text style={{ color: t.accent, fontWeight: "600", marginBottom: 8 }}>
        {tenant.locationLabel}
      </Text>
      <Text style={{ color: t.muted, textAlign: "center", marginBottom: 20 }}>
        {tenant.restaurant.tagline}
      </Text>

      <View style={[styles.card, { backgroundColor: t.surface }]}>
        <Text style={[styles.label, { color: t.muted }]}>Pickup address</Text>
        <Text style={{ color: t.text, fontSize: 16 }}>{address}</Text>
        <Pressable onPress={() => Linking.openURL(maps)} style={{ marginTop: 10 }}>
          <Text style={{ color: tokens.color.link, fontWeight: "600" }}>Open in Maps →</Text>
        </Pressable>
      </View>

      {phone ? (
        <View style={[styles.card, { backgroundColor: t.surface }]}>
          <Text style={[styles.label, { color: t.muted }]}>Phone</Text>
          <Pressable onPress={() => Linking.openURL(`tel:${phone}`)}>
            <Text style={{ color: t.text, fontSize: 16 }}>{phone}</Text>
          </Pressable>
        </View>
      ) : null}

      {(tenant.hours?.length ?? 0) > 0 && (
        <View style={[styles.card, { backgroundColor: t.surface }]}>
          <Text style={[styles.label, { color: t.muted }]}>Hours</Text>
          {tenant.hours!.map((h) => (
            <View key={h.day} style={styles.hourRow}>
              <Text style={{ color: t.text }}>{h.day}</Text>
              <Text style={{ color: t.muted }}>{h.hours}</Text>
            </View>
          ))}
        </View>
      )}

      <Text style={{ color: t.muted, fontSize: 12, marginTop: 16, textAlign: "center" }}>
        Online ordering: pickup only. Delivery returns after Stripe Connect is live.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { padding: 20, paddingBottom: 40, alignItems: "center" },
  logo: { width: 96, height: 96, marginBottom: 12 },
  title: { fontSize: 24, fontWeight: "700", textAlign: "center" },
  card: {
    width: "100%",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  label: { fontSize: 12, marginBottom: 6, textTransform: "uppercase" },
  hourRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
});
