import { Global, Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { RealtimePublisher } from './realtime.publisher';
import { RealtimeGateway } from './realtime.gateway';
import { UsersModule } from '../users/users.module';
import { MessagesModule } from '../messages/messages.module';
import { ConversationsModule } from '../conversations/conversations.module';

/**
 * RealtimePublisher is global so any service can emit without importing the
 * gateway. The gateway consumes the feature services; forwardRef breaks the
 * resulting cycle (those services emit back through the publisher).
 */
@Global()
@Module({
  imports: [
    ConfigModule,
    JwtModule.register({}),
    forwardRef(() => UsersModule),
    forwardRef(() => MessagesModule),
    forwardRef(() => ConversationsModule),
  ],
  providers: [RealtimePublisher, RealtimeGateway],
  exports: [RealtimePublisher],
})
export class RealtimeModule {}
