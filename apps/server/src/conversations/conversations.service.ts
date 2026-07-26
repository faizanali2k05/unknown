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
            },
          },
        },
      },
    });

    const rows = await Promise.all(
      memberships.map(async (m: (typeof memberships)[number]) => {
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
            ? conv.members.find((mm: (typeof conv.members)[number]) => mm.userId !== userId)?.user
            : null;

        return {
          id: conv.id,
          type: conv.type,
          title: conv.type === 'group' ? conv.title : (peer?.displayName ?? 'Unknown'),
          avatar_url: conv.type === 'group' ? conv.avatarUrl : (peer?.avatarUrl ?? null),
          peer_user_id: peer?.id ?? null,
          member_count: conv.members.length,
          unread_count: unread,
          last_message: last
            ? {
                id: last.id,
                type: last.type,
                body: last.body,
                sender_id: last.senderId,
                created_at: last.createdAt,
              }
            : null,
          updated_at: last?.createdAt ?? conv.createdAt,
        };
      }),
    );

    return rows.sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );
  }

  /** Find-or-create the 1:1 conversation with a peer. */
  async findOrCreateDirect(userId: string, peerUserId: string) {
    if (userId === peerUserId) {
      throw new BadRequestException('Cannot start a conversation with yourself');
    }
    const peer = await this.prisma.user.findUnique({ where: { id: peerUserId } });
    if (!peer) throw new NotFoundException('User not found');

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
      return { id: existing.id, type: 'direct', title: peer.displayName, peer_user_id: peer.id };
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

    return { id: created.id, type: 'direct', title: peer.displayName, peer_user_id: peer.id };
  }

  async createGroup(userId: string, dto: CreateGroupDto) {
    const memberIds = Array.from(new Set([...dto.member_ids, userId]));
    const found = await this.prisma.user.count({ where: { id: { in: memberIds } } });
    if (found !== memberIds.length) throw new NotFoundException('One or more users not found');

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
    await this.assertMember(userId, conversationId);
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { members: { include: { user: true } } },
    });
    if (!conv) throw new NotFoundException('Conversation not found');

    const peer =
      conv.type === 'direct'
        ? conv.members.find((m: (typeof conv.members)[number]) => m.userId !== userId)?.user
        : null;

    return {
      id: conv.id,
      type: conv.type,
      title: conv.type === 'group' ? conv.title : (peer?.displayName ?? 'Unknown'),
      avatar_url: conv.type === 'group' ? conv.avatarUrl : (peer?.avatarUrl ?? null),
      created_at: conv.createdAt,
      members: conv.members.map((m: (typeof conv.members)[number]) => ({
        user_id: m.userId,
        username: m.user.username,
        display_name: m.user.displayName,
        avatar_url: m.user.avatarUrl,
        role: m.role,
      })),
    };
  }

  async updateGroup(userId: string, conversationId: string, dto: UpdateGroupDto) {
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

  async addMembers(userId: string, conversationId: string, memberIds: string[]) {
    await this.assertAdmin(userId, conversationId);
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

  async removeMember(userId: string, conversationId: string, targetUserId: string) {
    // Admins can remove anyone; anyone can remove themselves (leave).
    if (userId !== targetUserId) await this.assertAdmin(userId, conversationId);
    await this.prisma.conversationMember.deleteMany({
      where: { conversationId, userId: targetUserId },
    });
  }

  /** Marks everything up to now as read for this member. */
  async markRead(userId: string, conversationId: string): Promise<void> {
    await this.assertMember(userId, conversationId);
    await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: new Date() },
    });

    const memberIds = await this.memberIds(conversationId);
    await this.realtime.emitToUsers(
      memberIds.filter((id) => id !== userId),
      RT.MESSAGE_READ,
      { conversation_id: conversationId, user_id: userId, read_at: new Date().toISOString() },
    );
  }

  /** Throws unless the user belongs to the conversation. */
  async assertMember(userId: string, conversationId: string): Promise<void> {
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!member) throw new ForbiddenException('You are not a member of this conversation');
  }

  private async assertAdmin(userId: string, conversationId: string): Promise<void> {
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!member) throw new ForbiddenException('You are not a member of this conversation');
    if (member.role !== 'admin') throw new ForbiddenException('Group admin only');
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
