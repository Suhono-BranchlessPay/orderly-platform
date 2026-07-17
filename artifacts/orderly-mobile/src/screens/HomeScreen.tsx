import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image, resolveMenuImage, tenantLogo } from "../theme/images";
import { api, MenuItem, MenuCategory } from "../api/client";
import { useCart } from "../state/cart";
import { pickupAddressLine, tenant } from "../tenant";
import { EmptyState, MenuSkeletonList } from "../components/ui";
import { HeroSlot } from "../components/HeroSlot";
import {
  CategoryCarousel,
  type CategoryBubble,
} from "../components/CategoryCarousel";
import { ProductCard } from "../components/ProductCard";
import { ItemBottomSheet } from "../components/ItemBottomSheet";
import { tokens, headingFont, bodyFont } from "../theme/tokens";
import type { RootStackParamList } from "../navigation";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

const BLOCKED_CATS = new Set(["uncategorized", "misc", "other", "menu"]);

export function HomeScreen({ navigation }: Props) {
  const { addItem, count, subtotal } = useCart();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [featured, setFeatured] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [selected, setSelected] = useState<MenuItem | null>(null);
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
        const [menu, cats, feat] = await Promise.all([
          api.menuItems(),
          api.menuCategories().catch(() => [] as MenuCategory[]),
          api.featured().catch(() => [] as MenuItem[]),
        ]);
        if (cancelled) return;
        const available = menu.filter((i) => i.available !== false);
        setItems(available);
        setCategories(cats);
        setFeatured(
          (feat.length ? feat : available.filter((i) => i.featured)).filter(
            (i) => i.available !== false,
          ),
        );
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load menu");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const bubbles: CategoryBubble[] = useMemo(() => {
    const counts = new Map<string, { count: number; sample?: MenuItem }>();
    for (const item of items) {
      const name = (item.category || "").trim();
      if (!name || BLOCKED_CATS.has(name.toLowerCase())) continue;
      const prev = counts.get(name) || { count: 0 };
      prev.count += 1;
      if (!prev.sample) prev.sample = item;
      counts.set(name, prev);
    }
    // Prefer API category order when present
    const orderedNames =
      categories.length > 0
        ? categories
            .map((c) => c.name)
            .filter((n) => counts.has(n))
        : [...counts.keys()].sort();

    return orderedNames.map((name) => {
      const meta = counts.get(name)!;
      const sample = meta.sample!;
      return {
        id: name,
        name,
        image: resolveMenuImage(sample.name, sample.imageUrl),
        highlight: /promo|special|chef/i.test(name),
      };
    });
  }, [items, categories]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (selectedCat && (i.category || "") !== selectedCat) return false;
      if (!q) return true;
      return (
        i.name.toLowerCase().includes(q) ||
        (i.description || "").toLowerCase().includes(q) ||
        (i.category || "").toLowerCase().includes(q)
      );
    });
  }, [items, query, selectedCat]);

  const openItem = (item: MenuItem) => setSelected(item);

  const confirmAdd = (qty: number, note?: string) => {
    if (!selected) return;
    addItem(selected, qty, note);
    setSelected(null);
  };

  const listHeader = (
    <View>
      <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 8) }]}>
        <Image
          source={tenantLogo()}
          style={styles.logo}
          contentFit="contain"
          accessibilityLabel={`${tenant.appName} logo`}
        />
        <Pressable
          onPress={() => navigation.navigate("Restaurant")}
          style={styles.locBlock}
          accessibilityRole="button"
          accessibilityLabel="Pickup location"
        >
          <Text style={[styles.locEyebrow, { color: t.muted, fontFamily: bodyFont() }]}>
            Pickup at
          </Text>
          <Text
            style={[styles.locLine, { color: t.text, fontFamily: bodyFont() }]}
            numberOfLines={1}
          >
            {tenant.locationLabel ?? pickupAddressLine()}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => navigation.navigate("Cart")}
          accessibilityRole="button"
          accessibilityLabel={`Cart, ${count} items`}
          style={[styles.cartBtn, { backgroundColor: t.surface }]}
        >
          <Text style={{ color: t.text, fontSize: 13, fontWeight: "800" }}>Bag</Text>
          {count > 0 ? (
            <View style={[styles.badge, { backgroundColor: t.primary }]}>
              <Text style={styles.badgeTxt}>{count > 9 ? "9+" : count}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      <View style={[styles.searchWrap, { backgroundColor: t.surface }]}>
        <TextInput
          placeholder="Search sushi, hibachi, ramen…"
          placeholderTextColor={t.muted}
          value={query}
          onChangeText={setQuery}
          accessibilityLabel="Search menu"
          style={[styles.search, { color: t.text, fontFamily: bodyFont() }]}
        />
      </View>

      {!loading && !error ? (
        <>
          <HeroSlot items={featured.length ? featured : items.slice(0, 5)} onSelect={openItem} />
          <CategoryCarousel
            categories={bubbles}
            selectedId={selectedCat}
            onSelect={setSelectedCat}
          />
          <Text
            style={[
              styles.sectionTitle,
              { color: t.text, fontFamily: headingFont() },
            ]}
          >
            {selectedCat || (query.trim() ? "Results" : "Popular now")}
          </Text>
        </>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: t.background }]}>
      {loading && (
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: tokens.space.md }}>
          <MenuSkeletonList rows={6} />
        </View>
      )}
      {error && !loading && (
        <View style={{ paddingTop: insets.top + 24, paddingHorizontal: tokens.space.md }}>
          <EmptyState title="Menu unavailable" body={error} />
        </View>
      )}

      {!loading && !error ? (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          ListHeaderComponent={listHeader}
          contentContainerStyle={{
            paddingHorizontal: tokens.space.md,
            paddingBottom: count > 0 ? 120 + insets.bottom : 40,
          }}
          ListEmptyComponent={
            <EmptyState
              title="No matches"
              body={
                query.trim() || selectedCat
                  ? "Try a different search or category."
                  : "Menu is empty right now."
              }
            />
          }
          renderItem={({ item }) => (
            <ProductCard
              item={item}
              badge={item.featured ? "FEATURED" : null}
              onPress={() => openItem(item)}
              onQuickAdd={() => addItem(item, 1)}
            />
          )}
        />
      ) : null}

      {count > 0 && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`View cart, ${count} items, $${subtotal.toFixed(2)}`}
          style={[
            styles.cartBar,
            {
              backgroundColor: t.primary,
              bottom: Math.max(insets.bottom, 12) + 12,
            },
          ]}
          onPress={() => navigation.navigate("Cart")}
        >
          <Text style={styles.cartTxt}>
            View cart · {count} · ${subtotal.toFixed(2)}
          </Text>
        </Pressable>
      )}

      <ItemBottomSheet
        item={selected}
        onClose={() => setSelected(null)}
        onConfirm={confirmAdd}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: tokens.space.md,
  },
  logo: { width: 44, height: 44, borderRadius: 10 },
  locBlock: { flex: 1, minWidth: 0 },
  locEyebrow: { fontSize: 11, fontWeight: "600" },
  locLine: { fontSize: 14, fontWeight: "700" },
  cartBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeTxt: { color: "#fff", fontSize: 10, fontWeight: "800" },
  searchWrap: {
    borderRadius: tokens.radius.md,
    marginBottom: tokens.space.md,
  },
  search: {
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: tokens.space.sm,
  },
  gridRow: {
    justifyContent: "space-between",
    gap: tokens.space.sm,
  },
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
});
