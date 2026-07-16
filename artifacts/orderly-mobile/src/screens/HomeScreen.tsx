import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  Modal,
  ScrollView,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image, resolveMenuImage, tenantLogo } from "../theme/images";
import { api, MenuItem } from "../api/client";
import { useCart } from "../state/cart";
import { pickupAddressLine, tenant } from "../tenant";
import { EmptyState, MenuSkeletonList } from "../components/ui";
import { tokens, headingFont, bodyFont } from "../theme/tokens";
import type { RootStackParamList } from "../navigation";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

export function HomeScreen({ navigation }: Props) {
  const { addItem, count, subtotal } = useCart();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<MenuItem | null>(null);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const t = tenant.theme;

  useEffect(() => {
    if (tenant.comingSoon) {
      setLoading(false);
      setError("This location is coming soon.");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await api.menuItems();
        if (!cancelled) setItems(data.filter((i) => i.available !== false));
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load menu");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = items.filter((i) =>
    i.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const openItem = (item: MenuItem) => {
    setSelected(item);
    setQty(1);
    setNote("");
  };

  const confirmAdd = () => {
    if (!selected) return;
    addItem(selected, qty, note.trim() || undefined);
    setSelected(null);
  };

  return (
    <View style={[styles.root, { backgroundColor: t.background }]}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={{ flex: 1 }} />
          <Pressable
            onPress={() => navigation.navigate("Restaurant")}
            accessibilityRole="button"
            accessibilityLabel="Restaurant info"
          >
            <Text style={{ color: t.accent, fontWeight: "600" }}>Info</Text>
          </Pressable>
        </View>
        <Image
          source={tenantLogo()}
          style={styles.logo}
          contentFit="contain"
          accessibilityLabel={`${tenant.appName} logo`}
        />
        <Text
          style={[styles.title, { color: t.text, fontFamily: headingFont() }]}
          accessibilityRole="header"
        >
          {tenant.appName}
        </Text>
        <Text style={[styles.loc, { color: t.accent }]}>
          {tenant.locationLabel ?? pickupAddressLine()}
        </Text>
        <Text style={[styles.tag, { color: t.muted }]}>{tenant.restaurant.tagline}</Text>
        <Text style={[styles.pickup, { color: t.primary }]}>
          Pickup only · Card checkout
        </Text>
      </View>

      <TextInput
        placeholder="Search menu…"
        placeholderTextColor={t.muted}
        value={query}
        onChangeText={setQuery}
        accessibilityLabel="Search menu"
        style={[styles.search, { backgroundColor: t.surface, color: t.text }]}
      />

      {loading && <MenuSkeletonList rows={6} />}
      {error && !loading && (
        <EmptyState title="Menu unavailable" body={error} />
      )}
      {!loading && !error && filtered.length === 0 && (
        <EmptyState
          title="No matches"
          body={query.trim() ? "Try a different search." : "Menu is empty right now."}
        />
      )}

      {!loading && !error ? (
      <FlatList
        data={filtered}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ paddingBottom: count > 0 ? 120 + insets.bottom : 40 }}
        renderItem={({ item }) => {
          const img = resolveMenuImage(item.name, item.imageUrl);
          return (
            <Pressable
              onPress={() => openItem(item)}
              accessibilityRole="button"
              accessibilityLabel={`${item.name}, $${item.price.toFixed(2)}`}
              accessibilityHint="Opens item details to add to cart"
              style={[styles.card, { backgroundColor: t.surface }]}
            >
              {img ? (
                <Image
                  source={img}
                  style={styles.thumb}
                  contentFit="cover"
                  accessibilityLabel={`Photo of ${item.name}`}
                />
              ) : (
                <View style={[styles.thumb, styles.thumbEmpty]} />
              )}
              <View style={styles.cardBody}>
                <Text style={[styles.itemName, { color: t.text, fontFamily: bodyFont() }]}>
                  {item.name}
                </Text>
                {!!item.description && (
                  <Text style={{ color: t.muted, fontSize: 12 }} numberOfLines={2}>
                    {item.description}
                  </Text>
                )}
                <View style={styles.row}>
                  <Text style={[styles.price, { color: t.accent }]}>
                    ${item.price.toFixed(2)}
                  </Text>
                  <Pressable
                    onPress={() => openItem(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${item.name}`}
                    style={[
                      styles.addBtn,
                      { backgroundColor: t.primary, minHeight: tokens.touch.min },
                    ]}
                  >
                    <Text style={styles.addTxt}>Add</Text>
                  </Pressable>
                </View>
              </View>
            </Pressable>
          );
        }}
      />
      ) : null}

      {count > 0 && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`View cart, ${count} item${count === 1 ? "" : "s"}, $${subtotal.toFixed(2)}`}
          style={[
            styles.cartBar,
            {
              backgroundColor: t.primary,
              // Lift above system nav / gesture bar so it's easy to tap
              bottom: Math.max(insets.bottom, 12) + 28,
            },
          ]}
          onPress={() => navigation.navigate("Cart")}
        >
          <Text style={styles.cartTxt}>
            View cart · {count} item{count === 1 ? "" : "s"} · ${subtotal.toFixed(2)}
          </Text>
        </Pressable>
      )}

      <Modal
        visible={!!selected}
        animationType="slide"
        transparent
        onRequestClose={() => setSelected(null)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[styles.modalCard, { backgroundColor: t.surface }]}
            accessibilityViewIsModal
          >
            <ScrollView>
              {selected && resolveMenuImage(selected.name, selected.imageUrl) ? (
                <Image
                  source={resolveMenuImage(selected.name, selected.imageUrl)!}
                  style={styles.modalImg}
                  contentFit="cover"
                  accessibilityLabel={`Photo of ${selected.name}`}
                />
              ) : null}
              <Text
                style={[styles.modalTitle, { color: t.text, fontFamily: headingFont() }]}
                accessibilityRole="header"
              >
                {selected?.name}
              </Text>
              <Text style={{ color: t.accent, fontWeight: "700", marginBottom: 8 }}>
                ${selected?.price.toFixed(2)}
              </Text>
              {!!selected?.description && (
                <Text style={{ color: t.muted, marginBottom: 12 }}>
                  {selected.description}
                </Text>
              )}
              <Text style={{ color: t.text, marginBottom: 6 }}>Quantity</Text>
              <View style={styles.qtyRow}>
                <Pressable
                  onPress={() => setQty((q) => Math.max(1, q - 1))}
                  accessibilityRole="button"
                  accessibilityLabel="Decrease quantity"
                  style={[styles.qtyBtn, { borderColor: t.muted }]}
                >
                  <Text style={{ color: t.text, fontSize: 20 }}>−</Text>
                </Pressable>
                <Text
                  style={{ color: t.text, fontSize: 18, minWidth: 32, textAlign: "center" }}
                  accessibilityLabel={`Quantity ${qty}`}
                >
                  {qty}
                </Text>
                <Pressable
                  onPress={() => setQty((q) => q + 1)}
                  accessibilityRole="button"
                  accessibilityLabel="Increase quantity"
                  style={[styles.qtyBtn, { borderColor: t.muted }]}
                >
                  <Text style={{ color: t.text, fontSize: 20 }}>+</Text>
                </Pressable>
              </View>
              <TextInput
                placeholder='Special instructions (e.g. "No spicy")'
                placeholderTextColor={t.muted}
                value={note}
                onChangeText={setNote}
                style={[styles.note, { backgroundColor: t.background, color: t.text }]}
              />
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setSelected(null)}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                style={{ padding: 12 }}
              >
                <Text style={{ color: t.muted }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={confirmAdd}
                accessibilityRole="button"
                accessibilityLabel={`Add ${qty} ${selected?.name ?? "item"} to cart, $${((selected?.price ?? 0) * qty).toFixed(2)}`}
                style={[styles.addBtn, { backgroundColor: t.primary, paddingHorizontal: 20 }]}
              >
                <Text style={styles.addTxt}>
                  Add · ${((selected?.price ?? 0) * qty).toFixed(2)}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 48, paddingHorizontal: 16 },
  header: { marginBottom: 12, alignItems: "center" },
  headerTop: { width: "100%", flexDirection: "row", marginBottom: 4 },
  logo: { width: 72, height: 72, marginBottom: 8 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "center" },
  loc: { fontSize: 14, fontWeight: "600", marginTop: 4 },
  tag: { fontSize: 13, textAlign: "center", marginTop: 4 },
  pickup: { fontSize: 12, fontWeight: "700", marginTop: 8 },
  search: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  card: {
    flexDirection: "row",
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 12,
  },
  thumb: { width: 96, height: 96 },
  thumbEmpty: { backgroundColor: "#333" },
  cardBody: { flex: 1, padding: 10, justifyContent: "space-between" },
  itemName: { fontSize: 15, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  price: { fontWeight: "700" },
  addBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  addTxt: { color: "#fff", fontWeight: "700" },
  cartBar: {
    position: "absolute",
    left: 16,
    right: 16,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  cartTxt: { color: "#fff", fontWeight: "700", fontSize: 16 },
  error: { color: "#f87171", marginVertical: 12 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalCard: {
    maxHeight: "85%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
  },
  modalImg: { width: "100%", height: 180, borderRadius: 12, marginBottom: 12 },
  modalTitle: { fontSize: 20, fontWeight: "700" },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  qtyBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  note: { borderRadius: 12, padding: 12, marginBottom: 8 },
  modalActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
});
