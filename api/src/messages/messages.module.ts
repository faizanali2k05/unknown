import { Module, forwardRef } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { NumbersModule } from '../numbers/numbers.module';
import { ConversationsModule } from '../conversations/conversations.module';

@Module({
  imports: [NumbersModule, forwardRef(() => ConversationsModule)],
  controllers: [MessagesController],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
