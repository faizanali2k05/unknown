import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/users.dto';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.users.me(user.userId);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user.userId, dto);
  }

  /** Exact unique ID lookup only; response intentionally omits account details. */
  @Get('lookup/:publicId')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  lookup(@Param('publicId') publicId: string) {
    if (!/^KASSI-[A-Z0-9]{10}$/.test(publicId)) {
      throw new NotFoundException('User ID not found.');
    }
    return this.users.lookup(publicId);
  }
}
