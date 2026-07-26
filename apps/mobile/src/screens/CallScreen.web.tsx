import React from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme, spacing, typography } from '../theme';
import { Button, Icon } from '../components/ui';

/**
 * Web stub. Metro picks this over CallScreen.tsx when bundling for web, which
 * keeps LiveKit's native WebRTC module out of the browser bundle entirely —
 * it calls `requireNativeComponent`, which react-native-web does not provide,
 * and importing it anywhere takes the whole app down. Android is unaffected.
 */
export default function CallScreenWeb() {
  const { t } = useTheme();
  const router = useRouter();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: t.bg.primary,
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.xxl,
        gap: spacing.md,
      }}
    >
      <Icon name="videocam-off-outline" size={48} color={t.text.muted} />
      <Text style={[typography.heading, { color: t.text.primary }]}>
        Calls need the mobile app
      </Text>
      <Text
        style={[
          typography.body,
          { color: t.text.secondary, textAlign: 'center', marginBottom: spacing.lg },
        ]}
      >
        Voice and video run on native WebRTC, so they only work in the Android build. Everything
        else works here.
      </Text>
      <Button label="Go back" variant="ghost" onPress={() => router.back()} />
    </View>
  );
}
