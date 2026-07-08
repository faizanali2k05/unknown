import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { numbers: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return {
      id: user.id,
      username: user.username,
      sequence_no: user.sequenceNo,
      subscription_tier: user.subscriptionTier,
      subscription_expires_at: user.subscriptionExpiresAt,
      numbers: user.numbers.map((n: (typeof user.numbers)[number]) => ({
        id: n.id,
        value: n.value,
        label: n.label,
        is_default_display: n.isDefaultDisplay,
      })),
      created_at: user.createdAt,
    };
  }

  /** Find a user by one of their in-app numbers (digits-only match). Used by
   *  the dialer: type a number -> call that Unknown user. */
  async findByNumber(value: string) {
    const digits = value.replace(/\D/g, '');
    if (!digits) throw new NotFoundException('Enter a number');
    const numbers = await this.prisma.number.findMany({
      take: 1000,
      include: { user: true },
    });
    const match = numbers.find(
      (n: (typeof numbers)[number]) => n.value.replace(/\D/g, '') === digits,
    );
    if (!match) throw new NotFoundException('No Unknown user has that number');
    return {
      id: match.user.id,
      username: match.user.username,
      display_number: match.value,
    };
  }

  async getPublic(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { numbers: { where: { isDefaultDisplay: true }, take: 1 } },
    });
    if (!user) throw new NotFoundException('User not found');
    return {
      id: user.id,
      username: user.username,
      display_number: user.numbers[0]?.value ?? null,
    };
  }

  async search(q: string, excludeUserId?: string) {
    const query = q.trim();
    // Empty query -> directory of all other users (so Contacts shows people).
    const where = query
      ? {
          AND: [
            excludeUserId ? { id: { not: excludeUserId } } : {},
            {
              OR: [
                { username: { contains: query, mode: 'insensitive' as const } },
                { sequenceNo: { contains: query, mode: 'insensitive' as const } },
              ],
            },
          ],
        }
      : excludeUserId
        ? { id: { not: excludeUserId } }
        : {};
    const users = await this.prisma.user.findMany({
      where,
      take: 50,
      orderBy: { createdAt: 'desc' },
      include: { numbers: { where: { isDefaultDisplay: true }, take: 1 } },
    });
    return users.map((u: (typeof users)[number]) => ({
      id: u.id,
      username: u.username,
      display_number: u.numbers[0]?.value ?? null,
    }));
  }
}
