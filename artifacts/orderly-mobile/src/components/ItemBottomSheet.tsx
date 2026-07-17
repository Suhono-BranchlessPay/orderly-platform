import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  ScrollView,
  TextInput,
  Animated,
  Easing,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { MenuItem } from "../api/client";
import {
  modifiersExtra,
  parseModifierLists,
  type SelectedModifier,
} from "../lib/modifiers";
import { resolveMenuImage } from "../theme/images";
import { ImageFallback } from "./ImageFallback";
import { StarRating } from "./StarRating";
import {
  tokens,
  bodyFont,
  headingFont,
  prefersReducedMotionSync,
} from "../theme/tokens";
import { tenant } from "../tenant";

type Props = {
  item: MenuItem | null;
  onClose: () => void;
  onConfirm: (
    qty: number,
    note?: string,
    modifiers?: SelectedModifier[],
  ) => void;
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
  const [selectedMods, setSelectedMods] = useState<SelectedModifier[]>([]);
  const [sheetVisible, setSheetVisible] = useState(false);

  const backdrop = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(1)).current;

  const lists = useMemo(
    () => (item ? parseModifierLists(item.squareModifiers) : []),
    [item],
  );

  useEffect(() => {
    setQty(1);
    setNote("");
    setSelectedMods([]);
  }, [item?.id]);

  useEffect(() => {
    if (item) {
      setSheetVisible(true);
      if (prefersReducedMotionSync()) {
        backdrop.setValue(1);
        slide.setValue(0);
        return;
      }
      backdrop.setValue(0);
      slide.setValue(1);
      Animated.parallel([
        Animated.timing(backdrop, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(slide, {
          toValue: 0,
          friction: 9,
          tension: 68,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }
    if (!sheetVisible) return;
    if (prefersReducedMotionSync()) {
      setSheetVisible(false);
      return;
    }
    Animated.parallel([
      Animated.timing(backdrop, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.timing(slide, {
        toValue: 1,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setSheetVisible(false);
    });
  }, [item, backdrop, slide, sheetVisible]);

  const badges = item ? attributeBadges(item) : [];
  const unit = (item?.price ?? 0) + modifiersExtra(selectedMods);
  const total = unit * qty;
  const img = item ? resolveMenuImage(item.name, item.imageUrl) : null;

  const toggleMod = (listId: string, listName: string, opt: {
    id: string;
    name: string;
    price: number;
  }) => {
    setSelectedMods((prev) => {
      const exists = prev.some((m) => m.id === opt.id);
      if (exists) return prev.filter((m) => m.id !== opt.id);
      // One choice per Square list (typical radio groups).
      const withoutList = prev.filter((m) => m.listId !== listId);
      return [
        ...withoutList,
        {
          listId,
          listName,
          id: opt.id,
          name: opt.name,
          price: opt.price,
        },
      ];
    });
  };

  const handleClose = () => onClose();

  return (
    <Modal
      visible={sheetVisible}
      animationType="none"
      transparent
      onRequestClose={handleClose}
    >
      <View style={styles.root}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: "rgba(0,0,0,0.62)",
              opacity: backdrop,
            },
          ]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={handleClose}
            accessibilityLabel="Dismiss"
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: t.surface,
              paddingBottom: Math.max(insets.bottom, 12),
              transform: [
                {
                  translateY: slide.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 560],
                  }),
                },
              ],
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
                ${unit.toFixed(2)}
                {modifiersExtra(selectedMods) > 0 ? (
                  <Text style={{ color: t.muted, fontSize: 14 }}>
                    {" "}
                    (base ${item?.price.toFixed(2)})
                  </Text>
                ) : null}
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

              {lists.map((list) => (
                <View key={list.listId} style={styles.modBlock}>
                  <Text
                    style={[
                      styles.section,
                      { color: t.text, fontFamily: bodyFont() },
                    ]}
                  >
                    {list.listName}
                  </Text>
                  {list.options.map((opt) => {
                    const on = selectedMods.some((m) => m.id === opt.id);
                    return (
                      <Pressable
                        key={opt.id}
                        onPress={() =>
                          toggleMod(list.listId, list.listName, opt)
                        }
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                        accessibilityLabel={`${opt.name}${
                          opt.price > 0
                            ? `, plus $${opt.price.toFixed(2)}`
                            : ""
                        }`}
                        style={[
                          styles.modRow,
                          {
                            borderColor: on ? t.primary : t.muted,
                            backgroundColor: on ? t.surface : t.background,
                            opacity: on ? 1 : 0.95,
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.check,
                            {
                              borderColor: on ? t.primary : t.muted,
                              backgroundColor: on ? t.primary : "transparent",
                            },
                          ]}
                        >
                          {on ? (
                            <Text style={styles.checkMark}>✓</Text>
                          ) : null}
                        </View>
                        <Text
                          style={{
                            flex: 1,
                            color: t.text,
                            fontFamily: bodyFont(),
                          }}
                        >
                          {opt.name}
                        </Text>
                        <Text
                          style={{
                            color: t.muted,
                            fontFamily: bodyFont(),
                          }}
                        >
                          {opt.price > 0
                            ? `+$${opt.price.toFixed(2)}`
                            : "Included"}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))}

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
              onPress={() =>
                onConfirm(
                  qty,
                  note.trim() || undefined,
                  selectedMods.length ? selectedMods : undefined,
                )
              }
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
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
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
  section: { fontWeight: "600", marginBottom: 8, marginTop: 4 },
  modBlock: { marginBottom: 12 },
  modRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
    minHeight: tokens.touch.min,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  checkMark: { color: "#fff", fontSize: 13, fontWeight: "800" },
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
