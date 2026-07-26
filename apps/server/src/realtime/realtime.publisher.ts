import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { REALTIME_CHANNEL, RealtimeEnvelope } from './realtime.constants';

/**
 * Injected anywhere that needs to push a realtime event, without depending on
 * the WebSocket gateway (which would create a cycle). Publishes to Redis; the
 * gateway on every instance delivers to its locally-connected sockets.
 */
@Injectable()
export class RealtimePublisher {
  constructor(private readonly redis: RedisService) {}

  async emitToUsers(targets: string[], event: string, data: unknown): Promise<void> {
    if (targets.length === 0) return;
    const envelope: RealtimeEnvelope = { targets, event, data };
    await this.redis.publish(REALTIME_CHANNEL, envelope);
  }
}
