import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: string;
}

interface TokenUser {
  id: string;
  publicId: string;
  username: string;
  displayName: string;
}

/**
 * Short-lived access JWTs (15 min) + rotating refresh tokens (30 days).
 * Refresh tokens are opaque random strings; only an argon2 hash is stored, so
 * a database leak cannot be replayed.
 */
@Injectable()
export class TokensService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async issue(user: TokenUser): Promise<TokenPair> {
    const access_token = await this.jwt.signAsync(
      // Keep database primary keys out of client-held access tokens.
      { sub: user.publicId, username: user.username, name: user.displayName },
      {
        secret: this.config.get<string>('jwt.accessSecret'),
        expiresIn: this.config.get<string>('jwt.accessTtl'),
      },
    );

    const refresh_token = randomBytes(48).toString('hex');
    const ttlDays = this.parseDays(
      this.config.get<string>('jwt.refreshTtl') ?? '30d',
    );
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: await argon2.hash(refresh_token),
        expiresAt: new Date(Date.now() + ttlDays * 86_400_000),
      },
    });

    return {
      access_token,
      refresh_token,
      token_type: 'Bearer',
      expires_in: this.config.get<string>('jwt.accessTtl') ?? '15m',
    };
  }

  async rotate(presented: string): Promise<TokenPair | null> {
    const match = await this.findActive(presented);
    if (!match) return null;
    await this.prisma.refreshToken.update({
      where: { id: match.id },
      data: { revokedAt: new Date() },
    });
    return this.issue(match.user);
  }

  async revoke(presented: string): Promise<void> {
    const match = await this.findActive(presented);
    if (!match) return;
    await this.prisma.refreshToken.update({
      where: { id: match.id },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Refresh tokens are random, so they cannot be looked up by value — the
   * presented token is verified against the hashes of currently-active rows.
   * That set stays small: one per device, revoked on every rotation.
   */
  private async findActive(presented: string) {
    const candidates = await this.prisma.refreshToken.findMany({
      where: { revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: { user: true },
    });
    for (const c of candidates) {
      if (await argon2.verify(c.tokenHash, presented)) return c;
    }
    return null;
  }

  private parseDays(ttl: string): number {
    const m = ttl.match(/^(\d+)d$/);
    return m ? parseInt(m[1], 10) : 30;
  }
}
