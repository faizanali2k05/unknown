import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationsService } from '../conversations/conversations.service';
import { RealtimePublisher } from '../realtime/realtime.publisher';
import { PushService } from '../push/push.service';
import { LivekitService } from './livekit.service';
import { RT } from '../realtime/realtime.constants';
import { StartCallDto } from './dto/calls.dto';

@Injectable()
export class CallsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
    private readonly realtime: RealtimePublisher,
    private readonly livekit: LivekitService,
    private readonly push: PushService,
  ) {}

  /**
   * Start a call in a conversation. The room name is a fresh random UUID —
   * never derived from conversation or user ids, so a leaked id cannot be used
   * to guess or rejoin another room.
   */
  async start(userId: string, dto: StartCallDto) {
    await this.conversations.assertMember(userId, dto.conversation_id);

    const roomName = randomUUID();
    const call = await this.prisma.call.create({
      data: {
        conversationId: dto.conversation_id,
        initiatorId: userId,
        kind: dto.kind,
        roomName,
      },
    });

    const initiator = await this.prisma.user.findUnique({ where: { id: userId } });
    const token = await this.livekit.createJoinToken(
      roomName,
      userId,
      initiator?.displayName ?? userId,
    );

    const memberIds = await this.conversations.memberIds(dto.conversation_id);
    const others = memberIds.filter((id) => id !== userId);

    const ring = {
      call_id: call.id,
      conversation_id: dto.conversation_id,
      initiator_id: userId,
      initiator_display_name: initiator?.displayName ?? 'Unknown',
      kind: dto.kind,
      room_name: roomName,
    };
    await this.realtime.emitToUsers(others, RT.CALL_INCOMING, ring);

    // High-priority push so a dozing device still rings.
    for (const rid of others) {
      void this.push.sendToUser(
        rid,
        {
          title: `Incoming ${dto.kind} call`,
          body: initiator?.displayName ?? 'Unknown',
        },
        {
          type: 'call',
          call_id: call.id,
          conversation_id: dto.conversation_id,
          kind: dto.kind,
          initiator_display_name: initiator?.displayName ?? 'Unknown',
        },
        { highPriority: true },
      );
    }

    return { call_id: call.id, room_name: roomName, kind: dto.kind, token };
  }

  /** Answering returns this user's own room token. */
  async answer(userId: string, callId: string) {
    const call = await this.requireCall(callId);
    await this.conversations.assertMember(userId, call.conversationId);
    if (call.endedAt) throw new ForbiddenException('Call already ended');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const token = await this.livekit.createJoinToken(
      call.roomName,
      userId,
      user?.displayName ?? userId,
    );

    await this.realtime.emitToUsers([call.initiatorId!].filter(Boolean), RT.CALL_ANSWERED, {
      call_id: call.id,
      user_id: userId,
    });

    return { call_id: call.id, room_name: call.roomName, kind: call.kind, token };
  }

  async decline(userId: string, callId: string): Promise<void> {
    const call = await this.requireCall(callId);
    await this.conversations.assertMember(userId, call.conversationId);
    await this.finish(call.id, 'declined');
    const memberIds = await this.conversations.memberIds(call.conversationId);
    await this.realtime.emitToUsers(
      memberIds.filter((id) => id !== userId),
      RT.CALL_DECLINED,
      { call_id: call.id, user_id: userId },
    );
  }

  async end(userId: string, callId: string, reason = 'hangup'): Promise<void> {
    const call = await this.requireCall(callId);
    await this.conversations.assertMember(userId, call.conversationId);
    await this.finish(call.id, reason);
    const memberIds = await this.conversations.memberIds(call.conversationId);
    await this.realtime.emitToUsers(
      memberIds.filter((id) => id !== userId),
      RT.CALL_ENDED,
      { call_id: call.id, user_id: userId },
    );
  }

  /** Call history for the Calls tab. */
  async history(userId: string) {
    const memberships = await this.prisma.conversationMember.findMany({
      where: { userId },
      select: { conversationId: true },
    });
    const ids = memberships.map((m: (typeof memberships)[number]) => m.conversationId);
    if (ids.length === 0) return [];

    const calls = await this.prisma.call.findMany({
      where: { conversationId: { in: ids } },
      orderBy: { startedAt: 'desc' },
      take: 100,
      include: {
        initiator: { select: { id: true, displayName: true, avatarUrl: true } },
        conversation: {
          include: { members: { include: { user: true } } },
        },
      },
    });

    return calls.map((c: (typeof calls)[number]) => {
      const outgoing = c.initiatorId === userId;
      const peer =
        c.conversation.type === 'direct'
          ? c.conversation.members.find(
              (m: (typeof c.conversation.members)[number]) => m.userId !== userId,
            )?.user
          : null;
      return {
        id: c.id,
        conversation_id: c.conversationId,
        kind: c.kind,
        direction: outgoing ? 'outgoing' : 'incoming',
        title:
          c.conversation.type === 'group'
            ? (c.conversation.title ?? 'Group call')
            : (peer?.displayName ?? c.initiator?.displayName ?? 'Unknown'),
        avatar_url: peer?.avatarUrl ?? null,
        peer_user_id: peer?.id ?? null,
        started_at: c.startedAt,
        ended_at: c.endedAt,
        end_reason: c.endReason,
        duration_sec: c.endedAt
          ? Math.max(0, Math.round((c.endedAt.getTime() - c.startedAt.getTime()) / 1000))
          : null,
      };
    });
  }

  private async finish(callId: string, reason: string): Promise<void> {
    await this.prisma.call.updateMany({
      where: { id: callId, endedAt: null },
      data: { endedAt: new Date(), endReason: reason },
    });
  }

  private async requireCall(callId: string) {
    const call = await this.prisma.call.findUnique({ where: { id: callId } });
    if (!call) throw new NotFoundException('Call not found');
    return call;
  }
}
