import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import configuration from './config/configuration';

import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { PushModule } from './push/push.module';
import { AuthModule } from './auth/auth.module';
import { RealtimeModule } from './realtime/realtime.module';
import { HealthModule } from './health/health.module';
import { UsersModule } from './users/users.module';
import { NumbersModule } from './numbers/numbers.module';
import { ConversationsModule } from './conversations/conversations.module';
import { MessagesModule } from './messages/messages.module';
import { CallsModule } from './calls/calls.module';
import { VoicemailModule } from './voicemail/voicemail.module';
import { DevicesModule } from './devices/devices.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    ThrottlerModule.forRoot([
      {
        ttl: (parseInt(process.env.RATE_LIMIT_TTL ?? '60', 10)) * 1000,
        limit: parseInt(process.env.RATE_LIMIT_MAX ?? '100', 10),
      },
    ]),

    // Core infra (global)
    PrismaModule,
    RedisModule,
    PushModule,
    AuthModule,
    RealtimeModule,

    // Feature modules
    HealthModule,
    UsersModule,
    NumbersModule,
    ConversationsModule,
    MessagesModule,
    CallsModule,
    VoicemailModule,
    DevicesModule,
    SubscriptionsModule,
  ],
  providers: [
    // Global rate limiting (TRD §7).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
