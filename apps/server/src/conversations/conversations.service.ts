import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimePublisher } from '../realtime/realtime.publisher';
import { RT } from '../realtime/realtime.constants';
import { CreateGroupDto, UpdateGroupDto } from './dto/conversations.dto';

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimePublisher,
  ) {}

  /** Chats list: peer/title, last message, and unread derived from lastReadAt. */
  async list(userId: string) {
    const memberships = await this.prisma.conversationMember.findMany({
      where: { userId },
      include: {
        conversation: {
          include: {
            members: { include: { user: true } },
            messages: {
              where: { deletedAt: null },
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: { sender: { select: { publicId: true } } },
            },
          },
        },
      },
    });

    const [friendships, blocks] = await Promise.all([
      this.prisma.friendship.findMany({
        where: { OR: [{ userLowId: userId }, { userHighId: userId }] },
        select: { userLowId: true, userHighId: true },
      }),
      this.prisma.userBlock.findMany({
        where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
        select: { blockerId: true, blockedId: true },
      }),
    ]);
    const friendIds = new Set(
      friendships.map((friendship: (typeof friendships)[number]) =>
        friendship.userLowId === userId
          ? friendship.userHighId
          : friendship.userLowId,
      ),
    );
    const blockedIds = new Set(
      blocks.map((block: (typeof blocks)[number]) =>
        block.blockerId === userId ? block.blockedId : block.blockerId,
      ),
    );
    const visibleMemberships = memberships.filter(
      (membership: (typeof memberships)[number]) => {
        if (membership.conversation.type !== 'direct') return true;
        const peerId = membership.conversation.members.find(
          (member: (typeof membership.conversation.members)[number]) =>
            member.userId !== userId,
        )?.userId;
        return !!peerId && friendIds.has(peerId) && !blockedIds.has(peerId);
      },
    );

    const rows = await Promise.all(
      visibleMemberships.map(async (m: (typeof memberships)[number]) => {
        const conv = m.conversation;
        const last = conv.messages[0];

        // Unread = messages from others newer than my lastReadAt.
        const unread = await this.prisma.message.count({
          where: {
            conversationId: conv.id,
            deletedAt: null,
            senderId: { not: userId },
            ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}),
          },
        });

        const peer =
          conv.type === 'direct'
            ? conv.members.find(
                (mm: (typeof conv.members)[number]) => mm.userId !== userId,
              )?.user
            : null;

        return {
          id: conv.id,
          type: conv.type,
          title:
            conv.type === 'group'
              ? conv.title
              : (peer?.displayName ?? 'Unknown'),
          avatar_url:
            conv.type === 'group' ? conv.avatarUrl : (peer?.avatarUrl ?? null),
          peer_public_id: peer?.publicId ?? null,
          member_count: conv.members.length,
          unread_count: unread,
          last_message: last
            ? {
                id: last.id,
                type: last.type,
                body: last.body,
                sender_public_id: last.sender?.publicId ?? null,
                created_at: last.createdAt,
              }
            : null,
          updated_at: last?.createdAt ?? conv.createdAt,
        };
      }),
    );

    return rows.sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );
  }

  /** Find-or-create the 1:1 conversation with a peer. */
  async findOrCreateDirect(userId: string, peerPublicId: string) {
    const peer = await this.prisma.user.findFirst({
      where: { publicId: peerPublicId, isActive: true },
      select: { id: true, publicId: true, displayName: true, avatarUrl: true },
    });
    if (!peer) throw new NotFoundException('User ID not found.');
    if (userId === peer.id)
      throw new BadRequestException(
        'Cannot start a conversation with yourself',
      );
    await this.assertFriends(userId, peer.id);
    const peerUserId = peer.id;

    const existing = await this.prisma.conversation.findFirst({
      where: {
        type: 'direct',
        AND: [
          { members: { some: { userId } } },
          { members: { some: { userId: peerUserId } } },
        ],
      },
      include: { members: true },
    });
    if (existing && existing.members.length === 2) {
      return {
        id: existing.id,
        type: 'direct',
        title: peer.displayName,
        peer_public_id: peer.publicId,
      };
    }

    const created = await this.prisma.conversation.create({
      data: {
        type: 'direct',
        createdBy: userId,
        members: { create: [{ userId }, { userId: peerUserId }] },
      },
    });

    await this.realtime.emitToUsers([peerUserId], RT.CONVERSATION_NEW, {
      conversation_id: created.id,
      type: 'direct',
    });

    return {
      id: created.id,
      type: 'direct',
      title: peer.displayName,
      peer_public_id: peer.publicId,
    };
  }

  async createGroup(userId: string, dto: CreateGroupDto) {
    const publicIds = Array.from(new Set(dto.member_public_ids));
    const people = await this.prisma.user.findMany({
      where: { publicId: { in: publicIds }, isActive: true },
      select: { id: true },
    });
    if (people.length !== publicIds.length)
      throw new NotFoundException('One or more user IDs were not found.');
    const memberIds = Array.from(
      new Set([...people.map((p: (typeof people)[number]) => p.id), userId]),
    );
    await this.assertFriendsWithMany(
      userId,
      memberIds.filter((id) => id !== userId),
    );

    const conv = await this.prisma.conversation.create({
      data: {
        type: 'group',
        title: dto.title.trim(),
        avatarUrl: dto.avatar_url ?? null,
        createdBy: userId,
        members: {
          create: memberIds.map((id) => ({
            userId: id,
            role: id === userId ? ('admin' as const) : ('member' as const),
          })),
        },
      },
    });

    await this.realtime.emitToUsers(
      memberIds.filter((id) => id !== userId),
      RT.CONVERSATION_NEW,
      { conversation_id: conv.id, type: 'group', title: conv.title },
    );

    return { id: conv.id, type: 'group', title: conv.title };
  }

  async detail(userId: string, conversationId: string) {
    await this.assertCanCommunicate(userId, conversationId);
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { members: { include: { user: true } } },
    });
    if (!conv) throw new NotFoundException('Conversation not found');

    const peer =
      conv.type === 'direct'
        ? conv.members.find(
            (m: (typeof conv.members)[number]) => m.userId !== userId,
          )?.user
        : null;

    return {
      id: conv.id,
      type: conv.type,
      title:
        conv.type === 'group' ? conv.title : (peer?.displayName ?? 'Unknown'),
      avatar_url:
        conv.type === 'group' ? conv.avatarUrl : (peer?.avatarUrl ?? null),
      created_at: conv.createdAt,
      members: conv.members.map((m: (typeof conv.members)[number]) => ({
        public_id: m.user.publicId,
        username: m.user.username,
        display_name: m.user.displayName,
        avatar_url: m.user.avatarUrl,
        role: m.role,
      })),
    };
  }

  async updateGroup(
    userId: string,
    conversationId: string,
    dto: UpdateGroupDto,
  ) {
    await this.assertAdmin(userId, conversationId);
    const conv = await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.avatar_url !== undefined ? { avatarUrl: dto.avatar_url } : {}),
      },
    });
    return { id: conv.id, title: conv.title, avatar_url: conv.avatarUrl };
  }

  async addMembers(
    userId: string,
    conversationId: string,
    memberPublicIds: string[],
  ) {
    await this.assertAdmin(userId, conversationId);
    const people = await this.prisma.user.findMany({
      where: { publicId: { in: memberPublicIds }, isActive: true },
      select: { id: true },
    });
    if (people.length !== new Set(memberPublicIds).size) {
      throw new NotFoundException('One or more user IDs were not found.');
    }
    const memberIds = people.map((p: (typeof people)[number]) => p.id);
    await this.assertFriendsWithMany(
      userId,
      memberIds.filter((id) => id !== userId),
    );
    await this.prisma.conversationMember.createMany({
      data: memberIds.map((id) => ({ conversationId, userId: id })),
      skipDuplicates: true,
    });
    await this.realtime.emitToUsers(memberIds, RT.CONVERSATION_NEW, {
      conversation_id: conversationId,
      type: 'group',
    });
    return this.detail(userId, conversationId);
  }

  async removeMember(
    userId: string,
    conversationId: string,
    targetPublicId: string,
  ) {
    const target = await this.prisma.user.findUnique({
      where: { publicId: targetPublicId },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('Group member not found');
    // Admins can remove anyone; anyone can remove themselves (leave).
    if (userId !== target.id) await this.assertAdmin(userId, conversationId);
    const result = await this.prisma.conversationMember.deleteMany({
      where: { conversationId, userId: target.id },
    });
    if (!result.count) throw new NotFoundException('Group member not found');
  }

  /** Marks everything up to now as read for this member. */
  async markRead(userId: string, conversationId: string): Promise<void> {
    await this.assertCanCommunicate(userId, conversationId);
    await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: new Date() },
    });

    const memberIds = await this.memberIds(conversationId);
    const reader = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { publicId: true },
    });
    await this.realtime.emitToUsers(
      memberIds.filter((id) => id !== userId),
      RT.MESSAGE_READ,
      {
        conversation_id: conversationId,
        user_public_id: reader?.publicId ?? null,
        read_at: new Date().toISOString(),
      },
    );
  }

  /** Throws unless the user belongs to the conversation. */
  async assertMember(userId: string, conversationId: string): Promise<void> {
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!member)
      throw new ForbiddenException('You are not a member of this conversation');
  }

  /** Permission to start or continue communication, stricter than history access. */
  async assertCanCommunicate(
    userId: string,
    conversationId: string,
  ): Promise<void> {
    await this.assertMember(userId, conversationId);
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { type: true, members: { select: { userId: true } } },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    if (conversation.type === 'direct') {
      const peer = conversation.members.find(
        (member: (typeof conversation.members)[number]) =>
          member.userId !== userId,
      );
      if (!peer)
        throw new ForbiddenException(
          'That direct conversation is unavailable.',
        );
      await this.assertFriends(userId, peer.userId);
    }
  }

  private async assertFriendsWithMany(
    userId: string,
    peerIds: string[],
  ): Promise<void> {
    for (const peerId of peerIds) await this.assertFriends(userId, peerId);
  }

  private async assertFriends(userId: string, peerId: string): Promise<void> {
    const low = userId < peerId ? userId : peerId;
    const high = userId < peerId ? peerId : userId;
    const [friendship, block] = await Promise.all([
      this.prisma.friendship.findUnique({
        where: { userLowId_userHighId: { userLowId: low, userHighId: high } },
      }),
      this.prisma.userBlock.findFirst({
        where: {
          OR: [
            { blockerId: userId, blockedId: peerId },
            { blockerId: peerId, blockedId: userId },
          ],
        },
        select: { blockerId: true },
      }),
    ]);
    if (!friendship || block)
      throw new ForbiddenException(
        'Only unblocked friends can message or call.',
      );
  }

  private async assertAdmin(
    userId: string,
    conversationId: string,
  ): Promise<void> {
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!member)
      throw new ForbiddenException('You are not a member of this conversation');
    if (member.role !== 'admin')
      throw new ForbiddenException('Group admin only');
  }

  async memberIds(conversationId: string): Promise<string[]> {
    const members = await this.prisma.conversationMember.findMany({
      where: { conversationId },
      select: { userId: true },
    });
    return members.map((m: (typeof members)[number]) => m.userId);
  }

  /**
   * Everyone who shares at least one conversation with this user — the
   * audience for their presence updates.
   */
  async peersOf(userId: string): Promise<string[]> {
    const mine = await this.prisma.conversationMember.findMany({
      where: { userId },
      select: { conversationId: true },
    });
    const convIds = mine.map((m: (typeof mine)[number]) => m.conversationId);
    if (convIds.length === 0) return [];

    const peers = await this.prisma.conversationMember.findMany({
      where: { conversationId: { in: convIds }, userId: { not: userId } },
      select: { userId: true },
      distinct: ['userId'],
    });
    return peers.map((p: (typeof peers)[number]) => p.userId);
  }
}
