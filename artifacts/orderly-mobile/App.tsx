import React, { useEffect, useRef } from "react";
import { View } from "react-native";
import {
  NavigationContainer,
  DefaultTheme,
  createNavigationContainerRef,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import {
  useFonts,
  PlayfairDisplay_600SemiBold,
  PlayfairDisplay_700Bold,
} from "@expo-google-fonts/playfair-display";
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_700Bold,
} from "@expo-google-fonts/dm-sans";
import { CartProvider } from "./src/state/cart";
import { MainTabs } from "./src/navigation/MainTabs";
import { CartScreen } from "./src/screens/CartScreen";
import { CheckoutScreen } from "./src/screens/CheckoutScreen";
import { ConfirmationScreen } from "./src/screens/ConfirmationScreen";
import { ReceiptScreen } from "./src/screens/ReceiptScreen";
import { RestaurantScreen } from "./src/screens/RestaurantScreen";
import { tenant } from "./src/tenant";
import { startMobileAttributionListener } from "./src/attribution";
import { startReducedMotionListener } from "./src/theme/tokens";
import { startPushListeners } from "./src/push";
import type { RootStackParamList } from "./src/navigation";

const Stack = createNativeStackNavigator<RootStackParamList>();

/** Shared ref so push-notification taps (outside the navigator) can navigate. */
const navigationRef = createNavigationContainerRef<RootStackParamList>();

export default function App() {
  const t = tenant.theme;
  // Load brand fonts aliased to the names used in tenant config theme
  // (fontHeading: "PlayfairDisplay", fontBody: "DMSans"). Unknown tenant fonts
  // simply fall back to the system font (see tokens.headingFont/bodyFont).
  const [fontsLoaded, fontError] = useFonts({
    PlayfairDisplay: PlayfairDisplay_600SemiBold,
    PlayfairDisplay_700Bold,
    DMSans: DMSans_400Regular,
    DMSans_Medium: DMSans_500Medium,
    DMSans_Bold: DMSans_700Bold,
  });
  // Holds an order id from a push tap that arrived before the navigator was
  // ready (e.g. cold start); flushed in NavigationContainer.onReady.
  const pendingOrderId = useRef<string | null>(null);

  const goToOrder = (orderId: string) => {
    if (navigationRef.isReady()) {
      navigationRef.navigate("Confirmation", { orderId, initialStatus: "ready" });
    } else {
      pendingOrderId.current = orderId;
    }
  };

  const flushPendingOrder = () => {
    const orderId = pendingOrderId.current;
    if (orderId && navigationRef.isReady()) {
      pendingOrderId.current = null;
      navigationRef.navigate("Confirmation", { orderId, initialStatus: "ready" });
    }
  };

  const navTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: t.background,
      card: t.surface,
      text: t.text,
      primary: t.primary,
      border: t.surface,
    },
  };

  useEffect(() => {
    const stopAttr = startMobileAttributionListener();
    const stopMotion = startReducedMotionListener();
    // Handles both foreground taps and the cold-start tap that launched the app.
    const stopPush = startPushListeners(goToOrder);
    return () => {
      stopAttr?.();
      stopMotion();
      stopPush();
    };
  }, []);

  // Hold on the brand background until fonts resolve (or fail) to avoid a
  // flash of the system font. No expo-splash-screen dependency needed.
  if (!fontsLoaded && !fontError) {
    return <View style={{ flex: 1, backgroundColor: t.background }} />;
  }

  return (
    <SafeAreaProvider>
      <CartProvider>
        <NavigationContainer theme={navTheme} ref={navigationRef} onReady={flushPendingOrder}>
          <StatusBar style={tenant.appId === "kirin" ? "dark" : "light"} />
          <Stack.Navigator
            screenOptions={{
              headerStyle: { backgroundColor: t.surface },
              headerTintColor: t.text,
              contentStyle: { backgroundColor: t.background },
            }}
          >
            <Stack.Screen
              name="MainTabs"
              component={MainTabs}
              options={{ headerShown: false }}
            />
            <Stack.Screen name="Cart" component={CartScreen} options={{ title: "Cart" }} />
            <Stack.Screen
              name="Checkout"
              component={CheckoutScreen}
              options={{ title: "Checkout" }}
            />
            <Stack.Screen
              name="Restaurant"
              component={RestaurantScreen}
              options={{ title: "Restaurant" }}
            />
            <Stack.Screen
              name="Confirmation"
              component={ConfirmationScreen}
              options={{ headerShown: false, gestureEnabled: false }}
            />
            <Stack.Screen
              name="Receipt"
              component={ReceiptScreen}
              options={{ title: "Receipt" }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </CartProvider>
    </SafeAreaProvider>
  );
}
