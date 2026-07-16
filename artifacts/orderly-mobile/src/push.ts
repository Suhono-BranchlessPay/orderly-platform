/**
 * Blok E — Expo push for “ready for pickup”.
 * Requires a native/EAS build (not Expo Go on Android SDK 53+).
 */
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let cachedToken: string | null = null;

function projectId(): string | null {
  const fromExtra =
    Constants.expoConfig?.extra?.eas?.projectId ||
    (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId ||
    process.env.EAS_PROJECT_ID ||
    null;
  return typeof fromExtra === "string" && fromExtra.trim() ? fromExtra.trim() : null;
}

/** Request permission + Expo push token. Returns null if unavailable. */
export async function registerForPickupPush(): Promise<string | null> {
  if (cachedToken) return cachedToken;

  if (!Device.isDevice) {
    // Simulators may still get tokens on newer iOS; try anyway on iOS.
    if (Platform.OS !== "ios") return null;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("pickup-ready", {
      name: "Pickup ready",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: tenantPrimaryFallback(),
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    const asked = await Notifications.requestPermissionsAsync();
    status = asked.status;
  }
  if (status !== "granted") return null;

  const pid = projectId();
  if (!pid) {
    // Still try — Expo may resolve from the native binary on EAS builds.
    try {
      const token = (await Notifications.getExpoPushTokenAsync()).data;
      cachedToken = token;
      return token;
    } catch {
      return null;
    }
  }

  try {
    const token = (await Notifications.getExpoPushTokenAsync({ projectId: pid })).data;
    cachedToken = token;
    return token;
  } catch {
    return null;
  }
}

function tenantPrimaryFallback(): string {
  return "#E11D2E";
}

function extractReadyOrderId(
  data: { orderId?: string; type?: string } | undefined,
): string | null {
  return data?.type === "pickup_ready" && data.orderId ? data.orderId : null;
}

export function startPushListeners(onReadyOrderId?: (orderId: string) => void): () => void {
  const received = Notifications.addNotificationReceivedListener(() => {
    /* foreground banner handled by setNotificationHandler */
  });
  const response = Notifications.addNotificationResponseReceivedListener((ev) => {
    const orderId = extractReadyOrderId(
      ev.notification.request.content.data as { orderId?: string; type?: string },
    );
    if (orderId && onReadyOrderId) onReadyOrderId(orderId);
  });

  // Cold start: if a push tap launched the app, the response is delivered here
  // (not to the listener above). The caller queues until navigation is ready.
  let cancelledColdStart = false;
  Notifications.getLastNotificationResponseAsync()
    .then((resp) => {
      if (cancelledColdStart || !resp) return;
      const orderId = extractReadyOrderId(
        resp.notification.request.content.data as { orderId?: string; type?: string },
      );
      if (orderId && onReadyOrderId) onReadyOrderId(orderId);
    })
    .catch(() => {
      /* no last response */
    });

  return () => {
    cancelledColdStart = true;
    received.remove();
    response.remove();
  };
}
