import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { ThemeProvider, useTheme } from '../src/theme';
import { AuthProvider, useAuth } from '../src/store/auth';
import { on } from '../src/api/socket';

/** Sends the user to the right stack once auth state is known. */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { ready, user } = useAuth();
  const { t } = useTheme();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!user && !inAuthGroup) router.replace('/(auth)/login');
    else if (user && inAuthGroup) router.replace('/(tabs)');
  }, [ready, user, segments, router]);

  // Ring on an incoming call from anywhere in the app.
  useEffect(() => {
    if (!user) return;
    return on<{ call_id: string; initiator_display_name: string; kind: 'audio' | 'video' }>(
      'call:incoming',
      (d) => {
        router.push({
          pathname: '/call/[id]',
          params: {
            id: d.call_id,
            name: d.initiator_display_name,
            kind: d.kind,
            incoming: '1',
          },
        });
      },
    );
  }, [user, router]);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg.primary, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={t.accent.default} size="large" />
      </View>
    );
  }
  return <>{children}</>;
}

function Root() {
  const { t, scheme } = useTheme();
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <AuthGate>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: t.bg.primary },
            headerTitleStyle: { color: t.text.primary },
            headerTintColor: t.accent.default,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: t.bg.primary },
          }}
        >
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="chat/[id]" options={{ title: 'Chat' }} />
          <Stack.Screen
            name="call/[id]"
            options={{ headerShown: false, presentation: 'fullScreenModal' }}
          />
          <Stack.Screen name="new-group" options={{ title: 'New group' }} />
          <Stack.Screen name="invites" options={{ title: 'Invite codes' }} />
        </Stack>
      </AuthGate>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <ThemeProvider>
            <AuthProvider>
              <Root />
            </AuthProvider>
          </ThemeProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
