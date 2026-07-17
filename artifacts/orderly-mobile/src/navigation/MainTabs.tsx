import React, { useEffect, useRef } from "react";
import { Animated, Text } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { HomeScreen } from "../screens/HomeScreen";
import { ExploreScreen } from "../screens/ExploreScreen";
import { OrdersScreen } from "../screens/OrdersScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { tenant } from "../tenant";
import { bodyFont, prefersReducedMotionSync } from "../theme/tokens";
import type { MainTabParamList } from "../navigation";

const Tab = createBottomTabNavigator<MainTabParamList>();

function TabLabel({
  label,
  color,
}: {
  label: string;
  color: string;
}) {
  return (
    <Text
      style={{
        color,
        fontSize: 11,
        fontWeight: "700",
        fontFamily: bodyFont(),
      }}
    >
      {label}
    </Text>
  );
}

function TabIcon({
  glyph,
  color,
  focused,
}: {
  glyph: string;
  color: string;
  focused: boolean;
}) {
  const scale = useRef(new Animated.Value(focused ? 1.08 : 1)).current;

  useEffect(() => {
    if (prefersReducedMotionSync()) {
      scale.setValue(focused ? 1.08 : 1);
      return;
    }
    Animated.spring(scale, {
      toValue: focused ? 1.12 : 1,
      friction: 6,
      tension: 140,
      useNativeDriver: true,
    }).start();
  }, [focused, scale]);

  return (
    <Animated.Text
      style={{
        color,
        fontSize: 18,
        fontWeight: "700",
        transform: [{ scale }],
        opacity: focused ? 1 : 0.85,
      }}
    >
      {glyph}
    </Animated.Text>
  );
}

export function MainTabs() {
  const t = tenant.theme;
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: t.surface,
          borderTopColor: t.background,
          height: 58 + 8,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: ({ color }) => <TabLabel label="Home" color={color} />,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon glyph="⌂" color={color} focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Explore"
        component={ExploreScreen}
        options={{
          tabBarLabel: ({ color }) => (
            <TabLabel label="Explore" color={color} />
          ),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon glyph="◎" color={color} focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Orders"
        component={OrdersScreen}
        options={{
          tabBarLabel: ({ color }) => (
            <TabLabel label="Orders" color={color} />
          ),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon glyph="☰" color={color} focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: ({ color }) => (
            <TabLabel label="Profile" color={color} />
          ),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon glyph="☺" color={color} focused={focused} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
