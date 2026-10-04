import React, { useCallback, useState } from 'react';
import { FlatList, Platform, Pressable, Share, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { useTheme, spacing, typography } from '../../src/theme';
import { Avatar, Button, EmptyState, Icon } from '../../src/components/ui';
import { api, CallRecord } from '../../src/api';

export default function Calls() {
  const { t } = useTheme();
  const router = useRouter();
  const [items, setItems] = useState<CallRecord[]>([]);
  const [meetingBusy, setMeetingBusy] = useState(false);
  const [meetingError, setMeetingError] = useState('');

  useFocusEffect(
    useCallback(() => {
      api
        .callHistory()
        .then(setItems)
        .catch(() => undefined);
    }, []),
  );

  const redial = async (c: CallRecord) => {
    try {
      const call = await api.startCall(c.conversation_id, c.kind);
      router.push({
        pathname: '/call/[id]',
        params: {
          id: call.call_id,
          name: c.title,
          kind: c.kind,
          token: call.token,
        },
      });
    } catch {
      /* surfaced on the call screen if it gets that far */
    }
  };

  const createMeeting = async () => {
    setMeetingBusy(true);
    setMeetingError('');
    try {
      const meeting = await api.createMeeting();
      const url =
        meeting.meeting_url ??
        (Platform.OS === 'web'
          ? `${window.location.origin}/meeting/${meeting.meeting_code}`
          : Linking.createURL(`/meeting/${meeting.meeting_code}`));
      try {
        if (Platform.OS === 'web') {
          if (navigator.share) await navigator.share({ title: 'Unknown meeting', text: 'Join my video meeting', url });
          else window.prompt('Copy this meeting link', url);
        } else {
          await Share.share({ message: `Join my video meeting: ${url}`, url });
        }
      } catch (error) {
        if (!(error instanceof Error && error.name === 'AbortError')) {
          setMeetingError('Meeting created. You can still invite someone from the link.');
        }
      }
      router.push({
        pathname: '/call/[id]',
        params: {
          id: meeting.meeting_code,
          name: 'Meeting',
          kind: 'video',
          token: meeting.token,
          meeting: '1',
          meeting_owner: '1',
        },
      });
    } catch (error) {
      setMeetingError(error instanceof Error ? error.message : 'Could not create the meeting link.');
    } finally {
      setMeetingBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg.primary }}>
      <FlatList
        data={items}
        keyExtractor={(c) => c.id}
        contentContainerStyle={items.length === 0 ? { flexGrow: 1 } : undefined}
        ListHeaderComponent={
          <View style={{ padding: spacing.lg }}>
            {meetingError ? <Text style={[typography.caption, { color: t.status.danger, marginBottom: spacing.sm }]}>{meetingError}</Text> : null}
            <Button label="Create meeting link" onPress={createMeeting} loading={meetingBusy} />
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="call-outline"
            title="No calls yet"
            subtitle="Start a call from a chat or a contact."
          />
        }
        renderItem={({ item }) => {
          const missed =
            item.status === 'missed' ||
            item.status === 'rejected' ||
            item.status === 'failed';
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
                <Text style={[typography.heading, { color: t.text.primary }]}>
                  {item.title}
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.xs,
                  }}
                >
                  <Icon
                    name={
                      item.direction === 'outgoing'
                        ? 'arrow-up-outline'
                        : 'arrow-down-outline'
                    }
                    size={13}
                    color={missed ? t.status.danger : t.text.muted}
                  />
                  <Text
                    style={[
                      typography.caption,
                      { color: missed ? t.status.danger : t.text.secondary },
                    ]}
                  >
                    {item.status === 'missed'
                      ? 'Missed'
                      : item.status === 'rejected'
                        ? 'Rejected'
                        : item.direction === 'outgoing'
                          ? 'Outgoing'
                          : 'Incoming'}
                    {item.duration_sec != null
                      ? ` · ${formatDuration(item.duration_sec)}`
                      : ''}
                    {` · ${formatDate(item.started_at)}`}
                  </Text>
                </View>
              </View>
              <Icon
                name={
                  item.kind === 'video' ? 'videocam-outline' : 'call-outline'
                }
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
  return new Date(iso).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });
}
