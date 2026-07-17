import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  ScrollView,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { MenuItem } from "../api/client";
import { resolveMenuImage } from "../theme/images";
import { ImageFallback } from "./ImageFallback";
import { StarRating } from "./StarRating";
import { tokens, bodyFont, headingFont } from "../theme/tokens";
import { tenant } from "../tenant";

type Props = {
  item: MenuItem | null;
  onClose: () => void;
  onConfirm: (qty: number, note?: string) => void;
};

/** Attribute chips inferred from name/description — hide when empty. */
function attributeBadges(item: MenuItem): string[] {
  const hay = `${item.name} ${item.description || ""}`.toLowerCase();
  const out: string[] = [];
  if (/\bspicy|chili|sambal\b/.test(hay)) out.push("Spicy");
  if (/\bveg(etable|gie)|tofu|avocado roll\b/.test(hay)) out.push("Vegetarian");
  if (/\bsushi|tuna|salmon|shrimp|crab|eel|sashimi|seafood\b/.test(hay)) {
    out.push("Seafood");
  }
  if (/\bgluten[\s-]?free\b/.test(hay)) out.push("Gluten-Free");
  return out;
}

export function ItemBottomSheet({ item, onClose, onConfirm }: Props) {
  const t = tenant.theme;
  const insets = useSafeAreaInsets();
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");

  useEffect(() => {
    setQty(1);
    setNote("");
  }, [item?.id]);

  const badges = item ? attributeBadges(item) : [];
  const total = (item?.price ?? 0) * qty;
  const img = item ? resolveMenuImage(item.name, item.imageUrl) : null;

  return (
    <Modal
      visible={!!item}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Dismiss"
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: t.surface,
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
          accessibilityViewIsModal
        >
          <View style={[styles.handle, { backgroundColor: t.muted }]} />
          <ScrollView
            bounces={false}
            contentContainerStyle={{ paddingBottom: 96 }}
          >
            <ImageFallback
              source={img}
              label={item?.name}
              style={styles.hero}
            />
            <View style={styles.content}>
              <Text
                style={[
                  styles.title,
                  { color: t.text, fontFamily: headingFont() },
                ]}
                accessibilityRole="header"
              >
                {item?.name}
              </Text>
              <Text
                style={[
                  styles.price,
                  { color: t.accent, fontFamily: bodyFont() },
                ]}
              >
                ${item?.price.toFixed(2)}
              </Text>
              {item ? (
                <StarRating
                  ratingValue={item.ratingValue}
                  reviewCount={item.reviewCount}
                />
              ) : null}
              {badges.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.badges}
                >
                  {badges.map((b) => (
                    <View
                      key={b}
                      style={[styles.chip, { borderColor: t.muted }]}
                    >
                      <Text
                        style={{
                          color: t.text,
                          fontSize: 12,
                          fontFamily: bodyFont(),
                        }}
                      >
                        {b}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              ) : null}
              {!!item?.description && (
                <Text
                  style={[
                    styles.desc,
                    { color: t.muted, fontFamily: bodyFont() },
                  ]}
                >
                  {item.description}
                </Text>
              )}
              <Text
                style={[
                  styles.section,
                  { color: t.text, fontFamily: bodyFont() },
                ]}
              >
                Quantity
              </Text>
              <View style={styles.qtyRow}>
                <Pressable
                  onPress={() => setQty((q) => Math.max(1, q - 1))}
                  accessibilityRole="button"
                  accessibilityLabel="Decrease quantity"
                  style={[styles.qtyBtn, { borderColor: t.muted }]}
                >
                  <Text style={{ color: t.text, fontSize: 22 }}>−</Text>
                </Pressable>
                <Text
                  style={{
                    color: t.text,
                    fontSize: 18,
                    minWidth: 36,
                    textAlign: "center",
                    fontFamily: bodyFont(),
                  }}
                >
                  {qty}
                </Text>
                <Pressable
                  onPress={() => setQty((q) => q + 1)}
                  accessibilityRole="button"
                  accessibilityLabel="Increase quantity"
                  style={[styles.qtyBtn, { borderColor: t.muted }]}
                >
                  <Text style={{ color: t.text, fontSize: 22 }}>+</Text>
                </Pressable>
              </View>
              <TextInput
                placeholder='Special instructions (e.g. "No spicy")'
                placeholderTextColor={t.muted}
                value={note}
                onChangeText={setNote}
                style={[
                  styles.note,
                  {
                    backgroundColor: t.background,
                    color: t.text,
                    fontFamily: bodyFont(),
                  },
                ]}
              />
            </View>
          </ScrollView>

          <View
            style={[
              styles.sticky,
              {
                backgroundColor: t.surface,
                borderTopColor: t.background,
              },
            ]}
          >
            <Pressable
              onPress={() => onConfirm(qty, note.trim() || undefined)}
              accessibilityRole="button"
              accessibilityLabel={`Add to cart, $${total.toFixed(2)}`}
              style={[
                styles.addCta,
                {
                  backgroundColor: t.primary,
                  minHeight: tokens.touch.min,
                },
              ]}
            >
              <Text style={styles.addCtaTxt}>
                Add to Cart · ${total.toFixed(2)}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.62)",
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "92%",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: "hidden",
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    marginTop: 10,
    marginBottom: 6,
    opacity: 0.5,
  },
  hero: { width: "100%", height: 220 },
  content: { padding: tokens.space.md },
  title: { fontSize: 24, fontWeight: "700" },
  price: { fontSize: 20, fontWeight: "800", marginTop: 4, marginBottom: 6 },
  badges: { gap: 8, marginVertical: 10 },
  chip: {
    borderWidth: 1,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  desc: { fontSize: 14, lineHeight: 20, marginBottom: 12 },
  section: { fontWeight: "600", marginBottom: 8 },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 12,
  },
  qtyBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  note: { borderRadius: tokens.radius.md, padding: 12 },
  sticky: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: tokens.space.md,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  addCta: {
    borderRadius: tokens.radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
  },
  addCtaTxt: { color: "#fff", fontWeight: "800", fontSize: 16 },
});
