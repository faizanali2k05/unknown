import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  AudioSession,
  LiveKitRoom,
  VideoTrack,
  isTrackReference,
  useLocalParticipant,
  useParticipants,
  useTracks,
} from '@livekit/react-native';
import { LocalVideoTrack, Track } from 'livekit-client';
import { useTheme, spacing, typography } from '../theme';
import { Avatar, Button, Icon, IconName } from '../components/ui';
import { api, LIVEKIT_URL } from '../api';
import { on } from '../api/socket';

type PermState = 'checking' | 'granted' | 'denied';

/**
 * Requests the runtime permissions LiveKit needs.
 *
 * Declaring RECORD_AUDIO/CAMERA in the manifest is not enough on Android 6+ —
 * they are "dangerous" permissions and must be granted at runtime. Without
 * this the native capturer throws the moment a room connects, which takes the
 * whole app down rather than surfacing an error.
 */
async function requestCallPermissions(video: boolean): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const needed = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
  if (video) needed.push(PermissionsAndroid.PERMISSIONS.CAMERA);
  try {
    const result = await PermissionsAndroid.requestMultiple(needed);
    return needed.every(
      (p) => result[p] === PermissionsAndroid.RESULTS.GRANTED,
    );
  } catch {
    return false;
  }
}

export default function CallScreen() {
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
  const [perm, setPerm] = useState<PermState>('checking');
  const leavingRef = useRef(false);

  // Ask before any LiveKit code touches the mic/camera.
  useEffect(() => {
    let alive = true;
    requestCallPermissions(isVideo).then((ok) => {
      if (alive) setPerm(ok ? 'granted' : 'denied');
    });
    return () => {
      alive = false;
    };
  }, [isVideo]);

  useEffect(() => {
    if (perm !== 'granted') return;
    AudioSession.startAudioSession().catch(() => undefined);
    return () => {
      AudioSession.stopAudioSession().catch(() => undefined);
    };
  }, [perm]);

  const leave = useCallback(
    (msg: string) => {
      leavingRef.current = true;
      setStatus(msg);
      setTimeout(() => router.back(), 800);
    },
    [router],
  );

  useEffect(() => {
    const offDeclined = on('call:declined', () => leave('Declined'));
    const offEnded = on<{ status?: string }>('call:ended', (event) =>
      leave(event.status === 'missed' ? 'Missed call' : 'Call ended'),
    );
    const offAnswered = on('call:answered', () => setStatus('Connecting…'));
    return () => {
      offDeclined();
      offEnded();
      offAnswered();
    };
  }, [leave]);

  const answer = async () => {
    setStatus('Connecting…');
    try {
      const res = await api.answerCall(callId);
      setToken(res.token);
    } catch {
      leave('Could not join');
    }
  };

  const decline = async () => {
    leavingRef.current = true;
    await api.declineCall(callId).catch(() => undefined);
    router.back();
  };

  const hangUp = async () => {
    leavingRef.current = true;
    if (meeting) {
      if (meetingOwner) await api.endMeeting(callId).catch(() => undefined);
    } else {
      await api.endCall(callId).catch(() => undefined);
    }
    router.back();
  };

  // --- Permission gates ----------------------------------------------------
  if (perm === 'checking') {
    return (
      <Shell peerName={peerName} sub="Checking permissions…">
        <View />
      </Shell>
    );
  }

  if (perm === 'denied') {
    return (
      <Shell
        peerName={peerName}
        sub={`Unknown needs your microphone${isVideo ? ' and camera' : ''} to place calls. Enable it in Settings → Apps → Unknown → Permissions.`}
      >
        <Button label="Go back" variant="ghost" onPress={() => router.back()} />
      </Shell>
    );
  }

  // --- Ringing (no room token yet) -----------------------------------------
  if (!token) {
    return (
      <Shell
        peerName={peerName}
        sub={`${isVideo ? 'Video call' : 'Voice call'} · ${status}`}
      >
        <View style={s.controls}>
          {incoming ? (
            <>
              <CallBtn
                colour={t.status.danger}
                icon="close"
                label="Decline"
                onPress={decline}
              />
              <CallBtn
                colour={t.accent.default}
                icon={isVideo ? 'videocam' : 'call'}
                label="Accept"
                onPress={answer}
              />
            </>
          ) : (
            <CallBtn
              colour={t.status.danger}
              icon="call"
              label="Cancel"
              onPress={hangUp}
            />
          )}
        </View>
      </Shell>
    );
  }

  return (
    <LiveKitRoom
      serverUrl={LIVEKIT_URL}
      token={token}
      connect
      audio
      video={isVideo}
      onError={() => leave('Connection failed')}
      onDisconnected={() => {
        if (!leavingRef.current)
          leave(meeting ? 'Meeting ended' : 'Call ended');
      }}
    >
      <ActiveCall
        peerName={peerName}
        isVideo={isVideo}
        onHangUp={hangUp}
        meeting={meeting}
        meetingOwner={meetingOwner}
      />
    </LiveKitRoom>
  );
}

/** Shared frame for every pre-connected state. */
function Shell({
  peerName,
  sub,
  children,
}: {
  peerName: string;
  sub: string;
  children: React.ReactNode;
}) {
  const { t } = useTheme();
  return (
    <View style={[s.root, { backgroundColor: t.bg.primary }]}>
      <View style={s.top}>
        <Text style={[typography.display, { color: t.text.primary }]}>
          {peerName}
        </Text>
        <Text
          style={[
            typography.body,
            {
              color: t.text.secondary,
              marginTop: spacing.sm,
              textAlign: 'center',
            },
          ]}
        >
          {sub}
        </Text>
      </View>
      <Avatar name={peerName} size={132} />
      {children}
      <Text style={[typography.caption, { color: t.text.muted }]}>
        End-to-end over your server
      </Text>
    </View>
  );
}

function ActiveCall({
  peerName,
  isVideo,
  onHangUp,
  meeting,
  meetingOwner,
}: {
  peerName: string;
  isVideo: boolean;
  onHangUp: () => void;
  meeting: boolean;
  meetingOwner: boolean;
}) {
  const { t } = useTheme();
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  const cameras = useTracks([Track.Source.Camera]);

  const connected = participants.length > 1;
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(!isVideo);
  const [frontCamera, setFrontCamera] = useState(true);

  // Timer starts when the other side actually joins, so both ends agree.
  useEffect(() => {
    if (!connected) return;
    const h = setInterval(() => setSeconds((x) => x + 1), 1000);
    return () => clearInterval(h);
  }, [connected]);

  const remote = cameras.find(
    (c) =>
      isTrackReference(c) &&
      c.participant.identity !== localParticipant.identity,
  );
  const local = cameras.find(
    (c) =>
      isTrackReference(c) &&
      c.participant.identity === localParticipant.identity,
  );
  const showRemote = isVideo && remote && isTrackReference(remote);
  const showLocal = isVideo && !camOff && local && isTrackReference(local);

  return (
    <View style={[s.root, { backgroundColor: t.bg.primary }]}>
      {showRemote ? (
        <VideoTrack
          trackRef={remote}
          style={StyleSheet.absoluteFillObject}
          objectFit="cover"
        />
      ) : null}

      <View style={[s.top, showRemote ? s.topOnVideo : null]}>
        <Text
          style={[
            typography.display,
            { color: showRemote ? '#fff' : t.text.primary },
          ]}
        >
          {peerName}
        </Text>
        <Text
          style={[
            typography.body,
            {
              color: showRemote ? '#e5e7eb' : t.text.secondary,
              marginTop: spacing.sm,
            },
          ]}
        >
          {connected ? formatTimer(seconds) : 'Ringing…'}
        </Text>
      </View>

      {!showRemote ? <Avatar name={peerName} size={132} /> : <View />}
      {showLocal ? (
        <VideoTrack trackRef={local} style={s.pip} objectFit="cover" />
      ) : null}

      <View style={s.controls}>
        <SmallBtn
          icon={muted ? 'mic-off' : 'mic'}
          active={muted}
          label={muted ? 'Unmute' : 'Mute'}
          onPress={async () => {
            const next = !muted;
            setMuted(next);
            await localParticipant
              .setMicrophoneEnabled(!next)
              .catch(() => undefined);
          }}
        />
        <CallBtn
          colour={t.status.danger}
          icon="call"
          label={meeting ? (meetingOwner ? 'End meeting' : 'Leave') : 'End'}
          onPress={onHangUp}
        />
        {isVideo ? (
          <>
            <SmallBtn
              icon={camOff ? 'videocam-off' : 'videocam'}
              active={camOff}
              label={camOff ? 'Camera on' : 'Camera off'}
              onPress={async () => {
                const next = !camOff;
                setCamOff(next);
                await localParticipant
                  .setCameraEnabled(!next)
                  .catch(() => undefined);
              }}
            />
            <SmallBtn
              icon="camera-reverse-outline"
              label="Flip camera"
              onPress={async () => {
                const next = !frontCamera;
                const track = [
                  ...localParticipant.videoTrackPublications.values(),
                ]
                  .map((publication) => publication.track)
                  .find(
                    (candidate): candidate is LocalVideoTrack =>
                      candidate instanceof LocalVideoTrack,
                  );
                if (!track) return;
                await track
                  .restartTrack({ facingMode: next ? 'user' : 'environment' })
                  .catch(() => undefined);
                setFrontCamera(next);
              }}
            />
          </>
        ) : (
          <View style={{ width: 60 }} />
        )}
      </View>
    </View>
  );
}

function CallBtn({
  colour,
  icon,
  label,
  onPress,
}: {
  colour: string;
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  const { t } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{ alignItems: 'center', gap: spacing.sm }}
    >
      <View style={[s.round, { backgroundColor: colour }]}>
        <Icon name={icon} size={26} color="#fff" />
      </View>
      <Text style={[typography.caption, { color: t.text.secondary }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function SmallBtn({
  icon,
  label,
  active,
  onPress,
}: {
  icon: IconName;
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  const { t } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{ alignItems: 'center', gap: spacing.xs, width: 60 }}
    >
      <View
        style={[
          s.small,
          {
            backgroundColor: active ? t.accent.default : t.bg.secondary,
            borderColor: active ? t.accent.default : t.border.default,
          },
        ]}
      >
        <Icon
          name={icon}
          size={20}
          color={active ? t.accent.on : t.text.primary}
        />
      </View>
      <Text style={[typography.caption, { color: t.text.muted, fontSize: 10 }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function formatTimer(s: number): string {
  const m = Math.floor(s / 60);
  return `${m.toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xl,
  },
  top: { alignItems: 'center', marginTop: spacing.xxxl },
  topOnVideo: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 16,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
  },
  round: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  small: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pip: {
    position: 'absolute',
    right: spacing.lg,
    top: spacing.xxxl + 40,
    width: 108,
    height: 156,
    borderRadius: 14,
    overflow: 'hidden',
  },
});
