import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { api, type UpsellSuggestion } from "../api/client";
import { useCart } from "../state/cart";
import { tokens } from "../theme/tokens";

/** C4 co-occurrence upsell — skippable; empty when history is thin. */
export function UpsellSuggestions() {
  const { lines, addItem } = useCart();
  const [suggestions, setSuggestions] = useState<UpsellSuggestion[]>([]);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (lines.length === 0) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    api
      .upsellSuggestions(
        lines.map((l) => l.menuItemId),
        3,
      )
      .then((res) => {
        if (!cancelled) setSuggestions(res.suggestions ?? []);
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [lines]);

  if (hidden || suggestions.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: tokens.color.text }]}>
          Often ordered together
        </Text>
        <Pressable
          onPress={() => setHidden(true)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Skip suggestions"
          style={{ minHeight: tokens.touch.min, justifyContent: "center" }}
        >
          <Text style={{ color: tokens.color.muted, fontSize: 13 }}>Skip</Text>
        </Pressable>
      </View>
      {suggestions.map((s) => (
        <View key={s.menu_item_id} style={[styles.row, { backgroundColor: tokens.color.surface }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: tokens.color.text, fontWeight: "600" }}>{s.name}</Text>
            <Text style={{ color: tokens.color.muted, fontSize: 12, marginTop: 2 }}>
              ${(s.price_cents / 100).toFixed(2)}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Add ${s.name}, $${(s.price_cents / 100).toFixed(2)}`}
            onPress={() =>
              addItem(
                {
                  id: s.menu_item_id,
                  name: s.name,
                  price: s.price_cents / 100,
                },
                1,
              )
            }
            style={[styles.add, { backgroundColor: tokens.color.primary, minHeight: tokens.touch.min }]}
          >
            <Text style={{ color: tokens.color.onPrimary, fontWeight: "700" }}>Add</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: tokens.space.md, marginBottom: tokens.space.sm },
  head: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: tokens.space.sm,
  },
  title: { fontSize: 15, fontWeight: "700" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: tokens.space.sm,
    borderRadius: tokens.radius.md,
    marginBottom: 8,
  },
  add: {
    paddingHorizontal: 14,
    borderRadius: tokens.radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
});
