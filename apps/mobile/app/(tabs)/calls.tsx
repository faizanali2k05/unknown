import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTheme, spacing, typography } from '../../src/theme';
import { Avatar, EmptyState, Icon } from '../../src/components/ui';
import { api, CallRecord } from '../../src/api';

export default function Calls() {
  const { t } = useTheme();
  const router = useRouter();
  const [items, setItems] = useState<CallRecord[]>([]);

  useFocusEffect(
    useCallback(() => {
      api.callHistory().then(setItems).catch(() => undefined);
    }, []),
  );

  const redial = async (c: CallRecord) => {
    try {
      const call = await api.startCall(c.conversation_id, c.kind);
      router.push({
        pathname: '/call/[id]',
        params: { id: call.call_id, name: c.title, kind: c.kind, token: call.token },
      });
    } catch {
      /* surfaced on the call screen if it gets that far */
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg.primary }}>
      <FlatList
        data={items}
        keyExtractor={(c) => c.id}
        contentContainerStyle={items.length === 0 ? { flexGrow: 1 } : undefined}
        ListEmptyComponent={
          <EmptyState
            icon="call-outline"
            title="No calls yet"
            subtitle="Start a call from a chat or a contact."
          />
        }
        renderItem={({ item }) => {
          const missed = !item.ended_at || item.end_reason === 'declined';
          return (
            <Pressable
              onPress={() => redial(item)}
              style={({ pressed }) => [
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                  paddingHorizontal: spacing.lg,
                  paddingVertical: spacing.md,
                  backgroundColor: pressed ? t.bg.secondary : 'transparent',
                },
              ]}
            >
              <Avatar name={item.title} />
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={[typography.heading, { color: t.text.primary }]}>{item.title}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                  <Icon
                    name={item.direction === 'outgoing' ? 'arrow-up-outline' : 'arrow-down-outline'}
                    size={13}
                    color={missed ? t.status.danger : t.text.muted}
                  />
                  <Text
                    style={[
                      typography.caption,
                      { color: missed ? t.status.danger : t.text.secondary },
                    ]}
                  >
                    {item.direction === 'outgoing' ? 'Outgoing' : 'Incoming'}
                    {item.duration_sec != null ? ` · ${formatDuration(item.duration_sec)}` : ''}
                    {` · ${formatDate(item.started_at)}`}
                  </Text>
                </View>
              </View>
              <Icon
                name={item.kind === 'video' ? 'videocam-outline' : 'call-outline'}
                size={20}
                color={t.accent.default}
              />
            </Pressable>
          );
        }}
      />
    </View>
  );
}

function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, '0')}`;
}
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}
