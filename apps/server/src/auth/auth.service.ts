import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { TokensService, TokenPair } from './tokens.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';

const ARGON_OPTS: argon2.Options = { type: argon2.argon2id };

export interface PublicUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  status_text: string | null;
  created_at: Date;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
  ) {}

  /** Open sign-up: username + password + display name. No email, no OTP. */
  async register(dto: RegisterDto): Promise<{ user: PublicUser; tokens: TokenPair }> {
    const taken = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (taken) throw new ConflictException('Username already taken');

    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        passwordHash: await argon2.hash(dto.password, ARGON_OPTS),
        displayName: dto.display_name.trim(),
      },
    });

    return { user: this.toPublic(user), tokens: await this.tokens.issue(user) };
  }

  async login(dto: LoginDto): Promise<{ user: PublicUser; tokens: TokenPair }> {
    const user = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (!user.isActive) throw new ForbiddenException('Account is disabled');
    if (!(await argon2.verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastSeenAt: new Date() },
    });

    return { user: this.toPublic(user), tokens: await this.tokens.issue(user) };
  }

  async refresh(token: string): Promise<{ tokens: TokenPair }> {
    const tokens = await this.tokens.rotate(token);
    if (!tokens) throw new UnauthorizedException('Invalid refresh token');
    return { tokens };
  }

  async logout(token: string): Promise<void> {
    await this.tokens.revoke(token);
  }

  private toPublic(u: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    statusText: string | null;
    createdAt: Date;
  }): PublicUser {
    return {
      id: u.id,
      username: u.username,
      display_name: u.displayName,
      avatar_url: u.avatarUrl,
      status_text: u.statusText,
      created_at: u.createdAt,
    };
  }
}
