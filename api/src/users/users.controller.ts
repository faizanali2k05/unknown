import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { UsersService } from './users.service';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** The authenticated user's own profile. */
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.users.getProfile(user.userId);
  }

  /** Directory: lists other users (empty q) or filters by search. */
  @Get()
  search(@CurrentUser() user: AuthUser, @Query('q') q: string) {
    return this.users.search(q ?? '', user.userId);
  }

  /** Dialer: resolve a typed number to an Unknown user to call. */
  @Get('by-number')
  byNumber(@Query('value') value: string) {
    return this.users.findByNumber(value ?? '');
  }

  /** Public profile of another user by id. */
  @Get(':id')
  byId(@Param('id') id: string) {
    return this.users.getPublic(id);
  }
}
