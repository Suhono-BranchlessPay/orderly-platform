import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../api/client";
import { listRecentOrders, type RecentOrderRef } from "../lib/recentOrders";
import { EmptyState, Skeleton } from "../components/ui";
import { tenant } from "../tenant";
import { tokens, headingFont, bodyFont } from "../theme/tokens";
import type { RootStackParamList } from "../navigation";

type Row = RecentOrderRef & {
  status?: string | null;
  liveTotal?: number | null;
};

export function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const t = tenant.theme;
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const recent = await listRecentOrders();
      const hydrated = await Promise.all(
        recent.map(async (r) => {
          try {
            const o = await api.getOrder(r.orderId);
            return {
              ...r,
              status: o.status,
              liveTotal: typeof o.total === "number" ? o.total : r.total,
            };
          } catch {
            return { ...r, status: null, liveTotal: r.total };
          }
        }),
      );
      setRows(hydrated);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: t.background, paddingTop: insets.top + 8 },
      ]}
    >
      <Text
        style={[styles.title, { color: t.text, fontFamily: headingFont() }]}
        accessibilityRole="header"
      >
        Orders
      </Text>
      <Text style={[styles.sub, { color: t.muted, fontFamily: bodyFont() }]}>
        Pickup orders from this device. Tap to track status.
      </Text>

      {loading && rows.length === 0 ? (
        <View style={{ gap: 12, marginTop: 12 }}>
          <Skeleton height={72} width="100%" />
          <Skeleton height={72} width="100%" />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.orderId}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={load} tintColor={t.primary} />
          }
          contentContainerStyle={{
            paddingBottom: insets.bottom + 24,
            flexGrow: 1,
          }}
          ListEmptyComponent={
            <EmptyState
              title="No orders yet"
              body="Place a pickup order from Home — it will show up here so you can track it."
            />
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                navigation.navigate("Confirmation", {
                  orderId: item.orderId,
                  total: item.liveTotal,
                  initialStatus: item.status,
                })
              }
              style={[styles.card, { backgroundColor: t.surface }]}
              accessibilityRole="button"
              accessibilityLabel={`Order ${item.orderId.slice(0, 8)}`}
            >
              <Text
                style={[styles.orderId, { color: t.text, fontFamily: bodyFont() }]}
                numberOfLines={1}
              >
                #{item.orderId.slice(0, 8).toUpperCase()}
              </Text>
              <Text style={{ color: t.muted, fontFamily: bodyFont(), fontSize: 13 }}>
                {item.status
                  ? item.status.replace(/_/g, " ")
                  : "Tap to refresh status"}
              </Text>
              {typeof item.liveTotal === "number" ? (
                <Text
                  style={{
                    color: t.accent,
                    fontWeight: "800",
                    marginTop: 4,
                    fontFamily: bodyFont(),
                  }}
                >
                  ${item.liveTotal.toFixed(2)}
                </Text>
              ) : null}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: tokens.space.md },
  title: { fontSize: 26, fontWeight: "700" },
  sub: { fontSize: 13, marginTop: 4, marginBottom: tokens.space.md },
  card: {
    borderRadius: tokens.radius.card,
    padding: tokens.space.md,
    marginBottom: tokens.space.sm,
  },
  orderId: { fontSize: 16, fontWeight: "700", marginBottom: 2 },
});
