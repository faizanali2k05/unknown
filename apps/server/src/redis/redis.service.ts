import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Two connections: one for commands + presence, one dedicated subscriber
 * (ioredis requires a separate connection once it enters subscribe mode).
 * Drives presence, pub/sub fan-out and ephemeral call state (ARCHITECTURE §2).
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger('Redis');
  public client: Redis;
  public subscriber: Redis;
  public publisher: Redis;

  // Connections are created in the constructor so they exist before any
  // lifecycle hook (e.g. the WS gateway's afterInit) tries to use them.
  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>('redisUrl') ?? 'redis://localhost:6379';
    this.client = new Redis(url, { maxRetriesPerRequest: null });
    this.publisher = new Redis(url, { maxRetriesPerRequest: null });
    this.subscriber = new Redis(url, { maxRetriesPerRequest: null });
    this.client.on('connect', () => this.logger.log('Connected to Redis'));
    this.client.on('error', (e) => this.logger.error(`Redis error: ${e.message}`));
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([
      this.client?.quit(),
      this.publisher?.quit(),
      this.subscriber?.quit(),
    ]);
  }

  // ----- Presence -----------------------------------------------------------
  private presenceKey(userId: string): string {
    return `presence:${userId}`;
  }

  async setOnline(userId: string, socketId: string): Promise<void> {
    await this.client.sadd(this.presenceKey(userId), socketId);
    await this.client.expire(this.presenceKey(userId), 3600);
  }

  async setOffline(userId: string, socketId: string): Promise<number> {
    await this.client.srem(this.presenceKey(userId), socketId);
    return this.client.scard(this.presenceKey(userId));
  }

  async isOnline(userId: string): Promise<boolean> {
    return (await this.client.scard(this.presenceKey(userId))) > 0;
  }

  // ----- Pub/Sub fan-out across API instances --------------------------------
  async publish(channel: string, payload: unknown): Promise<void> {
    await this.publisher.publish(channel, JSON.stringify(payload));
  }

  subscribe(channel: string, handler: (payload: unknown) => void): void {
    void this.subscriber.subscribe(channel);
    this.subscriber.on('message', (ch, raw) => {
      if (ch !== channel) return;
      try {
        handler(JSON.parse(raw));
      } catch (e) {
        this.logger.error(`Bad pub/sub payload on ${ch}: ${(e as Error).message}`);
      }
    });
  }
}
