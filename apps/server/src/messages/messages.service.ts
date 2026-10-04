import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationsService } from '../conversations/conversations.service';
import { RealtimePublisher } from '../realtime/realtime.publisher';
import { RedisService } from '../redis/redis.service';
import { PushService } from '../push/push.service';
import { RT } from '../realtime/realtime.constants';
import { SendMessageDto } from './dto/messages.dto';

const PAGE_SIZE = 30;

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
    private readonly realtime: RealtimePublisher,
    private readonly redis: RedisService,
    private readonly push: PushService,
  ) {}

  /** Newest-first page. `before` is a message id to page backwards from. */
  async history(userId: string, conversationId: string, before?: string) {
    await this.conversations.assertCanCommunicate(userId, conversationId);

    let cursorDate: Date | undefined;
    if (before) {
      const anchor = await this.prisma.message.findFirst({
        where: { id: before, conversationId },
      });
      cursorDate = anchor?.createdAt;
    }

    const messages = await this.prisma.message.findMany({
      where: {
        conversationId,
        ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE,
      include: { sender: { select: { publicId: true } } },
    });

    return {
      messages: messages.map(this.toDto),
      has_more: messages.length === PAGE_SIZE,
    };
  }

  /**
   * Persist + fan out. Idempotent on (conversationId, clientId): re-sending the
   * same client_id returns the original row instead of creating a duplicate,
   * which is what makes the offline queue safe to retry.
   */
  async send(senderId: string, conversationId: string, dto: SendMessageDto) {
    await this.conversations.assertCanCommunicate(senderId, conversationId);

    if (!dto.body && !dto.media_url) {
      throw new BadRequestException('A message needs body or media_url');
    }

    const existing = await this.prisma.message.findUnique({
      where: {
        conversationId_clientId: { conversationId, clientId: dto.client_id },
      },
      include: { sender: { select: { publicId: true } } },
    });
    if (existing) return this.toDto(existing);

    const message = await this.prisma.message.create({
      data: {
        clientId: dto.client_id,
        conversationId,
        senderId,
        type: dto.type ?? 'text',
        body: dto.body ?? null,
        mediaUrl: dto.media_url ?? null,
        mediaMeta: (dto.media_meta as never) ?? undefined,
        replyToId: dto.reply_to_id ?? null,
      },
      include: { sender: { select: { publicId: true } } },
    });

    const memberIds = await this.conversations.memberIds(conversationId);
    const recipients = memberIds.filter((id) => id !== senderId);
    const payload = this.toDto(message);

    // Everyone (including the sender's other devices) gets the echo.
    await this.realtime.emitToUsers(memberIds, RT.MESSAGE_NEW, payload);

    // Offline recipients get a high-priority push instead.
    const sender = await this.prisma.user.findUnique({
      where: { id: senderId },
    });
    for (const rid of recipients) {
      if (await this.redis.isOnline(rid).catch(() => false)) continue;
      void this.push.sendToUser(
        rid,
        {
          title: sender?.displayName ?? 'New message',
          body: dto.body?.slice(0, 140) ?? this.mediaLabel(dto.type),
        },
        { type: 'message', conversation_id: conversationId },
        { highPriority: true },
      );
    }

    return payload;
  }

  /** Delete for everyone — soft delete, the row stays. */
  async remove(userId: string, messageId: string): Promise<void> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });
    if (!message) throw new NotFoundException('Message not found');
    if (message.senderId !== userId) {
      throw new ForbiddenException('You can only delete your own messages');
    }
    if (message.deletedAt) return;

    await this.prisma.message.update({
      where: { id: messageId },
      data: {
        deletedAt: new Date(),
        body: null,
        mediaUrl: null,
        mediaMeta: undefined,
      },
    });

    const memberIds = await this.conversations.memberIds(
      message.conversationId,
    );
    await this.realtime.emitToUsers(memberIds, RT.MESSAGE_DELETED, {
      message_id: messageId,
      conversation_id: message.conversationId,
    });
  }

  private mediaLabel(type?: string): string {
    switch (type) {
      case 'image':
        return '📷 Photo';
      case 'voice':
        return '🎤 Voice message';
      case 'file':
        return '📎 File';
      default:
        return 'New message';
    }
  }

  private toDto = (m: {
    id: string;
    clientId: string;
    conversationId: string;
    senderId: string | null;
    sender?: { publicId: string } | null;
    type: string;
    body: string | null;
    mediaUrl: string | null;
    mediaMeta: unknown;
    replyToId: string | null;
    createdAt: Date;
    editedAt: Date | null;
    deletedAt: Date | null;
  }) => ({
    id: m.id,
    client_id: m.clientId,
    conversation_id: m.conversationId,
    sender_public_id: m.sender?.publicId ?? null,
    type: m.type,
    body: m.body,
    media_url: m.mediaUrl,
    media_meta: m.mediaMeta ?? null,
    reply_to_id: m.replyToId,
    created_at: m.createdAt,
    edited_at: m.editedAt,
    deleted_at: m.deletedAt,
  });
}
