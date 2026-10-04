import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

/**
 * Mints short-lived, room-scoped LiveKit join tokens. Every call is relayed
 * through the SFU (team of <50 — no P2P negotiation, no TURN fallback logic).
 */
@Injectable()
export class LivekitService {
  constructor(private readonly config: ConfigService) {}

  /**
   * The grant deliberately does not restrict publishable sources. Locking an
   * audio call to the microphone track sounds tidy, but it means encoding the
   * SDK's TrackSource enum here and the client already decides what it
   * publishes. Room membership is the security boundary that matters, and the
   * token is scoped to exactly one room with a short TTL.
   */
  async createJoinToken(
    room: string,
    identity: string,
    name: string,
    ttl = '4h',
  ): Promise<string> {
    const at = new AccessToken(
      this.config.get<string>('livekit.apiKey')!,
      this.config.get<string>('livekit.apiSecret')!,
      { identity, name, ttl },
    );
    at.addGrant({
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    return at.toJwt();
  }

  async deleteRoom(room: string): Promise<void> {
    const rooms = new RoomServiceClient(
      this.config.get<string>('livekit.httpUrl')!,
      this.config.get<string>('livekit.apiKey')!,
      this.config.get<string>('livekit.apiSecret')!,
    );
    await rooms.deleteRoom(room);
  }
}
