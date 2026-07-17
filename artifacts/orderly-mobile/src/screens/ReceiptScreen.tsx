import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, type OrderLineDto } from "../api/client";
import { pickupAddressLine, tenant } from "../tenant";
import { EmptyState, MoneyRow, PrimaryButton, Skeleton } from "../components/ui";
import { tokens, headingFont, bodyFont } from "../theme/tokens";
import type { RootStackParamList } from "../navigation";

type Props = NativeStackScreenProps<RootStackParamList, "Receipt">;

function formatWhen(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Human-readable pickup receipt — no explorer / chain UI. */
export function ReceiptScreen({ route, navigation }: Props) {
  const { orderId } = route.params;
  const insets = useSafeAreaInsets();
  const t = tenant.theme;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [items, setItems] = useState<OrderLineDto[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const o = await api.getOrder(orderId);
        if (cancelled) return;
        setTotal(typeof o.total === "number" ? o.total : null);
        setCreatedAt(o.createdAt ?? null);
        setStatus(o.status ?? null);
        setItems(Array.isArray(o.items) ? o.items : []);
        setError(false);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const shortId = orderId.slice(0, 8).toUpperCase();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.background }}
      contentContainerStyle={[
        styles.root,
        {
          paddingTop: Math.max(insets.top, 16),
          paddingBottom: Math.max(insets.bottom, 24),
        },
      ]}
    >
      <Text
        style={[styles.title, { color: t.text, fontFamily: headingFont() }]}
        accessibilityRole="header"
      >
        Receipt
      </Text>
      <Text style={{ color: t.muted, fontFamily: bodyFont() }}>
        {tenant.appName}
        {tenant.locationLabel ? ` · ${tenant.locationLabel}` : ""}
      </Text>
      <Text style={{ color: t.muted, marginTop: 4, fontFamily: bodyFont() }}>
        {pickupAddressLine()}
      </Text>
      <Text
        style={[styles.orderNum, { color: t.accent, fontFamily: headingFont() }]}
      >
        #{shortId}
      </Text>
      {createdAt ? (
        <Text style={{ color: t.muted, fontSize: 13, fontFamily: bodyFont() }}>
          {formatWhen(createdAt)}
          {status ? ` · ${status}` : ""}
        </Text>
      ) : null}

      {loading ? (
        <View style={{ marginTop: 24, gap: 10 }}>
          <Skeleton height={18} />
          <Skeleton height={18} />
          <Skeleton height={18} width="60%" />
        </View>
      ) : error ? (
        <View style={{ marginTop: 24 }}>
          <EmptyState
            title="Receipt unavailable"
            body="Pull to refresh from Orders, or ask the restaurant for help with this order number."
          />
        </View>
      ) : (
        <View style={{ marginTop: 24 }}>
          <Text
            style={[
              styles.section,
              { color: t.text, fontFamily: headingFont() },
            ]}
          >
            Items
          </Text>
          {items.length === 0 ? (
            <Text style={{ color: t.muted, fontFamily: bodyFont() }}>
              Line items will appear here when available.
            </Text>
          ) : (
            items.map((line) => {
              const name = line.menuItemName || "Item";
              const qty = line.quantity ?? 1;
              const lineTotal =
                typeof line.subtotal === "number"
                  ? line.subtotal
                  : (line.unitPrice ?? 0) * qty;
              return (
                <View key={line.id || `${name}-${qty}`} style={styles.line}>
                  <MoneyRow
                    label={`${qty}× ${name}`}
                    value={`$${lineTotal.toFixed(2)}`}
                    muted
                  />
                  {line.specialInstructions ? (
                    <Text
                      style={{
                        color: t.muted,
                        fontSize: 12,
                        marginTop: -4,
                        marginBottom: 8,
                        fontFamily: bodyFont(),
                      }}
                    >
                      {line.specialInstructions}
                    </Text>
                  ) : null}
                </View>
              );
            })
          )}
          {total != null ? (
            <View style={{ marginTop: 12 }}>
              <MoneyRow
                label="Total"
                value={`$${total.toFixed(2)}`}
                emphasize
              />
            </View>
          ) : null}
          <Text
            style={{
              color: t.muted,
              fontSize: 12,
              marginTop: 16,
              lineHeight: 18,
              fontFamily: bodyFont(),
            }}
          >
            Pickup order · Show #{shortId} at the counter. Keep this receipt for
            your records.
          </Text>
        </View>
      )}

      <View style={{ marginTop: 28 }}>
        <PrimaryButton label="Done" onPress={() => navigation.goBack()} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: 20 },
  title: { fontSize: 26, fontWeight: "700" },
  orderNum: {
    fontSize: tokens.type.orderNumber,
    fontWeight: "800",
    marginTop: 16,
    letterSpacing: 1,
  },
  section: { fontSize: 17, fontWeight: "700", marginBottom: 10 },
  line: { marginBottom: 4 },
});
