import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, Share, Text, View } from 'react-native';
import { useTheme, spacing, radius, typography } from '../src/theme';
import { Button, EmptyState, Icon } from '../src/components/ui';
import { api } from '../src/api';

interface Invite {
  code: string;
  used: boolean;
  used_by: string | null;
}

/** Admin-only: mint invite codes and see which have been redeemed. */
export default function Invites() {
  const { t } = useTheme();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.listInvites().then(setInvites).catch(() => undefined);
  }, []);

  useEffect(() => load(), [load]);

  const mint = async () => {
    setBusy(true);
    try {
      await api.createInvites(5);
      load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg.primary }}>
      <View style={{ padding: spacing.lg }}>
        <Button label="Generate 5 codes" onPress={mint} loading={busy} />
      </View>

      <FlatList
        data={invites}
        keyExtractor={(i) => i.code}
        contentContainerStyle={invites.length === 0 ? { flexGrow: 1 } : undefined}
        ListEmptyComponent={
          <EmptyState
            icon="key-outline"
            title="No codes yet"
            subtitle="Generate codes and share one with each teammate."
          />
        }
        renderItem={({ item }) => (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              marginHorizontal: spacing.lg,
              marginBottom: spacing.sm,
              padding: spacing.lg,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: t.border.default,
              backgroundColor: t.bg.secondary,
              opacity: item.used ? 0.55 : 1,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  typography.heading,
                  { color: t.text.primary, letterSpacing: 2, fontFamily: 'monospace' },
                ]}
              >
                {item.code}
              </Text>
              <Text style={[typography.caption, { color: t.text.muted }]}>
                {item.used ? `Used by @${item.used_by}` : 'Available'}
              </Text>
            </View>
            {!item.used ? (
              <Pressable
                hitSlop={12}
                onPress={() =>
                  Share.share({ message: `Your Unknown invite code: ${item.code}` })
                }
              >
                <Icon name="share-outline" size={20} color={t.accent.default} />
              </Pressable>
            ) : (
              <Icon name="checkmark-circle" size={20} color={t.text.muted} />
            )}
          </View>
        )}
      />
    </View>
  );
}
