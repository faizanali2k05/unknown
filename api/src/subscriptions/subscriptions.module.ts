import { Module } from '@nestjs/common';
import { IsEnum, IsString } from 'class-validator';
import {
  Body,
  Controller,
  Injectable,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

type Provider = 'apple_iap' | 'google_play' | 'web_stripe' | 'web_paddle';

class VerifySubscriptionDto {
  @IsEnum(['apple_iap', 'google_play', 'web_stripe', 'web_paddle'])
  provider!: Provider;

  @IsString()
  receipt!: string;
}

/**
 * Server-side subscription verification (PAYMENTS §4). The SERVER is the source
 * of truth — never trust the client about tier. For the MVP this validates the
 * shape and records a ledger row; provider receipt verification (Apple/Google/
 * Paddle/Stripe APIs) plugs in here in Phase 6.
 */
@Injectable()
class SubscriptionsService {
  private readonly logger = new Logger('Subscriptions');

  constructor(private readonly prisma: PrismaService) {}

  async verify(userId: string, dto: VerifySubscriptionDto) {
    // TODO Phase 6: call the provider API to verify `dto.receipt`. For now we
    // record the intent and (in non-production) optimistically grant 30 days so
    // the subscriber UX can be demoed end-to-end.
    const verified = await this.verifyWithProvider(dto.provider, dto.receipt);

    const expiresAt = verified
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      : null;

    await this.prisma.subscription.create({
      data: {
        userId,
        provider: dto.provider,
        externalId: dto.receipt.slice(0, 64),
        status: verified ? 'active' : 'pending',
        currentPeriodEnd: expiresAt,
      },
    });

    if (verified) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { subscriptionTier: 'subscriber', subscriptionExpiresAt: expiresAt },
      });
    }

    return {
      tier: verified ? 'subscriber' : 'free',
      expires_at: expiresAt,
    };
  }

  private async verifyWithProvider(provider: Provider, receipt: string): Promise<boolean> {
    // Placeholder. Real implementation per provider (Phase 6).
    this.logger.warn(`verifyWithProvider(${provider}) is a stub — wire real verification in Phase 6`);
    return process.env.NODE_ENV !== 'production' && receipt.length > 0;
  }
}

@UseGuards(JwtAuthGuard)
@Controller('subscriptions')
class SubscriptionsController {
  constructor(private readonly subs: SubscriptionsService) {}

  @Post('verify')
  verify(@CurrentUser() user: AuthUser, @Body() dto: VerifySubscriptionDto) {
    return this.subs.verify(user.userId, dto);
  }
}

@Module({
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService],
})
export class SubscriptionsModule {}
