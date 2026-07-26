import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTheme, spacing, radius, typography, ThemePreference } from '../../src/theme';
import { Avatar, Button, Field, Icon } from '../../src/components/ui';
import { useAuth } from '../../src/store/auth';
import { api } from '../../src/api';

export default function Profile() {
  const { t, preference, setPreference } = useTheme();
  const { user, signOut, refresh } = useAuth();
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [statusText, setStatusText] = useState(user?.status_text ?? '');
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  const save = async () => {
    setBusy(true);
    try {
      await api.updateMe({ display_name: displayName.trim(), status_text: statusText.trim() });
      await refresh();
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg.primary }}>
      <View style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
        <Avatar name={user.display_name} size={84} />
        <Text style={[typography.title, { color: t.text.primary, marginTop: spacing.md }]}>
          {user.display_name}
        </Text>
        <Text style={[typography.body, { color: t.text.secondary }]}>@{user.username}</Text>
        {user.status_text ? (
          <Text style={[typography.caption, { color: t.text.muted, marginTop: spacing.xs }]}>
            {user.status_text}
          </Text>
        ) : null}
      </View>

      <Section title="Profile">
        {editing ? (
          <View style={{ padding: spacing.lg }}>
            <Field label="Display name" value={displayName} onChangeText={setDisplayName} />
            <Field
              label="Status"
              placeholder="What are you working on?"
              value={statusText}
              onChangeText={setStatusText}
            />
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <Button
                label="Cancel"
                variant="ghost"
                onPress={() => setEditing(false)}
                style={{ flex: 1 }}
              />
              <Button label="Save" onPress={save} loading={busy} style={{ flex: 1 }} />
            </View>
          </View>
        ) : (
          <Row icon="create-outline" label="Edit profile" onPress={() => setEditing(true)} />
        )}
      </Section>

      <Section title="Appearance">
        <View style={{ flexDirection: 'row', gap: spacing.sm, padding: spacing.lg }}>
          {(['system', 'light', 'dark'] as ThemePreference[]).map((p) => {
            const active = preference === p;
            return (
              <Pressable
                key={p}
                onPress={() => setPreference(p)}
                style={{
                  flex: 1,
                  paddingVertical: spacing.md,
                  alignItems: 'center',
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: active ? t.accent.default : t.border.default,
                  backgroundColor: active ? t.accent.subtle : 'transparent',
                }}
              >
                <Text
                  style={[
                    typography.label,
                    { color: active ? t.accent.default : t.text.secondary },
                  ]}
                >
                  {p[0].toUpperCase() + p.slice(1)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Section>

      <View style={{ padding: spacing.xl }}>
        <Button label="Sign out" variant="danger" onPress={signOut} />
        <Text
          style={[
            typography.caption,
            { color: t.text.muted, textAlign: 'center', marginTop: spacing.lg },
          ]}
        >
          Unknown · v0.1.0
        </Text>
      </View>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { t } = useTheme();
  return (
    <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg }}>
      <Text
        style={[
          typography.caption,
          {
            color: t.text.muted,
            marginBottom: spacing.sm,
            textTransform: 'uppercase',
            letterSpacing: 1,
          },
        ]}
      >
        {title}
      </Text>
      <View
        style={{
          backgroundColor: t.bg.secondary,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: t.border.default,
          overflow: 'hidden',
        }}
      >
        {children}
      </View>
    </View>
  );
}

function Row({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Icon>['name'];
  label: string;
  onPress: () => void;
}) {
  const { t } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.lg,
      }}
    >
      <Icon name={icon} size={20} color={t.accent.default} />
      <Text style={[typography.body, { color: t.text.primary, flex: 1 }]}>{label}</Text>
      <Icon name="chevron-forward" size={18} color={t.text.muted} />
    </Pressable>
  );
}
