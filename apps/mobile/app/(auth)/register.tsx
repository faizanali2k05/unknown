import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useTheme, spacing, typography } from '../../src/theme';
import { Button, Field } from '../../src/components/ui';
import { useAuth } from '../../src/store/auth';
import { ApiError } from '../../src/api';

export default function Register() {
  const { t } = useTheme();
  const { signUp } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await signUp(username.trim(), password, displayName.trim());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create account');
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
        <Text style={[typography.title, { color: t.text.primary, marginBottom: spacing.xs }]}>
          Create account
        </Text>
        <Text style={[typography.body, { color: t.text.secondary, marginBottom: spacing.xl }]}>
Pick a username and you're in.
        </Text>

        <Field
          label="Your name"
          icon="happy-outline"
          placeholder="Sara Khan"
          value={displayName}
          onChangeText={setDisplayName}
        />
        <Field
          label="Username"
          icon="person-outline"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="sara"
          value={username}
          onChangeText={setUsername}
        />
        <Field
          label="Password"
          icon="lock-closed-outline"
          secureTextEntry
          placeholder="at least 8 characters"
          value={password}
          onChangeText={setPassword}
        />

        {error ? (
          <Text style={[typography.caption, { color: t.status.danger, marginBottom: spacing.md }]}>
            {error}
          </Text>
        ) : null}

        <Button label="Create account" onPress={submit} loading={busy} />

        <Link href="/(auth)/login" asChild>
          <Pressable style={{ marginTop: spacing.xl, alignItems: 'center' }}>
            <Text style={[typography.body, { color: t.text.secondary }]}>
              Already have an account?{' '}
              <Text style={{ color: t.accent.default, fontWeight: '700' }}>Sign in</Text>
            </Text>
          </Pressable>
        </Link>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}
