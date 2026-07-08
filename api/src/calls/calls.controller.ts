import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { CallsService } from './calls.service';
import { CreateCallDto } from './dto/calls.dto';

@UseGuards(JwtAuthGuard)
@Controller('calls')
export class CallsController {
  constructor(private readonly calls: CallsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCallDto) {
    return this.calls.invite(user.userId, dto.callee_user_id, dto.display_number, dto.video ?? false);
  }

  @Post(':id/answer')
  answer(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.calls.answer(user.userId, id);
  }

  @Post(':id/decline')
  @HttpCode(204)
  async decline(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    await this.calls.decline(user.userId, id);
  }

  @Post(':id/end')
  @HttpCode(204)
  async end(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    await this.calls.end(user.userId, id);
  }

  @Get('recent')
  recent(@CurrentUser() user: AuthUser) {
    return this.calls.recent(user.userId);
  }
}
