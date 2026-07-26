import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { CallsService } from './calls.service';
import { StartCallDto, EndCallDto } from './dto/calls.dto';

@UseGuards(JwtAuthGuard)
@Controller('calls')
export class CallsController {
  constructor(private readonly calls: CallsService) {}

  @Post()
  start(@CurrentUser() user: AuthUser, @Body() dto: StartCallDto) {
    return this.calls.start(user.userId, dto);
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
  async end(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: EndCallDto,
  ): Promise<void> {
    await this.calls.end(user.userId, id, dto.reason);
  }

  @Get('history')
  history(@CurrentUser() user: AuthUser) {
    return this.calls.history(user.userId);
  }
}
