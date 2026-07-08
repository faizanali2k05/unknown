import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNumberDto, UpdateNumberDto } from './dto/numbers.dto';

const FREE_TIER_NUMBER_LIMIT = 1;

@Injectable()
export class NumbersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const numbers = await this.prisma.number.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    return numbers.map(this.toPublic);
  }

  /**
   * Acquire a new in-app number. Free tier is capped at one number; acquiring
   * more (and choosing a custom `value`) is a subscriber feature (PRD §6).
   */
  async create(userId: string, dto: CreateNumberDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { _count: { select: { numbers: true } } },
    });
    if (!user) throw new NotFoundException('User not found');

    const isSubscriber =
      user.subscriptionTier === 'subscriber' &&
      (!user.subscriptionExpiresAt || user.subscriptionExpiresAt > new Date());

    if (!isSubscriber && user._count.numbers >= FREE_TIER_NUMBER_LIMIT) {
      throw new ForbiddenException(
        'Free tier is limited to one number. Upgrade to subscriber for more.',
      );
    }

    // Custom display value is a subscriber capability.
    let value = dto.value?.trim();
    if (value && !isSubscriber) {
      throw new ForbiddenException('Custom display numbers require a subscription');
    }
    if (!value) value = this.generateNumberValue();

    const clash = await this.prisma.number.findUnique({ where: { value } });
    if (clash) throw new ConflictException('That number value is already taken');

    const number = await this.prisma.number.create({
      data: {
        userId,
        value,
        label: dto.label ?? 'New',
        isDefaultDisplay: user._count.numbers === 0,
      },
    });
    return this.toPublic(number);
  }

  async update(userId: string, id: string, dto: UpdateNumberDto) {
    const number = await this.prisma.number.findFirst({ where: { id, userId } });
    if (!number) throw new NotFoundException('Number not found');

    // Setting a new default clears the previous one atomically.
    if (dto.is_default_display === true) {
      await this.prisma.$transaction([
        this.prisma.number.updateMany({
          where: { userId, isDefaultDisplay: true },
          data: { isDefaultDisplay: false },
        }),
        this.prisma.number.update({
          where: { id },
          data: {
            isDefaultDisplay: true,
            ...(dto.label !== undefined ? { label: dto.label } : {}),
          },
        }),
      ]);
    } else {
      await this.prisma.number.update({
        where: { id },
        data: {
          ...(dto.label !== undefined ? { label: dto.label } : {}),
          ...(dto.is_default_display === false ? { isDefaultDisplay: false } : {}),
        },
      });
    }

    const fresh = await this.prisma.number.findUnique({ where: { id } });
    return this.toPublic(fresh!);
  }

  async remove(userId: string, id: string): Promise<void> {
    const number = await this.prisma.number.findFirst({ where: { id, userId } });
    if (!number) throw new NotFoundException('Number not found');

    const count = await this.prisma.number.count({ where: { userId } });
    if (count <= 1) {
      throw new ForbiddenException('You must keep at least one number');
    }
    await this.prisma.number.delete({ where: { id } });

    // If we removed the default, promote another to default.
    if (number.isDefaultDisplay) {
      const next = await this.prisma.number.findFirst({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      });
      if (next) {
        await this.prisma.number.update({
          where: { id: next.id },
          data: { isDefaultDisplay: true },
        });
      }
    }
  }

  /**
   * Resolves the display label shown to the recipient (another app user).
   * The display number is a USER-CONTROLLED LABEL (like a username) — it does
   * NOT have to be an owned number, and it never touches the public phone
   * network. The user may type any value (1-20 digits/symbols); otherwise we
   * fall back to their default in-app number. (See 07_SCOPE_AND_LEGAL.md.)
   */
  async assertOwnedOrDefault(userId: string, displayNumber?: string): Promise<string> {
    const label = displayNumber?.trim();
    if (label) {
      // Accept any number-like label: digits, spaces, + - # *, length 1-20.
      if (!/^[0-9+\-#*() ]{1,20}$/.test(label)) {
        throw new ForbiddenException(
          'display_number must be 1-20 characters (digits and + - # * ( ) only)',
        );
      }
      return label;
    }
    const def = await this.prisma.number.findFirst({
      where: { userId, isDefaultDisplay: true },
    });
    if (def) return def.value;
    const any = await this.prisma.number.findFirst({ where: { userId } });
    if (!any) throw new NotFoundException('You have no numbers');
    return any.value;
  }

  private toPublic = (n: {
    id: string;
    value: string;
    label: string;
    isDefaultDisplay: boolean;
    createdAt: Date;
  }) => ({
    id: n.id,
    value: n.value,
    label: n.label,
    is_default_display: n.isDefaultDisplay,
    created_at: n.createdAt,
  });

  private generateNumberValue(): string {
    const n = () => Math.floor(Math.random() * 10);
    return `07${n()}${n()} ${n()}${n()}${n()} ${n()}${n()}${n()}${n()}`;
  }
}
