import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { ConversationsService } from './conversations.service';
import { MessagesService } from '../messages/messages.service';
import { SendMessageDto, StartConversationDto } from '../messages/dto/messages.dto';

@UseGuards(JwtAuthGuard)
@Controller('conversations')
export class ConversationsController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly messages: MessagesService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.conversations.list(user.userId);
  }

  @Post()
  start(@CurrentUser() user: AuthUser, @Body() dto: StartConversationDto) {
    return this.conversations.findOrCreateDirect(user.userId, dto.peer_user_id);
  }

  @Get(':id/messages')
  history(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.messages.history(user.userId, id, cursor);
  }

  @Post(':id/messages')
  send(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messages.send(user.userId, id, dto);
  }
}
