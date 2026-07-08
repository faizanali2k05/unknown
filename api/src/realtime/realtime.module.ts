import { Global, Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { RealtimePublisher } from './realtime.publisher';
import { RealtimeGateway } from './realtime.gateway';
import { MessagesModule } from '../messages/messages.module';
import { CallsModule } from '../calls/calls.module';

/**
 * Realtime is split into:
 *  - RealtimePublisher: injectable anywhere (global) to push events (REST paths).
 *  - RealtimeGateway: the Socket.IO server + Redis subscriber (WS paths).
 * The gateway consumes Messages/Calls services; forwardRef breaks the cycle
 * (those services use the global RealtimePublisher to emit back).
 */
@Global()
@Module({
  imports: [
    ConfigModule,
    JwtModule.register({}),
    forwardRef(() => MessagesModule),
    forwardRef(() => CallsModule),
  ],
  providers: [RealtimePublisher, RealtimeGateway],
  exports: [RealtimePublisher],
})
export class RealtimeModule {}
