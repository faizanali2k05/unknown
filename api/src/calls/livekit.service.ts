import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken } from 'livekit-server-sdk';

/**
 * Issues short-TTL LiveKit join tokens scoped per-call (TRD §7).
 * In MVP (Phase <4) LiveKit may not be running yet; we still mint a valid
 * token so the contract is stable. Real audio flows once the media plane
 * (docker-compose.media.yml) is up.
 */
@Injectable()
export class LivekitService {
  private readonly logger = new Logger('LiveKit');

  constructor(private readonly config: ConfigService) {}

  async createJoinToken(room: string, identity: string, name?: string): Promise<string> {
    const apiKey = this.config.get<string>('livekit.apiKey')!;
    const apiSecret = this.config.get<string>('livekit.apiSecret')!;

    const at = new AccessToken(apiKey, apiSecret, {
      identity,
      name: name ?? identity,
      ttl: '2h',
    });
    at.addGrant({
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
    });
    return at.toJwt();
  }

  /** Deterministic room name for a call session. */
  roomFor(callId: string): string {
    return `unknown_call_${callId}`;
  }
}
