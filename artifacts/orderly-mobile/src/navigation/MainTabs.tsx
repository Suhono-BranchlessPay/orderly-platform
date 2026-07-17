import React from "react";
import { Text } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { HomeScreen } from "../screens/HomeScreen";
import { ExploreScreen } from "../screens/ExploreScreen";
import { OrdersScreen } from "../screens/OrdersScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { tenant } from "../tenant";
import { bodyFont } from "../theme/tokens";
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

function TabIcon({ glyph, color }: { glyph: string; color: string }) {
  return (
    <Text style={{ color, fontSize: 18, fontWeight: "700" }}>{glyph}</Text>
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
          tabBarIcon: ({ color }) => <TabIcon glyph="⌂" color={color} />,
        }}
      />
      <Tab.Screen
        name="Explore"
        component={ExploreScreen}
        options={{
          tabBarLabel: ({ color }) => (
            <TabLabel label="Explore" color={color} />
          ),
          tabBarIcon: ({ color }) => <TabIcon glyph="◎" color={color} />,
        }}
      />
      <Tab.Screen
        name="Orders"
        component={OrdersScreen}
        options={{
          tabBarLabel: ({ color }) => (
            <TabLabel label="Orders" color={color} />
          ),
          tabBarIcon: ({ color }) => <TabIcon glyph="☰" color={color} />,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: ({ color }) => (
            <TabLabel label="Profile" color={color} />
          ),
          tabBarIcon: ({ color }) => <TabIcon glyph="☺" color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}
