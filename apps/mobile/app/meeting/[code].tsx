import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme, spacing, typography } from '../../src/theme';
import { Button } from '../../src/components/ui';
import { api } from '../../src/api';

export default function JoinMeeting() {
  const { t } = useTheme();
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code: string }>();
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void api
      .joinMeeting(code)
      .then((meeting) => {
        if (!active) return;
        router.replace({
          pathname: '/call/[id]',
          params: {
            id: meeting.meeting_code,
            name: 'Meeting',
            kind: 'video',
            token: meeting.token,
            meeting: '1',
            meeting_owner: meeting.is_creator ? '1' : '0',
          },
        });
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Could not join this meeting.',
          );
      });
    return () => {
      active = false;
    };
  }, [code, router]);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: t.bg.primary,
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.xl,
        gap: spacing.md,
      }}
    >
      <Text style={[typography.heading, { color: t.text.primary }]}>
        {error ? 'Unable to join meeting' : 'Joining meeting…'}
      </Text>
      {error ? (
        <Text
          style={[
            typography.body,
            { color: t.text.secondary, textAlign: 'center' },
          ]}
        >
          {error}
        </Text>
      ) : null}
      {error ? (
        <Button label="Go back" variant="ghost" onPress={() => router.back()} />
      ) : null}
    </View>
  );
}
