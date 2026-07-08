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

/**
 * Issues access JWTs and rotating refresh tokens. Refresh tokens are opaque
 * random strings; only their argon2 hash is stored (TRD §7), so a DB leak
 * cannot be replayed.
 */
@Injectable()
export class TokensService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async issue(user: { id: string; username: string; subscriptionTier: string }): Promise<TokenPair> {
    const access_token = await this.jwt.signAsync(
      { sub: user.id, username: user.username, tier: user.subscriptionTier },
      {
        secret: this.config.get<string>('jwt.accessSecret'),
        expiresIn: this.config.get<string>('jwt.accessTtl'),
      },
    );

    const refresh_token = randomBytes(48).toString('hex');
    const tokenHash = await argon2.hash(refresh_token);
    const ttlDays = this.parseDays(this.config.get<string>('jwt.refreshTtl') ?? '30d');
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    return {
      access_token,
      refresh_token,
      token_type: 'Bearer',
      expires_in: this.config.get<string>('jwt.accessTtl') ?? '15m',
    };
  }

  /**
   * Rotates a refresh token: validates it, revokes the old one, issues a new
   * pair. Returns null if the presented token is invalid/expired/revoked.
   */
  async rotate(presented: string): Promise<TokenPair | null> {
    // We must find the matching stored hash. Tokens are random, so scan the
    // user's active tokens. To keep this O(small), we look up all non-revoked,
    // non-expired tokens and verify against each (sets are tiny per user). To
    // bound it globally we cap the candidate window.
    const candidates = await this.prisma.refreshToken.findMany({
      where: { revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: { user: true },
    });

    for (const c of candidates) {
      if (await argon2.verify(c.tokenHash, presented)) {
        // Rotate: revoke the used token.
        await this.prisma.refreshToken.update({
          where: { id: c.id },
          data: { revokedAt: new Date() },
        });
        return this.issue(c.user);
      }
    }
    return null;
  }

  async revoke(presented: string): Promise<void> {
    const candidates = await this.prisma.refreshToken.findMany({
      where: { revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    for (const c of candidates) {
      if (await argon2.verify(c.tokenHash, presented)) {
        await this.prisma.refreshToken.update({
          where: { id: c.id },
          data: { revokedAt: new Date() },
        });
        return;
      }
    }
  }

  private parseDays(ttl: string): number {
    const m = ttl.match(/^(\d+)d$/);
    return m ? parseInt(m[1], 10) : 30;
  }
}
