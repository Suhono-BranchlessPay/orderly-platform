import React from "react";
import { View, Text, Pressable, StyleSheet, FlatList } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCart } from "../state/cart";
import { EmptyState, MoneyRow, PrimaryButton } from "../components/ui";
import { UpsellSuggestions } from "../components/UpsellSuggestions";
import { tokens, headingFont, bodyFont } from "../theme/tokens";
import type { RootStackParamList } from "../navigation";

type Props = NativeStackScreenProps<RootStackParamList, "Cart">;

export function CartScreen({ navigation }: Props) {
  const { lines, setQty, remove, subtotal } = useCart();
  const insets = useSafeAreaInsets();
  const t = tokens.color;
  const tax = subtotal * 0.07;
  const total = subtotal + tax;
  const footerPad = Math.max(insets.bottom, 12) + 20;

  return (
    <View style={[styles.root, { backgroundColor: t.background }]}>
      <Text
        style={[styles.title, { color: t.text, fontFamily: headingFont() }]}
        accessibilityRole="header"
      >
        Your cart
      </Text>
      {lines.length === 0 ? (
        <EmptyState
          title="Cart is empty"
          body="Add something from the menu — pickup when you are ready."
        />
      ) : (
        <FlatList
          data={lines}
          keyExtractor={(l) => l.menuItemId + (l.specialInstructions ?? "")}
          contentContainerStyle={{ paddingBottom: 16 }}
          style={{ flex: 1 }}
          ListFooterComponent={<UpsellSuggestions />}
          renderItem={({ item }) => (
            <View style={[styles.row, { backgroundColor: t.surface }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontWeight: "600", fontFamily: bodyFont() }}>
                  {item.name}
                </Text>
                <Text style={{ color: t.muted }}>
                  ${item.unitPrice.toFixed(2)} × {item.quantity}
                </Text>
              </View>
              <View style={styles.qty}>
                <Pressable
                  onPress={() => setQty(item.menuItemId, item.quantity - 1)}
                  style={styles.qtyHit}
                  accessibilityRole="button"
                  accessibilityLabel="Decrease quantity"
                >
                  <Text style={[styles.qtyBtn, { color: t.text }]}>−</Text>
                </Pressable>
                <Text
                  style={{ color: t.text, minWidth: 24, textAlign: "center" }}
                  accessibilityLabel={`Quantity ${item.quantity}`}
                >
                  {item.quantity}
                </Text>
                <Pressable
                  onPress={() => setQty(item.menuItemId, item.quantity + 1)}
                  style={styles.qtyHit}
                  accessibilityRole="button"
                  accessibilityLabel="Increase quantity"
                >
                  <Text style={[styles.qtyBtn, { color: t.text }]}>+</Text>
                </Pressable>
              </View>
              <Pressable
                onPress={() => remove(item.menuItemId)}
                style={styles.qtyHit}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${item.name}`}
              >
                <Text style={{ color: t.primary, marginLeft: 8 }}>Remove</Text>
              </Pressable>
            </View>
          )}
        />
      )}

      <View style={[styles.footer, { paddingBottom: footerPad, backgroundColor: t.background }]}>
        <MoneyRow label="Subtotal" value={`$${subtotal.toFixed(2)}`} muted />
        <MoneyRow label="Tax" value={`$${tax.toFixed(2)}`} muted />
        <MoneyRow label="Total" value={`$${total.toFixed(2)}`} emphasize />
        <Text style={{ color: t.muted, fontSize: 12, marginTop: 6, marginBottom: 12 }}>
          Tip is chosen at checkout — 100% goes to the restaurant.
        </Text>
        <PrimaryButton
          label="Checkout · Pickup"
          onPress={() => navigation.navigate("Checkout")}
          disabled={lines.length === 0}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 16, paddingHorizontal: 16 },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 16 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: tokens.radius.md,
    marginBottom: 8,
  },
  qty: { flexDirection: "row", alignItems: "center", gap: 4 },
  qtyHit: { minWidth: tokens.touch.min, minHeight: tokens.touch.min, justifyContent: "center", alignItems: "center" },
  qtyBtn: { fontSize: 22, paddingHorizontal: 8 },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#333",
    paddingTop: 12,
  },
});
