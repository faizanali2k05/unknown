import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TokensService, TokenPair } from './tokens.service';
import { RegisterDto, LoginDto, CreateInviteDto } from './dto/auth.dto';

const ARGON_OPTS: argon2.Options = { type: argon2.argon2id };

export interface PublicUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  status_text: string | null;
  is_admin: boolean;
  created_at: Date;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
  ) {}

  /**
   * Invite-only registration. The code is consumed inside the same transaction
   * that creates the user, so two people racing the same code cannot both win.
   */
  async register(dto: RegisterDto): Promise<{ user: PublicUser; tokens: TokenPair }> {
    const invite = await this.prisma.inviteCode.findUnique({
      where: { code: dto.invite_code.trim().toUpperCase() },
    });
    if (!invite) throw new ForbiddenException('Invalid invite code');
    if (invite.redeemedById) throw new ForbiddenException('Invite code already used');
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      throw new ForbiddenException('Invite code has expired');
    }

    const taken = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (taken) throw new ConflictException('Username already taken');

    const passwordHash = await argon2.hash(dto.password, ARGON_OPTS);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          username: dto.username,
          passwordHash,
          displayName: dto.display_name.trim(),
        },
      });
      // updateMany with `redeemedById: null` in the WHERE makes this a
      // compare-and-set: a concurrent redeem affects 0 rows and we abort.
      const consumed = await tx.inviteCode.updateMany({
        where: { id: invite.id, redeemedById: null },
        data: { redeemedById: created.id, redeemedAt: new Date() },
      });
      if (consumed.count === 0) throw new ForbiddenException('Invite code already used');
      return created;
    });

    const tokens = await this.tokens.issue(user);
    return { user: this.toPublic(user), tokens };
  }

  async login(dto: LoginDto): Promise<{ user: PublicUser; tokens: TokenPair }> {
    const user = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (!user.isActive) throw new ForbiddenException('Account is disabled');

    const ok = await argon2.verify(user.passwordHash, dto.password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastSeenAt: new Date() },
    });

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

  // ---- Invite codes (admin only) -------------------------------------------

  async createInvites(adminUserId: string, dto: CreateInviteDto) {
    await this.assertAdmin(adminUserId);
    const count = dto.count ?? 1;
    if (count > 50) throw new BadRequestException('Cannot mint more than 50 codes at once');

    const expiresAt = dto.expires_in_days
      ? new Date(Date.now() + dto.expires_in_days * 86_400_000)
      : null;

    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      const code = this.generateCode();
      await this.prisma.inviteCode.create({
        data: { code, createdById: adminUserId, expiresAt },
      });
      codes.push(code);
    }
    return { codes, expires_at: expiresAt };
  }

  async listInvites(adminUserId: string) {
    await this.assertAdmin(adminUserId);
    const invites = await this.prisma.inviteCode.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { redeemedBy: { select: { username: true } } },
    });
    return invites.map((i: (typeof invites)[number]) => ({
      code: i.code,
      used: !!i.redeemedById,
      used_by: i.redeemedBy?.username ?? null,
      expires_at: i.expiresAt,
      created_at: i.createdAt,
    }));
  }

  private async assertAdmin(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.isAdmin) throw new ForbiddenException('Admin only');
  }

  /** Human-friendly code, no ambiguous characters (no O/0, I/1). */
  private generateCode(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = randomBytes(10);
    let out = '';
    for (let i = 0; i < 10; i++) {
      out += alphabet[bytes[i] % alphabet.length];
      if (i === 4) out += '-';
    }
    return out;
  }

  private toPublic(u: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    statusText: string | null;
    isAdmin: boolean;
    createdAt: Date;
  }): PublicUser {
    return {
      id: u.id,
      username: u.username,
      display_name: u.displayName,
      avatar_url: u.avatarUrl,
      status_text: u.statusText,
      is_admin: u.isAdmin,
      created_at: u.createdAt,
    };
  }
}
