import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Liveness + dependency check. Used by the container healthcheck. */
  @Get()
  async health(): Promise<Record<string, unknown>> {
    const checks: Record<string, string> = {};
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.postgres = 'up';
    } catch {
      checks.postgres = 'down';
    }
    try {
      const pong = await this.redis.client.ping();
      checks.redis = pong === 'PONG' ? 'up' : 'down';
    } catch {
      checks.redis = 'down';
    }
    const ok = Object.values(checks).every((s) => s === 'up');
    return {
      status: ok ? 'ok' : 'degraded',
      service: 'unknown-api',
      checks,
      timestamp: new Date().toISOString(),
    };
  }
}
