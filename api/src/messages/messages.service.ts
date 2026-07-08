import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NumbersService } from '../numbers/numbers.service';
import { ConversationsService } from '../conversations/conversations.service';
import { RealtimePublisher } from '../realtime/realtime.publisher';
import { RedisService } from '../redis/redis.service';
import { PushService } from '../push/push.service';
import { RT } from '../realtime/realtime.constants';
import { SendMessageDto } from './dto/messages.dto';

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbers: NumbersService,
    private readonly conversations: ConversationsService,
    private readonly realtime: RealtimePublisher,
    private readonly redis: RedisService,
    private readonly push: PushService,
  ) {}

  /** Paginated history (cursor = message id to page before). */
  async history(userId: string, conversationId: string, cursor?: string, limit = 30) {
    await this.conversations.assertMember(userId, conversationId);
    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return messages.reverse().map(this.toPublic);
  }

  /**
   * Persist + fan-out a message. Shared by REST (POST) and WS (message:send).
   * Routing is by conversation_id only — never the public phone network.
   */
  async send(senderUserId: string, conversationId: string, dto: SendMessageDto) {
    const memberIds = await this.conversations.assertMember(senderUserId, conversationId);
    const displayNumber = await this.numbers.assertOwnedOrDefault(
      senderUserId,
      dto.display_number,
    );

    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderUserId,
        senderDisplayNumber: displayNumber,
        body: dto.body,
        mediaUrl: dto.media_url ?? null,
      },
    });

    const recipients = memberIds.filter((id) => id !== senderUserId);

    // Bump unread counters for recipients.
    await this.prisma.conversationMember.updateMany({
      where: { conversationId, userId: { in: recipients } },
      data: { unreadCount: { increment: 1 } },
    });

    const payload = { ...this.toPublic(message), client_msg_id: dto.client_msg_id };

    // Deliver to recipients (online -> WS via Redis fan-out; offline -> push later).
    for (const rid of recipients) {
      const online = await this.redis.isOnline(rid);
      await this.realtime.emitToUsers([rid], RT.MESSAGE_NEW, payload);
      if (!online) {
        // Offline → wake the device with a push carrying the display label.
        void this.push.sendToUser(
          rid,
          { title: displayNumber, body: dto.body.slice(0, 140) },
          { type: 'message', conversation_id: conversationId },
        );
      }
    }

    // Echo to the sender's other devices.
    await this.realtime.emitToUsers([senderUserId], RT.MESSAGE_NEW, payload);

    return payload;
  }

  /** Mark a message read; notify the sender. */
  async markRead(userId: string, messageId: string): Promise<void> {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message) return;
    await this.conversations.assertMember(userId, message.conversationId);

    if (!message.readAt) {
      await this.prisma.message.update({
        where: { id: messageId },
        data: { readAt: new Date() },
      });
    }
    // Reset unread for this reader in the conversation.
    await this.prisma.conversationMember.updateMany({
      where: { conversationId: message.conversationId, userId },
      data: { unreadCount: 0 },
    });

    await this.realtime.emitToUsers([message.senderUserId], RT.MESSAGE_READ, {
      message_id: messageId,
    });
  }

  private toPublic = (m: {
    id: string;
    conversationId: string;
    senderUserId: string;
    senderDisplayNumber: string;
    body: string;
    mediaUrl: string | null;
    createdAt: Date;
    deliveredAt: Date | null;
    readAt: Date | null;
  }) => ({
    id: m.id,
    conversation_id: m.conversationId,
    sender_user_id: m.senderUserId,
    sender_display_number: m.senderDisplayNumber,
    body: m.body,
    media_url: m.mediaUrl,
    created_at: m.createdAt,
    delivered_at: m.deliveredAt,
    read_at: m.readAt,
  });
}
