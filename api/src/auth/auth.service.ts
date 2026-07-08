import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { TokensService, TokenPair } from './tokens.service';
import { SignupDto, LoginDto } from './dto/auth.dto';

const ARGON_OPTS: argon2.Options = { type: argon2.argon2id };

export interface PublicUser {
  id: string;
  username: string;
  sequence_no: string;
  subscription_tier: string;
  subscription_expires_at: Date | null;
  created_at: Date;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
  ) {}

  async signup(dto: SignupDto): Promise<{ user: PublicUser; tokens: TokenPair }> {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ username: dto.username }, { sequenceNo: dto.sequence_no }] },
    });
    if (existing) {
      throw new ConflictException('username or sequence_no already taken');
    }

    const passwordHash = await argon2.hash(dto.password, ARGON_OPTS);

    // Create the user and auto-provision their first in-app number (free tier).
    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        sequenceNo: dto.sequence_no,
        passwordHash,
        numbers: {
          create: {
            value: this.generateNumberValue(),
            label: 'Primary',
            isDefaultDisplay: true,
          },
        },
      },
    });

    const tokens = await this.tokens.issue(user);
    return { user: this.toPublic(user), tokens };
  }

  async login(dto: LoginDto): Promise<{ user: PublicUser; tokens: TokenPair }> {
    const identifier = dto.username ?? dto.sequence_no;
    if (!identifier) {
      throw new BadRequestException('username or sequence_no is required');
    }

    const user = await this.prisma.user.findFirst({
      where: { OR: [{ username: identifier }, { sequenceNo: identifier }] },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const ok = await argon2.verify(user.passwordHash, dto.password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const tokens = await this.tokens.issue(user);
    return { user: this.toPublic(user), tokens };
  }

  async refresh(token: string): Promise<{ tokens: TokenPair }> {
    const tokens = await this.tokens.rotate(token);
    if (!tokens) throw new UnauthorizedException('Invalid refresh token');
    return { tokens };
  }

  async logout(token: string): Promise<void> {
    await this.tokens.revoke(token);
  }

  // ---- helpers --------------------------------------------------------------
  private toPublic(u: {
    id: string;
    username: string;
    sequenceNo: string;
    subscriptionTier: string;
    subscriptionExpiresAt: Date | null;
    createdAt: Date;
  }): PublicUser {
    return {
      id: u.id,
      username: u.username,
      sequence_no: u.sequenceNo,
      subscription_tier: u.subscriptionTier,
      subscription_expires_at: u.subscriptionExpiresAt,
      created_at: u.createdAt,
    };
  }

  /** Generates a random in-app number label like "0700 123 4567". */
  private generateNumberValue(): string {
    const n = () => Math.floor(Math.random() * 10);
    return `07${n()}${n()} ${n()}${n()}${n()} ${n()}${n()}${n()}${n()}`;
  }
}
