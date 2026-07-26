import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTheme, spacing, radius, typography } from '../../src/theme';
import { Avatar, EmptyState, Field, Icon } from '../../src/components/ui';
import { api, User } from '../../src/api';

export default function Contacts() {
  const { t } = useTheme();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [people, setPeople] = useState<User[]>([]);

  const load = useCallback(async (query?: string) => {
    try {
      setPeople(await api.directory(query));
    } catch {
      /* keep the previous list */
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const openChat = async (u: User) => {
    const conv = await api.directConversation(u.id);
    router.push({ pathname: '/chat/[id]', params: { id: conv.id, title: u.display_name } });
  };

  const call = async (u: User, kind: 'audio' | 'video') => {
    const conv = await api.directConversation(u.id);
    const started = await api.startCall(conv.id, kind);
    router.push({
      pathname: '/call/[id]',
      params: { id: started.call_id, name: u.display_name, kind, token: started.token },
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg.primary }}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <Field
          icon="search"
          placeholder="Search your team"
          autoCapitalize="none"
          value={q}
          onChangeText={(v) => {
            setQ(v);
            void load(v.trim() || undefined);
          }}
        />
      </View>

      <Pressable
        onPress={() => router.push('/new-group')}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
        }}
      >
        <View
          style={{
            width: 46,
            height: 46,
            borderRadius: 23,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: t.accent.subtle,
          }}
        >
          <Icon name="people" size={22} color={t.accent.default} />
        </View>
        <Text style={[typography.heading, { color: t.accent.default }]}>New group</Text>
      </Pressable>

      <FlatList
        data={people}
        keyExtractor={(u) => u.id}
        contentContainerStyle={people.length === 0 ? { flexGrow: 1 } : undefined}
        ListEmptyComponent={
          <EmptyState
            icon="people-outline"
            title={q ? 'Nobody matches that' : 'No teammates yet'}
            subtitle={q ? undefined : 'Invite people from the Profile tab.'}
          />
        }
        renderItem={({ item }) => (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.md,
            }}
          >
            <Pressable onPress={() => openChat(item)} style={{ flexDirection: 'row', flex: 1, alignItems: 'center', gap: spacing.md }}>
              <View>
                <Avatar name={item.display_name} />
                {item.online ? (
                  <View
                    style={{
                      position: 'absolute',
                      right: 0,
                      bottom: 0,
                      width: 13,
                      height: 13,
                      borderRadius: 7,
                      backgroundColor: t.status.success,
                      borderWidth: 2,
                      borderColor: t.bg.primary,
                    }}
                  />
                ) : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[typography.heading, { color: t.text.primary }]}>
                  {item.display_name}
                </Text>
                <Text style={[typography.caption, { color: t.text.muted }]} numberOfLines={1}>
                  {item.status_text || `@${item.username}`}
                </Text>
              </View>
            </Pressable>

            <IconButton icon="chatbubble-outline" onPress={() => openChat(item)} />
            <IconButton icon="call-outline" onPress={() => call(item, 'audio')} accent />
            <IconButton icon="videocam-outline" onPress={() => call(item, 'video')} accent />
          </View>
        )}
      />
    </View>
  );
}

function IconButton({
  icon,
  onPress,
  accent,
}: {
  icon: React.ComponentProps<typeof Icon>['name'];
  onPress: () => void;
  accent?: boolean;
}) {
  const { t } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        width: 40,
        height: 40,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: accent ? t.accent.subtle : t.bg.secondary,
        borderWidth: 1,
        borderColor: accent ? t.accent.default : t.border.default,
      }}
    >
      <Icon name={icon} size={18} color={accent ? t.accent.default : t.text.primary} />
    </Pressable>
  );
}
