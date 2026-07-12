/**
 * Square In-App Payments SDK v2 — real card entry only (no fake nonce / EXTERNAL).
 * App holds public Application ID from GET /api/square/config; secrets stay on backend.
 *
 * Docs: docs/P1_SQUARE_SDK_CHOICE.md
 */
import { NativeModules, Platform } from "react-native";
import {
  SQIPCardEntry,
  SQIPCore,
  type CardDetails,
  type NonceSuccessResult,
} from "react-native-square-in-app-payments";

let initializedAppId: string | null = null;

export function isSquareNativeAvailable(): boolean {
  try {
    return Boolean(
      NativeModules.NativeSQIPCore ||
        NativeModules.RNSquareInAppPayments ||
        NativeModules.SquareInAppPayments ||
        typeof SQIPCore?.setSquareApplicationId === "function",
    );
  } catch {
    return false;
  }
}

export function initSquareApplicationId(applicationId: string): void {
  if (!applicationId?.trim()) {
    throw new Error("Square Application ID missing from /api/square/config.");
  }
  if (initializedAppId === applicationId) return;
  SQIPCore.setSquareApplicationId(applicationId);
  if (Platform.OS === "ios") {
    SQIPCardEntry.setIOSCardEntryTheme({
      saveButtonTitle: "Pay",
      keyboardAppearance: "Light",
    });
  }
  initializedAppId = applicationId;
}

/**
 * Opens Square card entry. Caller charges in `onNonce` and returns success/failure
 * so the SDK can close the sheet (v2 API — no manual completeCardEntry required).
 */
export function startCardPaymentFlow(opts: {
  collectPostalCode?: boolean;
  onNonce: (cardDetails: CardDetails) => Promise<NonceSuccessResult> | NonceSuccessResult;
  onCancel?: () => void;
}): void {
  if (!isSquareNativeAvailable()) {
    throw new Error(
      "Square In-App Payments native module missing. Use Android Studio / EAS (not Expo Go).",
    );
  }
  SQIPCardEntry.startCardEntryFlow(
    opts.collectPostalCode ?? true,
    opts.onNonce,
    () => opts.onCancel?.(),
  );
}

export function assertSquareOnly(): void {
  const prefer = process.env.EXPO_PUBLIC_PAYMENT_PROVIDER || "square";
  if (prefer === "stripe") {
    throw new Error("Stripe Connect not live yet — use Square In-App Payments.");
  }
}
