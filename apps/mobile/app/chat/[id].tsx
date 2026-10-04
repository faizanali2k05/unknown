import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import {
  KeyboardAvoidingView,
  useKeyboardState,
} from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { useTheme, spacing, radius, typography } from '../../src/theme';
import { Icon } from '../../src/components/ui';
import { api, Message } from '../../src/api';
import { emit, on } from '../../src/api/socket';
import { useAuth } from '../../src/store/auth';

/** RFC4122-ish v4 id. The server requires a real UUID for client_id. */
function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function Chat() {
  const { t } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const navigation = useNavigation();
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();

  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [peerTyping, setPeerTyping] = useState(false);
  const insets = useSafeAreaInsets();
  // KeyboardAvoidingView measures from the window top, but this screen starts
  // below the native header — without that offset the composer ends up behind
  // the keyboard by exactly the header's height.
  const headerHeight = useHeaderHeight();
  const keyboard = useKeyboardState();
  const listRef = useRef<FlatList<Message>>(null);
  const typingSent = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingClear = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Header: title + call buttons.
  useEffect(() => {
    navigation.setOptions({
      title: title ?? 'Chat',
      headerRight: () => (
        <View style={{ flexDirection: 'row', gap: spacing.lg }}>
          <Pressable onPress={() => startCall('audio')}>
            <Icon name="call" size={21} color={t.accent.default} />
          </Pressable>
          <Pressable onPress={() => startCall('video')}>
            <Icon name="videocam" size={22} color={t.accent.default} />
          </Pressable>
        </View>
      ),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, title, t]);

  const startCall = async (kind: 'audio' | 'video') => {
    const call = await api.startCall(id, kind);
    router.push({
      pathname: '/call/[id]',
      params: {
        id: call.call_id,
        name: title ?? 'Call',
        kind,
        token: call.token,
      },
    });
  };

  const load = useCallback(async () => {
    const res = await api.history(id);
    // API returns newest-first; the list renders oldest-first.
    setMessages(res.messages.slice().reverse());
    await api.markRead(id).catch(() => undefined);
  }, [id]);

  useEffect(() => {
    void load();

    const offNew = on<Message>('message:new', (m) => {
      if (m.conversation_id !== id) return;
      setMessages((prev) => {
        // Reconcile our optimistic row by client_id, else append if new.
        const i = prev.findIndex((x) => x.client_id === m.client_id);
        if (i >= 0) {
          const copy = prev.slice();
          copy[i] = { ...m, status: 'sent' };
          return copy;
        }
        return prev.some((x) => x.id === m.id) ? prev : [...prev, m];
      });
      if (m.sender_public_id !== user?.public_id)
        void api.markRead(id).catch(() => undefined);
    });

    const offTyping = on<{ conversation_id: string; user_public_id: string }>(
      'message:typing',
      (d) => {
        if (d.conversation_id !== id || d.user_public_id === user?.public_id)
          return;
        setPeerTyping(true);
        if (typingClear.current) clearTimeout(typingClear.current);
        typingClear.current = setTimeout(() => setPeerTyping(false), 3000);
      },
    );

    const offDeleted = on<{ message_id: string }>('message:deleted', (d) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === d.message_id
            ? { ...m, body: null, deleted_at: new Date().toISOString() }
            : m,
        ),
      );
    });

    return () => {
      offNew();
      offTyping();
      offDeleted();
    };
  }, [id, load, user?.public_id]);

  const onChangeText = (v: string) => {
    setText(v);
    // Throttle typing pings to at most one per 1.5s.
    if (!typingSent.current) {
      emit('message:typing', { conversation_id: id });
      typingSent.current = setTimeout(() => {
        typingSent.current = null;
      }, 1500);
    }
  };

  const send = async () => {
    const body = text.trim();
    if (!body || !user) return;
    setText('');

    const clientId = uuid();
    const optimistic: Message = {
      id: clientId,
      client_id: clientId,
      conversation_id: id,
      sender_public_id: user.public_id,
      type: 'text',
      body,
      media_url: null,
      reply_to_id: null,
      created_at: new Date().toISOString(),
      deleted_at: null,
      status: 'sending',
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const saved = await api.sendMessage(id, { client_id: clientId, body });
      setMessages((prev) =>
        prev.map((m) =>
          m.client_id === clientId ? { ...saved, status: 'sent' } : m,
        ),
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.client_id === clientId ? { ...m, status: 'failed' } : m,
        ),
      );
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.bg.primary }}
      behavior="padding"
      keyboardVerticalOffset={headerHeight}
    >
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.client_id || m.id}
        contentContainerStyle={{ padding: spacing.md, gap: 6 }}
        onContentSizeChange={() =>
          listRef.current?.scrollToEnd({ animated: true })
        }
        renderItem={({ item }) => {
          const mine = item.sender_public_id === user?.public_id;
          const deleted = !!item.deleted_at;
          return (
            <View
              style={{
                flexDirection: 'row',
                justifyContent: mine ? 'flex-end' : 'flex-start',
              }}
            >
              <Pressable
                onLongPress={() => {
                  // Delete for everyone. Only your own, already-saved messages:
                  // an optimistic row has no server id to delete yet.
                  if (
                    !mine ||
                    deleted ||
                    item.status === 'sending' ||
                    item.status === 'failed'
                  ) {
                    return;
                  }
                  void api.deleteMessage(item.id).catch(() => undefined);
                }}
                style={{
                  maxWidth: '80%',
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm + 2,
                  borderRadius: radius.lg,
                  backgroundColor: mine ? t.bubble.mine : t.bubble.theirs,
                  borderBottomRightRadius: mine ? 4 : radius.lg,
                  borderBottomLeftRadius: mine ? radius.lg : 4,
                }}
              >
                <Text
                  style={[
                    typography.body,
                    {
                      color: mine ? t.bubble.mineText : t.bubble.theirsText,
                      fontStyle: deleted ? 'italic' : 'normal',
                      opacity: deleted ? 0.6 : 1,
                    },
                  ]}
                >
                  {deleted ? 'This message was deleted' : item.body}
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    alignSelf: 'flex-end',
                    gap: 4,
                    marginTop: 3,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      color: mine ? t.bubble.mineText : t.text.muted,
                      opacity: 0.7,
                    }}
                  >
                    {new Date(item.created_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                  {mine ? (
                    <Icon
                      name={
                        item.status === 'sending'
                          ? 'time-outline'
                          : item.status === 'failed'
                            ? 'alert-circle-outline'
                            : 'checkmark-done'
                      }
                      size={13}
                      color={
                        item.status === 'failed'
                          ? t.status.danger
                          : t.bubble.mineText
                      }
                    />
                  ) : null}
                </View>
              </Pressable>
            </View>
          );
        }}
        ListFooterComponent={
          peerTyping ? (
            <Text
              style={[
                typography.caption,
                {
                  color: t.text.muted,
                  fontStyle: 'italic',
                  marginLeft: spacing.sm,
                },
              ]}
            >
              typing…
            </Text>
          ) : null
        }
      />

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: spacing.sm,
          paddingHorizontal: spacing.md,
          paddingTop: spacing.md,
          // Clear the Android gesture bar / nav buttons; the fallback keeps a
          // comfortable gap on devices that report no inset.
          // Clear the gesture bar when the keyboard is down. With it up the
          // KeyboardAvoidingView already supplies the offset, so adding the
          // inset again would leave a visible gap above the keyboard.
          paddingBottom:
            spacing.md +
            (keyboard.isVisible
              ? 0
              : insets.bottom > 0
                ? insets.bottom
                : spacing.xs),
          borderTopWidth: 1,
          borderTopColor: t.border.default,
          backgroundColor: t.bg.secondary,
        }}
      >
        <TextInput
          value={text}
          onChangeText={onChangeText}
          placeholder="Message"
          placeholderTextColor={t.text.muted}
          multiline
          style={{
            flex: 1,
            minHeight: 44,
            maxHeight: 120,
            color: t.text.primary,
            fontSize: 16,
            backgroundColor: t.bg.primary,
            borderRadius: radius.lg,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.md,
            paddingBottom: spacing.md,
          }}
        />
        <Pressable
          onPress={send}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: t.accent.default,
          }}
        >
          <Icon name="send" size={18} color={t.accent.on} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
