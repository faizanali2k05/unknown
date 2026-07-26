import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import {
  RegisterDto,
  LoginDto,
  RefreshDto,
  LogoutDto,
  CreateInviteDto,
} from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // Tighter limits on the credential endpoints.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refresh_token);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Body() dto: LogoutDto): Promise<void> {
    await this.auth.logout(dto.refresh_token);
  }

  // ---- Invite codes (admin only) -------------------------------------------

  @UseGuards(JwtAuthGuard)
  @Post('invites')
  createInvites(@CurrentUser() user: AuthUser, @Body() dto: CreateInviteDto) {
    return this.auth.createInvites(user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('invites')
  listInvites(@CurrentUser() user: AuthUser) {
    return this.auth.listInvites(user.userId);
  }
}
