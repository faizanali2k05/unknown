import React from 'react';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

function icon(active: IoniconName, inactive: IoniconName) {
  return ({ focused, color, size }: { focused: boolean; color: string; size: number }) => (
    <Ionicons name={focused ? active : inactive} size={size} color={color} />
  );
}

export default function TabsLayout() {
  const { t } = useTheme();
  // Respect the gesture bar / nav buttons so the tab bar is never clipped.
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: t.bg.primary },
        headerTitleStyle: { color: t.text.primary },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: t.bg.primary },
        tabBarStyle: {
          backgroundColor: t.bg.secondary,
          borderTopColor: t.border.default,
          height: 58 + insets.bottom,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
          paddingTop: 6,
        },
        tabBarActiveTintColor: t.accent.default,
        tabBarInactiveTintColor: t.text.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Chats', tabBarIcon: icon('chatbubbles', 'chatbubbles-outline') }}
      />
      <Tabs.Screen
        name="calls"
        options={{ title: 'Calls', tabBarIcon: icon('call', 'call-outline') }}
      />
      <Tabs.Screen
        name="contacts"
        options={{ title: 'Contacts', tabBarIcon: icon('people', 'people-outline') }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: icon('person-circle', 'person-circle-outline') }}
      />
    </Tabs>
  );
}
