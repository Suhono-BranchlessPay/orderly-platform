import React, { useEffect } from "react";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { CartProvider } from "./src/state/cart";
import { HomeScreen } from "./src/screens/HomeScreen";
import { CartScreen } from "./src/screens/CartScreen";
import { CheckoutScreen } from "./src/screens/CheckoutScreen";
import { ConfirmationScreen } from "./src/screens/ConfirmationScreen";
import { RestaurantScreen } from "./src/screens/RestaurantScreen";
import { tenant } from "./src/tenant";
import { startMobileAttributionListener } from "./src/attribution";
import { startReducedMotionListener } from "./src/theme/tokens";
import type { RootStackParamList } from "./src/navigation";

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const t = tenant.theme;
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
    return () => {
      stopAttr?.();
      stopMotion();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <CartProvider>
        <NavigationContainer theme={navTheme}>
          <StatusBar style={tenant.appId === "kirin" ? "dark" : "light"} />
          <Stack.Navigator
            screenOptions={{
              headerStyle: { backgroundColor: t.surface },
              headerTintColor: t.text,
              contentStyle: { backgroundColor: t.background },
            }}
          >
            <Stack.Screen
              name="Home"
              component={HomeScreen}
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
          </Stack.Navigator>
        </NavigationContainer>
      </CartProvider>
    </SafeAreaProvider>
  );
}
