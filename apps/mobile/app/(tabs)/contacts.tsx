import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTheme, spacing, radius, typography } from '../../src/theme';
import {
  Avatar,
  Button,
  EmptyState,
  Field,
  Icon,
} from '../../src/components/ui';
import { api, User } from '../../src/api';

export default function Contacts() {
  const { t } = useTheme();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [people, setPeople] = useState<User[]>([]);
  const [incoming, setIncoming] = useState<
    { direction: string; user: User; created_at: string }[]
  >([]);
  const [outgoing, setOutgoing] = useState<
    { direction: string; user: User; created_at: string }[]
  >([]);
  const [lookup, setLookup] = useState<{
    public_id: string;
    display_name: string;
    avatar_url: string | null;
  } | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [friends, requests, sent] = await Promise.all([
        api.friends(),
        api.friendRequests('incoming'),
        api.friendRequests('outgoing'),
      ]);
      setPeople(friends);
      setIncoming(requests);
      setOutgoing(sent);
    } catch {
      /* keep the previous list */
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const lookupUser = async () => {
    setBusy(true);
    setLookup(null);
    setNotice('');
    try {
      setLookup(await api.lookupUser(q.trim()));
    } catch {
      setNotice('User ID not found.');
    } finally {
      setBusy(false);
    }
  };

  const sendRequest = async () => {
    if (!lookup) return;
    setBusy(true);
    try {
      await api.sendFriendRequest(lookup.public_id);
      setNotice('Friend request sent.');
      setLookup(null);
      setQ('');
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Could not send friend request.',
      );
    } finally {
      setBusy(false);
    }
  };

  const openChat = async (u: User) => {
    const conv = await api.directConversation(u.public_id);
    router.push({
      pathname: '/chat/[id]',
      params: { id: conv.id, title: u.display_name },
    });
  };

  const call = async (u: User, kind: 'audio' | 'video') => {
    const conv = await api.directConversation(u.public_id);
    const started = await api.startCall(conv.id, kind);
    router.push({
      pathname: '/call/[id]',
      params: {
        id: started.call_id,
        name: u.display_name,
        kind,
        token: started.token,
      },
    });
  };

  const manageContact = (u: User) => {
    Alert.alert(u.display_name, 'Manage this contact', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove friend',
        style: 'destructive',
        onPress: async () => {
          await api.removeFriend(u.public_id);
          await load();
        },
      },
      {
        text: 'Block',
        style: 'destructive',
        onPress: async () => {
          await api.blockUser(u.public_id);
          await load();
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg.primary }}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <Field
          icon="keypad-outline"
          placeholder="Enter exact Unique ID"
          autoCapitalize="none"
          value={q}
          onChangeText={(v) => {
            setQ(v);
            setLookup(null);
            setNotice('');
          }}
        />
        <Button
          label="Look up ID"
          onPress={lookupUser}
          loading={busy}
          disabled={!q.trim()}
        />
        {notice ? (
          <Text
            style={[
              typography.caption,
              { color: t.text.secondary, marginTop: spacing.sm },
            ]}
          >
            {notice}
          </Text>
        ) : null}
        {lookup ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              paddingVertical: spacing.md,
            }}
          >
            <Avatar name={lookup.display_name} />
            <View style={{ flex: 1 }}>
              <Text style={[typography.heading, { color: t.text.primary }]}>
                {lookup.display_name}
              </Text>
              <Text style={[typography.caption, { color: t.text.muted }]}>
                {lookup.public_id}
              </Text>
            </View>
            <Pressable
              onPress={sendRequest}
              disabled={busy}
              style={{ padding: spacing.sm }}
            >
              <Icon name="person-add-outline" color={t.accent.default} />
            </Pressable>
          </View>
        ) : null}
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
        <Text style={[typography.heading, { color: t.accent.default }]}>
          New group
        </Text>
      </Pressable>

      {incoming.length > 0 ? (
        <View
          style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}
        >
          <Text
            style={[
              typography.caption,
              { color: t.text.muted, marginBottom: spacing.xs },
            ]}
          >
            Friend requests
          </Text>
          {incoming.map(({ user: requestUser }) => (
            <View
              key={requestUser.public_id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.sm,
                paddingVertical: spacing.sm,
              }}
            >
              <Avatar name={requestUser.display_name} size={38} />
              <View style={{ flex: 1 }}>
                <Text style={[typography.label, { color: t.text.primary }]}>
                  {requestUser.display_name}
                </Text>
                <Text style={[typography.caption, { color: t.text.muted }]}>
                  {requestUser.public_id}
                </Text>
              </View>
              <Pressable
                onPress={async () => {
                  await api.acceptFriendRequest(requestUser.public_id);
                  await load();
                }}
                accessibilityRole="button"
              >
                <Icon name="checkmark-circle" color={t.accent.default} />
              </Pressable>
              <Pressable
                onPress={async () => {
                  await api.rejectFriendRequest(requestUser.public_id);
                  await load();
                }}
                accessibilityRole="button"
              >
                <Icon name="close-circle-outline" color={t.text.muted} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {outgoing.length > 0 ? (
        <View
          style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}
        >
          <Text
            style={[
              typography.caption,
              { color: t.text.muted, marginBottom: spacing.xs },
            ]}
          >
            Sent requests
          </Text>
          {outgoing.map(({ user: requestUser }) => (
            <View
              key={requestUser.public_id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.sm,
                paddingVertical: spacing.sm,
              }}
            >
              <Avatar name={requestUser.display_name} size={38} />
              <View style={{ flex: 1 }}>
                <Text style={[typography.label, { color: t.text.primary }]}>
                  {requestUser.display_name}
                </Text>
                <Text style={[typography.caption, { color: t.text.muted }]}>
                  {requestUser.public_id}
                </Text>
              </View>
              <Pressable
                onPress={async () => {
                  await api.cancelFriendRequest(requestUser.public_id);
                  await load();
                }}
                accessibilityRole="button"
              >
                <Icon name="close-circle-outline" color={t.text.muted} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <FlatList
        data={people}
        keyExtractor={(u) => u.public_id}
        contentContainerStyle={
          people.length === 0 ? { flexGrow: 1 } : undefined
        }
        ListEmptyComponent={
          <EmptyState
            icon="people-outline"
            title="No contacts yet"
            subtitle="Add someone using their exact Unique ID."
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
            <Pressable
              onPress={() => openChat(item)}
              style={{
                flexDirection: 'row',
                flex: 1,
                alignItems: 'center',
                gap: spacing.md,
              }}
            >
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
                <Text
                  style={[typography.caption, { color: t.text.muted }]}
                  numberOfLines={1}
                >
                  {item.status_text || `@${item.username}`}
                </Text>
              </View>
            </Pressable>

            <IconButton
              icon="chatbubble-outline"
              onPress={() => openChat(item)}
            />
            <IconButton
              icon="call-outline"
              onPress={() => call(item, 'audio')}
              accent
            />
            <IconButton
              icon="videocam-outline"
              onPress={() => call(item, 'video')}
              accent
            />
            <IconButton
              icon="ellipsis-horizontal"
              onPress={() => manageContact(item)}
            />
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
      <Icon
        name={icon}
        size={18}
        color={accent ? t.accent.default : t.text.primary}
      />
    </Pressable>
  );
}
