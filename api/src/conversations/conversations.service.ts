import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** List the user's conversations with the other member + last message. */
  async list(userId: string) {
    const members = await this.prisma.conversationMember.findMany({
      where: { userId },
      include: {
        conversation: {
          include: {
            members: { include: { user: { include: { numbers: { where: { isDefaultDisplay: true }, take: 1 } } } } },
            messages: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
      },
    });

    return members.map((m: (typeof members)[number]) => {
      const peer = m.conversation.members.find(
        (mm: (typeof m.conversation.members)[number]) => mm.userId !== userId,
      );
      const last = m.conversation.messages[0];
      return {
        id: m.conversation.id,
        type: m.conversation.type,
        unread_count: m.unreadCount,
        peer: peer
          ? {
              user_id: peer.userId,
              username: peer.user.username,
              display_number: peer.user.numbers[0]?.value ?? null,
            }
          : null,
        last_message: last
          ? {
              id: last.id,
              body: last.body,
              sender_display_number: last.senderDisplayNumber,
              created_at: last.createdAt,
            }
          : null,
        created_at: m.conversation.createdAt,
      };
    });
  }

  /** Find-or-create a direct conversation between the user and a peer. */
  async findOrCreateDirect(userId: string, peerUserId: string) {
    if (userId === peerUserId) {
      throw new ForbiddenException('Cannot start a conversation with yourself');
    }
    const peer = await this.prisma.user.findUnique({ where: { id: peerUserId } });
    if (!peer) throw new NotFoundException('Peer user not found');

    // Look for an existing direct conversation containing exactly both users.
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
      return this.shape(existing.id, userId, peerUserId, peer.username);
    }

    const created = await this.prisma.conversation.create({
      data: {
        type: 'direct',
        members: {
          create: [{ userId }, { userId: peerUserId }],
        },
      },
    });
    return this.shape(created.id, userId, peerUserId, peer.username);
  }

  /** Ensure the user is a member; returns the member ids of the conversation. */
  async assertMember(userId: string, conversationId: string): Promise<string[]> {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { members: true },
    });
    if (!conv) throw new NotFoundException('Conversation not found');
    const memberIds = conv.members.map((m: (typeof conv.members)[number]) => m.userId);
    if (!memberIds.includes(userId)) {
      throw new ForbiddenException('You are not a member of this conversation');
    }
    return memberIds;
  }

  private async shape(id: string, userId: string, peerUserId: string, peerUsername: string) {
    return {
      id,
      type: 'direct',
      peer: { user_id: peerUserId, username: peerUsername },
    };
  }
}
