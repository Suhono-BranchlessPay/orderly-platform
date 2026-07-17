import React from "react";
import { View, Text, Pressable, StyleSheet, Linking, ScrollView } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image, tenantLogo } from "../theme/images";
import { pickupAddressLine, tenant, deliveryEnabled, legalUrls } from "../tenant";
import { tokens, headingFont, bodyFont } from "../theme/tokens";
import type { RootStackParamList } from "../navigation";

export function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const t = tenant.theme;
  const links = legalUrls();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const phone = tenant.restaurant.phone;
  const hours = tenant.hours ?? [];

  const openLegal = (url: string, label: string) => {
    void Linking.openURL(url).catch(() => undefined);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.background }}
      contentContainerStyle={{
        paddingTop: insets.top + 8,
        paddingHorizontal: tokens.space.md,
        paddingBottom: insets.bottom + 32,
      }}
    >
      <View style={styles.header}>
        <Image source={tenantLogo()} style={styles.logo} contentFit="contain" />
        <Text
          style={[styles.title, { color: t.text, fontFamily: headingFont() }]}
          accessibilityRole="header"
        >
          {tenant.appName}
        </Text>
        <Text style={[styles.tag, { color: t.muted, fontFamily: bodyFont() }]}>
          {tenant.restaurant.tagline}
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: t.surface }]}>
        <Text style={[styles.label, { color: t.muted, fontFamily: bodyFont() }]}>
          Pickup at
        </Text>
        <Text style={[styles.value, { color: t.text, fontFamily: bodyFont() }]}>
          {pickupAddressLine()}
        </Text>
        <Text
          style={[
            styles.mode,
            { color: tokens.color.link, fontFamily: bodyFont() },
          ]}
        >
          {deliveryEnabled()
            ? "Pickup & delivery"
            : "Pickup only · Card checkout"}
        </Text>
      </View>

      {phone ? (
        <Pressable
          onPress={() => Linking.openURL(`tel:${phone}`)}
          style={[styles.card, { backgroundColor: t.surface }]}
          accessibilityRole="button"
          accessibilityLabel={`Call ${phone}`}
        >
          <Text style={[styles.label, { color: t.muted, fontFamily: bodyFont() }]}>
            Call restaurant
          </Text>
          <Text style={[styles.value, { color: t.accent, fontFamily: bodyFont() }]}>
            {phone}
          </Text>
        </Pressable>
      ) : null}

      {hours.length > 0 ? (
        <View style={[styles.card, { backgroundColor: t.surface }]}>
          <Text
            style={[
              styles.label,
              { color: t.muted, fontFamily: bodyFont(), marginBottom: 8 },
            ]}
          >
            Hours
          </Text>
          {hours.map((h) => (
            <View key={h.day} style={styles.hourRow}>
              <Text style={{ color: t.text, fontFamily: bodyFont(), flex: 1 }}>
                {h.day}
              </Text>
              <Text style={{ color: t.muted, fontFamily: bodyFont() }}>
                {h.hours}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <Pressable
        onPress={() => navigation.navigate("Restaurant")}
        style={[styles.linkBtn, { borderColor: t.muted }]}
        accessibilityRole="button"
      >
        <Text style={{ color: t.text, fontWeight: "700", fontFamily: bodyFont() }}>
          Restaurant details →
        </Text>
      </Pressable>

      <View style={[styles.legalBlock, { borderColor: t.muted }]}>
        <Text
          style={[
            styles.label,
            { color: t.muted, fontFamily: bodyFont(), marginBottom: 10 },
          ]}
        >
          Legal
        </Text>
        {(
          [
            ["Privacy Policy", links.privacy],
            ["Terms of Use", links.terms],
            ["Data deletion", links.dataDeletion],
          ] as const
        ).map(([label, url]) => (
          <Pressable
            key={label}
            onPress={() => openLegal(url, label)}
            accessibilityRole="link"
            accessibilityLabel={label}
            style={styles.legalRow}
          >
            <Text
              style={{
                color: tokens.color.link,
                fontWeight: "700",
                fontFamily: bodyFont(),
              }}
            >
              {label} →
            </Text>
          </Pressable>
        ))}
        <Text
          style={{
            color: t.muted,
            fontSize: 11,
            marginTop: 8,
            fontFamily: bodyFont(),
            lineHeight: 16,
          }}
        >
          Guest checkout only — no account login. Contact & order details are
          used to fulfill your pickup.
        </Text>
      </View>

      <Text
        style={[
          styles.footer,
          { color: t.muted, fontFamily: bodyFont() },
        ]}
      >
        Ordering powered by Orderly · {tenant.domain}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: "center", marginBottom: tokens.space.lg },
  logo: { width: 80, height: 80, marginBottom: 10 },
  title: { fontSize: 24, fontWeight: "700", textAlign: "center" },
  tag: { fontSize: 13, textAlign: "center", marginTop: 6, lineHeight: 18 },
  card: {
    borderRadius: tokens.radius.card,
    padding: tokens.space.md,
    marginBottom: tokens.space.sm,
  },
  label: { fontSize: 12, fontWeight: "600", marginBottom: 4 },
  value: { fontSize: 15, fontWeight: "600", lineHeight: 21 },
  mode: { fontSize: 12, fontWeight: "700", marginTop: 8 },
  hourRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  linkBtn: {
    marginTop: tokens.space.md,
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    paddingVertical: 14,
    alignItems: "center",
  },
  legalBlock: {
    marginTop: tokens.space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: tokens.space.md,
  },
  legalRow: {
    minHeight: tokens.touch.min,
    justifyContent: "center",
    marginBottom: 4,
  },
  footer: {
    textAlign: "center",
    fontSize: 11,
    marginTop: tokens.space.xl,
  },
});
