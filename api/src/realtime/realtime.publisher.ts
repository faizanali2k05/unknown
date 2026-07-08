import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { REALTIME_CHANNEL, RealtimeEnvelope } from './realtime.constants';

/**
 * Thin wrapper any module can inject to push a realtime event without depending
 * on the WebSocket gateway directly (avoids circular deps). Publishes to Redis;
 * the gateway on every instance delivers to locally-connected sockets.
 */
@Injectable()
export class RealtimePublisher {
  constructor(private readonly redis: RedisService) {}

  async emitToUsers(targets: string[], event: string, data: unknown): Promise<void> {
    const envelope: RealtimeEnvelope = { targets, event, data };
    await this.redis.publish(REALTIME_CHANNEL, envelope);
  }
}
