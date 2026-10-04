import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Room, RoomEvent, Track } from 'livekit-client';
import { useTheme, spacing, typography } from '../theme';
import { Avatar, Button, Icon } from '../components/ui';
import { api, LIVEKIT_URL } from '../api';
import { on } from '../api/socket';

type MediaContainer = HTMLElement;

/** Browser implementation: media is still relayed through the existing LiveKit SFU. */
export default function CallScreenWeb() {
  const { t } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{
    id: string;
    name?: string;
    kind?: string;
    token?: string;
    incoming?: string;
    meeting?: string;
    meeting_owner?: string;
  }>();
  const callId = params.id;
  const peerName = params.name ?? 'Call';
  const isVideo = params.kind === 'video';
  const incoming = params.incoming === '1';
  const meeting = params.meeting === '1';
  const meetingOwner = params.meeting_owner === '1';
  const [token, setToken] = useState<string | null>(params.token ?? null);
  const [status, setStatus] = useState(incoming ? 'Incoming call' : 'Calling…');
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(!isVideo);
  const [busy, setBusy] = useState(false);
  const localBox = useRef<MediaContainer | null>(null);
  const remoteBox = useRef<MediaContainer | null>(null);
  const roomRef = useRef<Room | null>(null);
  const navigatingRef = useRef(false);

  const leave = useCallback(
    (message?: string) => {
      navigatingRef.current = true;
      if (message) setStatus(message);
      setTimeout(() => router.back(), message ? 800 : 0);
    },
    [router],
  );

  useEffect(() => {
    if (!token) return;
    let disposed = false;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;

    const attach = (
      track: Track,
      box: MediaContainer | null,
      mutedTrack = false,
    ) => {
      if (!box) return;
      const element = track.attach();
      element.autoplay = true;
      if (element instanceof HTMLVideoElement) element.playsInline = true;
      if (element instanceof HTMLMediaElement) element.muted = mutedTrack;
      element.style.width = '100%';
      element.style.height = '100%';
      element.style.objectFit = 'cover';
      box.appendChild(element);
    };

    const onSubscribed = (track: Track) => attach(track, remoteBox.current);
    const onUnsubscribed = (track: Track) => {
      track.detach().forEach((element) => element.remove());
    };
    const onDisconnected = () => {
      if (!disposed && !navigatingRef.current)
        leave(meeting ? 'Meeting ended' : 'Call ended');
    };
    room.on(RoomEvent.TrackSubscribed, onSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, onUnsubscribed);
    room.on(RoomEvent.Disconnected, onDisconnected);

    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error('This browser does not support calling.');
        await room.connect(LIVEKIT_URL, token);
        if (disposed) return;
        await room.localParticipant.setMicrophoneEnabled(true);
        if (isVideo) await room.localParticipant.setCameraEnabled(true);
        if (disposed) return;
        setStatus('Connected');
        for (const publication of room.localParticipant.trackPublications.values()) {
          if (publication.track)
            attach(publication.track, localBox.current, true);
        }
        for (const participant of room.remoteParticipants.values()) {
          for (const publication of participant.trackPublications.values()) {
            if (publication.track) attach(publication.track, remoteBox.current);
          }
        }
      } catch (error) {
        if (!disposed) {
          const message = error instanceof Error ? error.message : '';
          setStatus(
            message.toLowerCase().includes('permission')
              ? 'Microphone or camera permission was denied'
              : 'Unable to establish the call',
          );
        }
      }
    })();

    return () => {
      disposed = true;
      room.off(RoomEvent.TrackSubscribed, onSubscribed);
      room.off(RoomEvent.TrackUnsubscribed, onUnsubscribed);
      room.off(RoomEvent.Disconnected, onDisconnected);
      room.disconnect();
      localBox.current?.replaceChildren();
      remoteBox.current?.replaceChildren();
      if (roomRef.current === room) roomRef.current = null;
    };
  }, [token, isVideo, leave]);

  useEffect(() => {
    const offDeclined = onCallEvent('call:declined', () =>
      leave('Call declined'),
    );
    const offEnded = onCallEvent('call:ended', (event?: { status?: string }) =>
      leave(event?.status === 'missed' ? 'Missed call' : 'Call ended'),
    );
    const offAnswered = onCallEvent('call:answered', () =>
      setStatus('Connecting…'),
    );
    return () => {
      offDeclined();
      offEnded();
      offAnswered();
    };
  }, [leave]);

  const answer = async () => {
    setBusy(true);
    setStatus('Connecting…');
    try {
      setToken((await api.answerCall(callId)).token);
    } catch {
      setStatus('Unable to join this call');
    } finally {
      setBusy(false);
    }
  };

  const decline = async () => {
    navigatingRef.current = true;
    await api.declineCall(callId).catch(() => undefined);
    roomRef.current?.disconnect();
    router.back();
  };

  const hangUp = async () => {
    navigatingRef.current = true;
    if (meeting) {
      if (meetingOwner) await api.endMeeting(callId).catch(() => undefined);
    } else {
      await api.endCall(callId).catch(() => undefined);
    }
    roomRef.current?.disconnect();
    router.back();
  };

  const toggleMute = async () => {
    const next = !muted;
    await roomRef.current?.localParticipant
      .setMicrophoneEnabled(!next)
      .catch(() => undefined);
    setMuted(next);
  };
  const toggleCamera = async () => {
    const next = !cameraOff;
    await roomRef.current?.localParticipant
      .setCameraEnabled(!next)
      .catch(() => undefined);
    setCameraOff(next);
  };

  const videoSurface = (
    ref: React.RefObject<MediaContainer | null>,
    small = false,
  ) => (
    <View
      // On web, react-native-web renders View as a DOM element; LiveKit attaches
      // real MediaStream tracks here rather than showing a simulated preview.
      ref={ref as never}
      style={{
        flex: small ? undefined : 1,
        width: small ? 160 : '100%',
        height: small ? 120 : undefined,
        minHeight: small ? 120 : 260,
        overflow: 'hidden',
        borderRadius: 14,
        backgroundColor: '#101318',
      }}
    />
  );

  return (
    <View
      style={{
        flex: 1,
        minHeight: '100%',
        backgroundColor: t.bg.primary,
        padding: spacing.lg,
        gap: spacing.md,
      }}
    >
      <View style={{ flex: 1, minHeight: 300, position: 'relative' }}>
        {videoSurface(remoteBox)}
        {!token ? (
          <View
            style={{
              position: 'absolute',
              inset: 0,
              alignItems: 'center',
              justifyContent: 'center',
              gap: spacing.md,
            }}
          >
            <Avatar name={peerName} size={104} />
            <Text style={[typography.heading, { color: t.text.primary }]}>
              {peerName}
            </Text>
            <Text style={[typography.body, { color: t.text.secondary }]}>
              {status}
            </Text>
          </View>
        ) : null}
        {token && isVideo ? (
          <View
            style={{ position: 'absolute', right: spacing.md, top: spacing.md }}
          >
            {videoSurface(localBox, true)}
          </View>
        ) : token ? (
          <View style={{ display: 'none' }}>
            {videoSurface(localBox, true)}
          </View>
        ) : null}
        {token && !isVideo ? (
          <View
            style={{
              position: 'absolute',
              inset: 0,
              alignItems: 'center',
              justifyContent: 'center',
              gap: spacing.md,
            }}
          >
            <Avatar name={peerName} size={104} />
            <Text style={[typography.heading, { color: '#fff' }]}>
              {peerName}
            </Text>
          </View>
        ) : null}
      </View>
      <Text
        style={[
          typography.caption,
          { color: t.text.secondary, textAlign: 'center' },
        ]}
      >
        {status}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          gap: spacing.md,
          flexWrap: 'wrap',
        }}
      >
        {!token && incoming ? (
          <>
            <Button
              label="Decline"
              variant="ghost"
              onPress={decline}
              disabled={busy}
            />
            <Button label="Accept" onPress={answer} loading={busy} />
          </>
        ) : !token ? (
          <Button label="Cancel" variant="ghost" onPress={hangUp} />
        ) : (
          <>
            <Pressable
              onPress={toggleMute}
              accessibilityRole="button"
              accessibilityLabel={muted ? 'Unmute' : 'Mute'}
              style={{ padding: spacing.md }}
            >
              <Icon
                name={muted ? 'mic-off' : 'mic'}
                color={t.text.primary}
                size={22}
              />
            </Pressable>
            {isVideo ? (
              <Pressable
                onPress={toggleCamera}
                accessibilityRole="button"
                accessibilityLabel={
                  cameraOff ? 'Turn camera on' : 'Turn camera off'
                }
                style={{ padding: spacing.md }}
              >
                <Icon
                  name={cameraOff ? 'videocam-off' : 'videocam'}
                  color={t.text.primary}
                  size={22}
                />
              </Pressable>
            ) : null}
            <Button
              label={
                meetingOwner
                  ? 'End meeting'
                  : meeting
                    ? 'Leave meeting'
                    : 'End call'
              }
              variant="danger"
              onPress={hangUp}
            />
          </>
        )}
      </View>
    </View>
  );
}

// Kept local to the web entry so the browser bundle never imports native call code.
function onCallEvent(
  event: string,
  callback: (data?: { status?: string }) => void,
) {
  return on(event, callback);
}
