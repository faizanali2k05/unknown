import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';
import { MeetingsService } from './meetings.service';

@UseGuards(JwtAuthGuard)
@Controller('meetings')
export class MeetingsController {
  constructor(private readonly meetings: MeetingsService) {}

  @Post()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  create(@CurrentUser() user: AuthUser) {
    return this.meetings.create(user.userId);
  }

  @Post(':code/join')
  join(@CurrentUser() user: AuthUser, @Param('code') code: string) {
    return this.meetings.join(user.userId, code);
  }

  @Post(':code/end')
  end(@CurrentUser() user: AuthUser, @Param('code') code: string) {
    return this.meetings.end(user.userId, code);
  }
}
