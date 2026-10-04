import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";

const publicUser = {
  publicId: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  statusText: true,
  lastSeenAt: true,
} as const;

function publicProfile(user: {
  publicId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  statusText: string | null;
  lastSeenAt: Date | null;
}) {
  return {
    public_id: user.publicId,
    username: user.username,
    display_name: user.displayName,
    avatar_url: user.avatarUrl,
    status_text: user.statusText,
    last_seen_at: user.lastSeenAt,
  };
}

@Injectable()
export class FriendsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async list(userId: string) {
    const rows = await this.prisma.friendship.findMany({
      where: { OR: [{ userLowId: userId }, { userHighId: userId }] },
      include: {
        userLow: { select: publicUser },
        userHigh: { select: publicUser },
      },
      orderBy: { createdAt: "desc" },
    });
    return Promise.all(
      rows.map(async (row: (typeof rows)[number]) => {
        const peer = row.userLowId === userId ? row.userHigh : row.userLow;
        return {
          ...publicProfile(peer),
          online: await this.redis
            .isOnline(row.userLowId === userId ? row.userHighId : row.userLowId)
            .catch(() => false),
        };
      }),
    );
  }

  async requests(
    userId: string,
    direction: "incoming" | "outgoing" = "incoming",
  ) {
    const rows = await this.prisma.friendRequest.findMany({
      where: {
        status: "pending",
        ...(direction === "incoming"
          ? { receiverId: userId }
          : { senderId: userId }),
      },
      include: {
        sender: { select: publicUser },
        receiver: { select: publicUser },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return rows.map((row: (typeof rows)[number]) => ({
      direction,
      user: publicProfile(direction === "incoming" ? row.sender : row.receiver),
      created_at: row.createdAt,
    }));
  }

  async blocked(userId: string) {
    const rows = await this.prisma.userBlock.findMany({
      where: { blockerId: userId },
      include: { blocked: { select: publicUser } },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row: (typeof rows)[number]) => publicProfile(row.blocked));
  }

  async sendRequest(userId: string, publicId: string) {
    const peer = await this.prisma.user.findUnique({
      where: { publicId },
      select: { id: true, isActive: true },
    });
    if (!peer?.isActive || peer.id === userId)
      throw new NotFoundException("User ID not found.");

    const blocked = await this.prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: peer.id },
          { blockerId: peer.id, blockedId: userId },
        ],
      },
      select: { blockerId: true },
    });
    if (blocked) throw new NotFoundException("User ID not found.");

    const [friendship, outgoing, incoming] = await Promise.all([
      this.prisma.friendship.findFirst({
        where: {
          OR: [
            { userLowId: userId, userHighId: peer.id },
            { userLowId: peer.id, userHighId: userId },
          ],
        },
        select: { userLowId: true },
      }),
      this.prisma.friendRequest.findUnique({
        where: {
          senderId_receiverId: { senderId: userId, receiverId: peer.id },
        },
      }),
      this.prisma.friendRequest.findUnique({
        where: {
          senderId_receiverId: { senderId: peer.id, receiverId: userId },
        },
      }),
    ]);
    if (friendship) throw new ConflictException("You are already friends.");
    if (outgoing?.status === "pending")
      throw new ConflictException("Friend request already sent.");
    if (incoming?.status === "pending") {
      throw new ConflictException(
        "This person already sent you a request. Review incoming requests.",
      );
    }

    await this.prisma.friendRequest.upsert({
      where: { senderId_receiverId: { senderId: userId, receiverId: peer.id } },
      create: { senderId: userId, receiverId: peer.id, status: "pending" },
      update: { status: "pending", updatedAt: new Date() },
    });
    return { sent: true };
  }

  async accept(userId: string, publicId: string) {
    const peer = await this.requirePeer(publicId, userId);
    const low = userId < peer.id ? userId : peer.id;
    const high = userId < peer.id ? peer.id : userId;
    await this.prisma.$transaction(async (tx) => {
      const request = await tx.friendRequest.findUnique({
        where: {
          senderId_receiverId: { senderId: peer.id, receiverId: userId },
        },
      });
      if (!request || request.status !== "pending") {
        throw new NotFoundException("Incoming friend request not found.");
      }
      const blocked = await tx.userBlock.findFirst({
        where: {
          OR: [
            { blockerId: userId, blockedId: peer.id },
            { blockerId: peer.id, blockedId: userId },
          ],
        },
        select: { blockerId: true },
      });
      if (blocked)
        throw new ForbiddenException("This relationship is blocked.");
      await tx.friendship.upsert({
        where: { userLowId_userHighId: { userLowId: low, userHighId: high } },
        create: { userLowId: low, userHighId: high },
        update: {},
      });
      await tx.friendRequest.update({
        where: { id: request.id },
        data: { status: "accepted" },
      });
    });
    return { accepted: true };
  }

  async reject(userId: string, publicId: string) {
    return this.updatePendingRequest(userId, publicId, "incoming", "rejected");
  }

  async cancel(userId: string, publicId: string) {
    return this.updatePendingRequest(userId, publicId, "outgoing", "cancelled");
  }

  async remove(userId: string, publicId: string) {
    const peer = await this.requirePeer(publicId, userId);
    const low = userId < peer.id ? userId : peer.id;
    const high = userId < peer.id ? peer.id : userId;
    const result = await this.prisma.friendship.deleteMany({
      where: { userLowId: low, userHighId: high },
    });
    if (!result.count) throw new NotFoundException("Friend not found.");
    return { removed: true };
  }

  async block(userId: string, publicId: string) {
    const peer = await this.requirePeer(publicId, userId);
    if (peer.id === userId) throw new NotFoundException("User ID not found.");
    const low = userId < peer.id ? userId : peer.id;
    const high = userId < peer.id ? peer.id : userId;
    await this.prisma.$transaction(async (tx) => {
      await tx.userBlock.upsert({
        where: {
          blockerId_blockedId: { blockerId: userId, blockedId: peer.id },
        },
        create: { blockerId: userId, blockedId: peer.id },
        update: {},
      });
      await tx.friendship.deleteMany({
        where: { userLowId: low, userHighId: high },
      });
      await tx.friendRequest.deleteMany({
        where: {
          OR: [
            { senderId: userId, receiverId: peer.id },
            { senderId: peer.id, receiverId: userId },
          ],
        },
      });
    });
    return { blocked: true };
  }

  async unblock(userId: string, publicId: string) {
    const peer = await this.requirePeer(publicId, userId);
    const result = await this.prisma.userBlock.deleteMany({
      where: { blockerId: userId, blockedId: peer.id },
    });
    if (!result.count) throw new NotFoundException("Blocked user not found.");
    return { unblocked: true };
  }

  private async requirePeer(publicId: string, userId: string) {
    const peer = await this.prisma.user.findUnique({
      where: { publicId },
      select: { id: true, isActive: true },
    });
    if (!peer?.isActive) throw new NotFoundException("User ID not found.");
    if (peer.id === userId)
      throw new ConflictException(
        "You cannot use your own ID for this action.",
      );
    return peer;
  }

  private async updatePendingRequest(
    userId: string,
    publicId: string,
    direction: "incoming" | "outgoing",
    status: "rejected" | "cancelled",
  ) {
    const peer = await this.requirePeer(publicId, userId);
    const senderId = direction === "incoming" ? peer.id : userId;
    const receiverId = direction === "incoming" ? userId : peer.id;
    const result = await this.prisma.friendRequest.updateMany({
      where: { senderId, receiverId, status: "pending" },
      data: { status, updatedAt: new Date() },
    });
    if (!result.count)
      throw new NotFoundException("Pending friend request not found.");
    return { updated: true };
  }
}
