import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTheme, spacing, radius, typography } from '../../src/theme';
import { Avatar, EmptyState, Icon } from '../../src/components/ui';
import { api, Conversation } from '../../src/api';
import { on } from '../../src/api/socket';

export default function Chats() {
  const { t } = useTheme();
  const router = useRouter();
  const [items, setItems] = useState<Conversation[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await api.conversations());
    } catch {
      /* the list simply stays as it was */
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      const offNew = on('message:new', () => void load());
      const offConv = on('conversation:new', () => void load());
      return () => {
        offNew();
        offConv();
      };
    }, [load]),
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg.primary }}>
      <FlatList
        data={items}
        keyExtractor={(c) => c.id}
        contentContainerStyle={items.length === 0 ? { flexGrow: 1 } : undefined}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={t.accent.default}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="chatbubbles-outline"
            title="No conversations yet"
            subtitle="Pick someone from Contacts to start chatting."
          />
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() =>
              router.push({ pathname: '/chat/[id]', params: { id: item.id, title: item.title } })
            }
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
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={[typography.heading, { color: t.text.primary }]} numberOfLines={1}>
                  {item.title}
                </Text>
                {item.last_message ? (
                  <Text style={[typography.caption, { color: t.text.muted }]}>
                    {formatTime(item.last_message.created_at)}
                  </Text>
                ) : null}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                {item.type === 'group' ? (
                  <Icon name="people" size={13} color={t.text.muted} />
                ) : null}
                <Text
                  style={[typography.body, { color: t.text.secondary, flex: 1, fontSize: 14 }]}
                  numberOfLines={1}
                >
                  {item.last_message?.body ?? 'Say hello'}
                </Text>
                {item.unread_count > 0 ? (
                  <View
                    style={{
                      backgroundColor: t.accent.default,
                      borderRadius: radius.pill,
                      minWidth: 22,
                      height: 22,
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingHorizontal: 6,
                    }}
                  >
                    <Text style={{ color: t.accent.on, fontSize: 11, fontWeight: '800' }}>
                      {item.unread_count}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
