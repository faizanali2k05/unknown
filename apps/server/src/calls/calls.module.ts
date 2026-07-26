import { Module } from '@nestjs/common';
import { CallsController } from './calls.controller';
import { CallsService } from './calls.service';
import { LivekitService } from './livekit.service';
import { ConversationsModule } from '../conversations/conversations.module';

@Module({
  imports: [ConversationsModule],
  controllers: [CallsController],
  providers: [CallsService, LivekitService],
  exports: [CallsService],
})
export class CallsModule {}
