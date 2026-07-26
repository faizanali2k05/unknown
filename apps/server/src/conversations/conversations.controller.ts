import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { ConversationsService } from './conversations.service';
import { MessagesService } from '../messages/messages.service';
import { SendMessageDto } from '../messages/dto/messages.dto';
import {
  CreateDirectDto,
  CreateGroupDto,
  UpdateGroupDto,
  MembersDto,
} from './dto/conversations.dto';

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

  @Post('direct')
  direct(@CurrentUser() user: AuthUser, @Body() dto: CreateDirectDto) {
    return this.conversations.findOrCreateDirect(user.userId, dto.peer_user_id);
  }

  @Post('group')
  group(@CurrentUser() user: AuthUser, @Body() dto: CreateGroupDto) {
    return this.conversations.createGroup(user.userId, dto);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.conversations.detail(user.userId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.conversations.updateGroup(user.userId, id, dto);
  }

  @Post(':id/members')
  addMembers(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: MembersDto,
  ) {
    return this.conversations.addMembers(user.userId, id, dto.member_ids);
  }

  @Delete(':id/members/:userId')
  @HttpCode(204)
  async removeMember(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
  ): Promise<void> {
    await this.conversations.removeMember(user.userId, id, targetUserId);
  }

  /** Marks the whole conversation read up to now. */
  @Post(':id/read')
  @HttpCode(204)
  async read(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    await this.conversations.markRead(user.userId, id);
  }

  @Get(':id/messages')
  history(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('before') before?: string,
  ) {
    return this.messages.history(user.userId, id, before);
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
