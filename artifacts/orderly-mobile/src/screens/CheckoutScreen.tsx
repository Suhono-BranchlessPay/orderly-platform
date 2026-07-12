import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
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
import type { RootStackParamList } from "../navigation";

type Props = NativeStackScreenProps<RootStackParamList, "Checkout">;

const PROFILE_KEY = `orderly_mobile_profile_${tenant.appId}`;

export function CheckoutScreen({ navigation }: Props) {
  const { lines, subtotal, clear } = useCart();
  const insets = useSafeAreaInsets();
  const t = tenant.theme;
  const tax = subtotal * 0.07;
  const total = subtotal + tax;

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [squareOk, setSquareOk] = useState<boolean | null>(null);
  const [squareEnv, setSquareEnv] = useState<string | null>(null);
  const [nativeOk, setNativeOk] = useState<boolean | null>(null);

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
        "Card payments need a native Android build (Android Studio / EAS). Expo Go cannot load Square In-App Payments.",
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

      // Real SDK card sheet → nonce → backend charge/order (pay first, then order)
      startCardPaymentFlow({
        collectPostalCode: true,
        onCancel: () => setBusy(false),
        onNonce: async (cardDetails) => {
          const sourceId = cardDetails.nonce?.trim();
          if (!sourceId) {
            return { success: false, errorMessage: "Square returned an empty card token." };
          }
          try {
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
              specialInstructions: note.trim() || null,
              squarePaymentSourceId: sourceId,
              doordashExternalDeliveryId: null,
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
    >
      <Text style={[styles.title, { color: t.text }]}>Pickup checkout</Text>
      <Text style={{ color: t.accent, fontWeight: "600", marginBottom: 4 }}>
        {tenant.appName} · {tenant.locationLabel}
      </Text>
      <Text style={{ color: t.muted, marginBottom: 12 }}>{pickupAddressLine()}</Text>

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

      <Text style={{ color: t.text, fontWeight: "700", marginTop: 8 }}>
        Total ${total.toFixed(2)}
      </Text>
      <Text style={{ color: t.muted, fontSize: 12, marginTop: 4 }}>
        Pay by card via Square In-App Payments. Delivery is temporarily unavailable.
        {squareEnv ? ` · Square env: ${squareEnv}` : ""}
      </Text>
      {nativeOk === false && (
        <Text style={{ color: "#f87171", marginTop: 8 }}>
          Native Square module not linked. Open this project in Android Studio / run an EAS
          build — Expo Go is not supported.
        </Text>
      )}
      {squareOk === false && (
        <Text style={{ color: "#f87171", marginTop: 8 }}>
          Card checkout unavailable for this restaurant right now.
        </Text>
      )}

      <Pressable
        disabled={busy || squareOk === false || nativeOk === false}
        onPress={placeOrder}
        style={[styles.cta, { backgroundColor: t.primary, opacity: busy ? 0.7 : 1 }]}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.ctaTxt}>Pay & place pickup order</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { paddingTop: 16, paddingHorizontal: 16 },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 8 },
  input: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  cta: {
    marginTop: 20,
    marginBottom: 8,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  ctaTxt: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
