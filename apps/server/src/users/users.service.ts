import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { UpdateProfileDto } from './dto/users.dto';

export interface UserDto {
  public_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  status_text: string | null;
  last_seen_at: Date | null;
  online: boolean;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return { ...(await this.toDto(user)), created_at: user.createdAt };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.display_name !== undefined
          ? { displayName: dto.display_name.trim() }
          : {}),
        ...(dto.status_text !== undefined
          ? { statusText: dto.status_text }
          : {}),
        ...(dto.avatar_url !== undefined ? { avatarUrl: dto.avatar_url } : {}),
      },
    });
    return this.toDto(user);
  }

  /** Exact-ID lookup only; never searches or enumerates other accounts. */
  async lookup(publicId: string) {
    const user = await this.prisma.user.findFirst({
      where: { publicId, isActive: true },
      select: { publicId: true, displayName: true, avatarUrl: true },
    });
    if (!user) throw new NotFoundException('User ID not found.');
    return {
      public_id: user.publicId,
      display_name: user.displayName,
      avatar_url: user.avatarUrl,
    };
  }

  async publicIdFor(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { publicId: true },
    });
    return user?.publicId ?? null;
  }

  /** Called by the socket gateway when a user's last socket drops. */
  async touchLastSeen(userId: string): Promise<void> {
    await this.prisma.user
      .update({ where: { id: userId }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);
  }

  private async toDto(u: {
    id: string;
    publicId: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    statusText: string | null;
    lastSeenAt: Date | null;
  }): Promise<UserDto> {
    return {
      public_id: u.publicId,
      username: u.username,
      display_name: u.displayName,
      avatar_url: u.avatarUrl,
      status_text: u.statusText,
      last_seen_at: u.lastSeenAt,
      online: await this.redis.isOnline(u.id).catch(() => false),
    };
  }
}
