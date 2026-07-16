import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  ScrollView,
  Platform,
} from "react-native";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCart } from "../state/cart";
import { api } from "../api/client";
import {
  assertSquareOnly,
  initSquareApplicationId,
  isSquareNativeAvailable,
  startCardPaymentFlow,
} from "../payments";
import { pickupAddressLine, tenant } from "../tenant";
import { getMobileAttribution } from "../attribution";
import { resolveCheckoutChannel, mobileOrderChannel } from "../channel";
import { MoneyRow, PrimaryButton, Skeleton } from "../components/ui";
import { UpsellSuggestions } from "../components/UpsellSuggestions";
import { buildPickupSlots } from "../lib/pickupEta";
import { registerForPickupPush } from "../push";
import { tokens, headingFont, bodyFont } from "../theme/tokens";
import type { RootStackParamList } from "../navigation";

type Props = NativeStackScreenProps<RootStackParamList, "Checkout">;

const PROFILE_KEY = `orderly_mobile_profile_${tenant.appId}`;

export function CheckoutScreen({ navigation }: Props) {
  const { lines, subtotal, clear } = useCart();
  const insets = useSafeAreaInsets();
  const t = tokens.color;
  const tax = subtotal * 0.07;
  const [tipPreset, setTipPreset] = useState<"none" | 15 | 18 | 20 | "custom">("none");
  const [customTip, setCustomTip] = useState("");
  const tipCents =
    tipPreset === "none"
      ? 0
      : tipPreset === "custom"
        ? Math.max(0, Math.round(parseFloat(customTip || "0") * 100) || 0)
        : Math.round(subtotal * tipPreset);
  const tipDollars = tipCents / 100;
  const total = subtotal + tax + tipDollars;

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [promo, setPromo] = useState("");
  const [pickupWhen, setPickupWhen] = useState<"asap" | string>("asap");
  const [customPickup, setCustomPickup] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [squareOk, setSquareOk] = useState<boolean | null>(null);
  const [squareEnv, setSquareEnv] = useState<string | null>(null);
  const [nativeOk, setNativeOk] = useState<boolean | null>(null);
  const slots = buildPickupSlots();

  useEffect(() => {
    AsyncStorage.getItem(PROFILE_KEY).then((raw) => {
      if (!raw) return;
      try {
        const p = JSON.parse(raw);
        setFirstName(p.firstName ?? "");
        setLastName(p.lastName ?? "");
        setPhone(p.phone ?? "");
        setEmail(p.email ?? "");
      } catch {
        /* ignore */
      }
    });
    setNativeOk(isSquareNativeAvailable());
    api
      .squareConfig()
      .then((c) => {
        setSquareOk(Boolean(c.enabled && c.applicationId));
        setSquareEnv(c.environment ?? null);
      })
      .catch(() => setSquareOk(false));
  }, []);

  const tipButtonLabel = (key: "none" | 15 | 18 | 20 | "custom"): string => {
    if (key === "none") return "No tip";
    if (key === "custom") return "Custom";
    const dollars = (subtotal * key) / 100;
    return `${key}% · $${dollars.toFixed(2)}`;
  };

  const isCustomPick =
    pickupWhen !== "asap" && !slots.some((s) => s.iso === pickupWhen);

  const onPickTime = (event: DateTimePickerEvent, date?: Date) => {
    // Android fires a one-shot dialog; iOS shows an inline spinner.
    setShowPicker(Platform.OS === "ios");
    if (event.type === "set" && date) {
      setCustomPickup(date);
      setPickupWhen(date.toISOString());
    }
  };

  const placeOrder = async () => {
    if (!firstName.trim() || phone.replace(/\D/g, "").length < 10) {
      Alert.alert("Missing info", "First name and a valid phone are required.");
      return;
    }
    if (lines.length === 0) {
      Alert.alert("Empty cart", "Add items before checkout.");
      return;
    }
    if (!isSquareNativeAvailable()) {
      Alert.alert(
        "Build required",
        "Card payments need a native build (EAS / Xcode / Android Studio). Expo Go cannot load Square In-App Payments.",
      );
      return;
    }

    setBusy(true);
    try {
      assertSquareOnly();
      const sq = await api.squareConfig();
      if (!sq.enabled || !sq.applicationId) {
        throw new Error("Online ordering is temporarily unavailable.");
      }

      initSquareApplicationId(sq.applicationId);

      startCardPaymentFlow({
        collectPostalCode: true,
        onCancel: () => setBusy(false),
        onNonce: async (cardDetails) => {
          const sourceId = cardDetails.nonce?.trim();
          if (!sourceId) {
            return { success: false, errorMessage: "Square returned an empty card token." };
          }
          try {
            const attr = await getMobileAttribution();
            const channel = resolveCheckoutChannel(attr?.channel);
            const requestedPickupAt = pickupWhen === "asap" ? null : pickupWhen;
            const scheduleNote = requestedPickupAt
              ? `Requested pickup: ${new Date(requestedPickupAt).toLocaleString()}`
              : null;
            const special = [note.trim(), scheduleNote].filter(Boolean).join(" · ") || null;
            const expoPushToken = await registerForPickupPush();

            const order = await api.createOrder({
              firstName: firstName.trim(),
              lastName: lastName.trim() || null,
              customerPhone: phone.trim(),
              customerEmail: email.trim() || null,
              orderType: "pickup",
              address: null,
              items: lines.map((l) => ({
                menuItemId: l.menuItemId,
                quantity: l.quantity,
                specialInstructions: l.specialInstructions ?? null,
              })),
              specialInstructions: special,
              squarePaymentSourceId: sourceId,
              doordashExternalDeliveryId: null,
              tipCents,
              tipPercent: tipPreset === "none" || tipPreset === "custom" ? null : tipPreset,
              channel,
              expoPushToken,
              sourceDetail: {
                surface: "orderly-mobile",
                platform: mobileOrderChannel(),
                requested_pickup_at: requestedPickupAt,
                promo_code_entered: promo.trim() || null,
                promo_engine: "pending",
                ...(expoPushToken ? { expo_push_token: expoPushToken } : {}),
                ...(attr?.source_detail || {}),
              },
            });

            await AsyncStorage.setItem(
              PROFILE_KEY,
              JSON.stringify({
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                phone: phone.trim(),
                email: email.trim(),
              }),
            );

            return {
              success: true,
              onCardEntryComplete: () => {
                clear();
                setBusy(false);
                navigation.replace("Confirmation", {
                  orderId: order.id,
                  total: order.total ?? total,
                  bpExplorerUrl: order.bpExplorerUrl ?? null,
                  bpAnchorStatus: order.bpAnchorStatus ?? null,
                  chainTxHash: order.chainTxHash ?? order.bpChainTxHash ?? null,
                  initialStatus: order.status ?? "pending",
                });
              },
            };
          } catch (e) {
            setBusy(false);
            const msg = e instanceof Error ? e.message : "Payment failed";
            return { success: false, errorMessage: msg };
          }
        },
      });
    } catch (e) {
      setBusy(false);
      Alert.alert("Payment failed", e instanceof Error ? e.message : "Try again");
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.background }}
      contentContainerStyle={[
        styles.root,
        { paddingBottom: Math.max(insets.bottom, 12) + 36 },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <Text
        style={[styles.title, { color: t.text, fontFamily: headingFont() }]}
        accessibilityRole="header"
      >
        Pickup checkout
      </Text>
      <Text style={{ color: t.accent, fontWeight: "600", marginBottom: 4 }}>
        {tenant.appName} · {tenant.locationLabel}
      </Text>
      <Text style={{ color: t.muted, marginBottom: 12 }}>{pickupAddressLine()}</Text>

      <Text style={[styles.section, { color: t.text, fontFamily: headingFont() }]}>
        Order summary
      </Text>
      {lines.map((l) => (
        <MoneyRow
          key={l.menuItemId + (l.specialInstructions ?? "")}
          label={`${l.quantity}× ${l.name}`}
          value={`$${(l.unitPrice * l.quantity).toFixed(2)}`}
          muted
        />
      ))}

      <UpsellSuggestions />

      <Text style={[styles.section, { color: t.text, fontFamily: headingFont() }]}>
        Pickup time
      </Text>
      <View style={styles.chipRow}>
        <Pressable
          onPress={() => {
            setShowPicker(false);
            setPickupWhen("asap");
          }}
          accessibilityRole="button"
          accessibilityLabel="Pickup as soon as ready"
          accessibilityState={{ selected: pickupWhen === "asap" }}
          style={[
            styles.chip,
            {
              borderColor: pickupWhen === "asap" ? t.primary : t.muted,
              backgroundColor: pickupWhen === "asap" ? t.primary : "transparent",
              minHeight: tokens.touch.min,
            },
          ]}
        >
          <Text style={{ color: pickupWhen === "asap" ? t.onPrimary : t.text, fontSize: 13 }}>
            As soon as ready
          </Text>
        </Pressable>
        {slots.slice(0, 5).map((s) => (
          <Pressable
            key={s.iso}
            onPress={() => {
              setShowPicker(false);
              setPickupWhen(s.iso);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Pickup at ${s.label}`}
            accessibilityState={{ selected: pickupWhen === s.iso }}
            style={[
              styles.chip,
              {
                borderColor: pickupWhen === s.iso ? t.primary : t.muted,
                backgroundColor: pickupWhen === s.iso ? t.primary : "transparent",
                minHeight: tokens.touch.min,
              },
            ]}
          >
            <Text
              style={{
                color: pickupWhen === s.iso ? t.onPrimary : t.text,
                fontSize: 13,
              }}
            >
              {s.label}
            </Text>
          </Pressable>
        ))}
        <Pressable
          onPress={() => setShowPicker(true)}
          accessibilityRole="button"
          accessibilityLabel="Pick a custom pickup time"
          accessibilityState={{ selected: isCustomPick }}
          style={[
            styles.chip,
            {
              borderColor: isCustomPick ? t.primary : t.muted,
              backgroundColor: isCustomPick ? t.primary : "transparent",
              minHeight: tokens.touch.min,
            },
          ]}
        >
          <Text style={{ color: isCustomPick ? t.onPrimary : t.text, fontSize: 13 }}>
            {isCustomPick && customPickup
              ? customPickup.toLocaleString([], {
                  weekday: "short",
                  hour: "numeric",
                  minute: "2-digit",
                })
              : "Pick a time…"}
          </Text>
        </Pressable>
      </View>
      {showPicker && (
        <DateTimePicker
          value={customPickup ?? new Date(Date.now() + 30 * 60 * 1000)}
          mode="datetime"
          minimumDate={new Date()}
          onChange={onPickTime}
        />
      )}
      <Text style={{ color: t.muted, fontSize: 12, marginTop: 6 }}>
        Schedule ahead is a request to the kitchen (shown on your order notes). Exact
        slot fulfillment depends on restaurant capacity.
      </Text>

      {(["First name", "Last name", "Phone", "Email", "Special instructions"] as const).map(
        (label) => {
          const map: Record<string, [string, (v: string) => void]> = {
            "First name": [firstName, setFirstName],
            "Last name": [lastName, setLastName],
            Phone: [phone, setPhone],
            Email: [email, setEmail],
            "Special instructions": [note, setNote],
          };
          const [val, set] = map[label];
          return (
            <TextInput
              key={label}
              placeholder={label}
              placeholderTextColor={t.muted}
              value={val}
              onChangeText={set}
              keyboardType={
                label === "Phone" ? "phone-pad" : label === "Email" ? "email-address" : "default"
              }
              style={[styles.input, { backgroundColor: t.surface, color: t.text }]}
            />
          );
        },
      )}

      <Text style={[styles.section, { color: t.text, fontFamily: headingFont() }]}>
        Promo code
      </Text>
      <TextInput
        placeholder="Enter code (coming soon)"
        placeholderTextColor={t.muted}
        value={promo}
        onChangeText={setPromo}
        editable
        style={[styles.input, { backgroundColor: t.surface, color: t.text, opacity: 0.85 }]}
      />
      <Text style={{ color: t.muted, fontSize: 12, marginBottom: 8 }}>
        Codes are saved with your order; discounts apply when the coupon engine is live.
      </Text>

      <Text style={[styles.section, { color: t.text, fontFamily: headingFont() }]}>Tip</Text>
      <Text style={{ color: t.muted, fontSize: 13, marginBottom: 8 }}>
        100% goes to the restaurant.
      </Text>
      <View style={styles.chipRow}>
        {(["none", 15, 18, 20, "custom"] as const).map((key) => (
          <Pressable
            key={String(key)}
            onPress={() => setTipPreset(key)}
            accessibilityRole="button"
            accessibilityLabel={`Tip ${tipButtonLabel(key)}`}
            accessibilityState={{ selected: tipPreset === key }}
            style={[
              styles.chip,
              {
                borderColor: tipPreset === key ? t.primary : t.muted,
                backgroundColor: tipPreset === key ? t.primary : "transparent",
                minHeight: tokens.touch.min,
              },
            ]}
          >
            <Text
              style={{
                color: tipPreset === key ? t.onPrimary : t.text,
                fontSize: 13,
              }}
            >
              {tipButtonLabel(key)}
            </Text>
          </Pressable>
        ))}
      </View>
      {tipPreset === "custom" && (
        <TextInput
          placeholder="Tip amount ($)"
          placeholderTextColor={t.muted}
          value={customTip}
          onChangeText={setCustomTip}
          keyboardType="decimal-pad"
          style={[styles.input, { backgroundColor: t.surface, color: t.text, marginTop: 8 }]}
        />
      )}

      <View style={{ marginTop: tokens.space.md }}>
        <MoneyRow label="Subtotal" value={`$${subtotal.toFixed(2)}`} muted />
        <MoneyRow label="Tax" value={`$${tax.toFixed(2)}`} muted />
        <MoneyRow
          label={
            tipPreset === "none"
              ? "Tip"
              : tipPreset === "custom"
                ? "Tip (custom)"
                : `Tip (${tipPreset}%)`
          }
          value={`$${tipDollars.toFixed(2)}`}
          muted
        />
        <MoneyRow label="Total" value={`$${total.toFixed(2)}`} emphasize />
      </View>

      {squareOk === null ? (
        <View style={{ marginTop: 10 }} accessibilityLabel="Checking payment availability">
          <Skeleton height={12} width="90%" />
          <Skeleton height={12} width="60%" style={{ marginTop: 6 }} />
        </View>
      ) : (
        <Text style={{ color: t.muted, fontSize: 12, marginTop: 10 }}>
          Pay by card via Square In-App Payments. Delivery is temporarily unavailable.
          {squareEnv ? ` · Square env: ${squareEnv}` : ""}
        </Text>
      )}
      {nativeOk === false && (
        <Text style={{ color: tokens.color.danger, marginTop: 8 }}>
          Native Square module not linked. Use an EAS / native build — Expo Go is not
          supported.
        </Text>
      )}
      {squareOk === false && (
        <Text style={{ color: tokens.color.danger, marginTop: 8 }}>
          Card checkout unavailable for this restaurant right now.
        </Text>
      )}

      <View style={{ marginTop: 20 }}>
        <PrimaryButton
          label="Pay & place pickup order"
          onPress={placeOrder}
          busy={busy}
          disabled={squareOk === false || nativeOk === false}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { paddingTop: 16, paddingHorizontal: 16 },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 8 },
  section: { fontSize: 15, fontWeight: "700", marginTop: 16, marginBottom: 6 },
  input: {
    borderRadius: tokens.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    minHeight: tokens.touch.min,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: tokens.radius.sm,
    borderWidth: 1,
    justifyContent: "center",
  },
});
