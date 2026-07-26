import React, { useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useTheme, spacing, typography } from '../../src/theme';
import { Button, Field } from '../../src/components/ui';
import { useAuth } from '../../src/store/auth';
import { ApiError } from '../../src/api';

export default function Login() {
  const { t } = useTheme();
  const { signIn } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await signIn(username.trim(), password);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not sign in');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg.primary }}>
      <KeyboardAwareScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: spacing.xl }}
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
      >
        <View style={{ alignItems: 'center', marginBottom: spacing.xxl }}>
          <Image
            source={require('../../assets/splash-icon.png')}
            style={{ width: 96, height: 96 }}
            resizeMode="contain"
          />
          <Text style={[typography.title, { color: t.text.primary, marginTop: spacing.lg }]}>
            Unknown
          </Text>
          <Text style={[typography.body, { color: t.text.secondary, marginTop: spacing.xs }]}>
            Sign in to your team
          </Text>
        </View>

        <Field
          label="Username"
          icon="person-outline"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="your username"
          value={username}
          onChangeText={setUsername}
        />
        <Field
          label="Password"
          icon="lock-closed-outline"
          secureTextEntry
          placeholder="••••••••"
          value={password}
          onChangeText={setPassword}
        />

        {error ? (
          <Text style={[typography.caption, { color: t.status.danger, marginBottom: spacing.md }]}>
            {error}
          </Text>
        ) : null}

        <Button label="Sign in" onPress={submit} loading={busy} />

        <Link href="/(auth)/register" asChild>
          <Pressable style={{ marginTop: spacing.xl, alignItems: 'center' }}>
            <Text style={[typography.body, { color: t.text.secondary }]}>
New here?{' '}
              <Text style={{ color: t.accent.default, fontWeight: '700' }}>Create account</Text>
            </Text>
          </Pressable>
        </Link>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}
