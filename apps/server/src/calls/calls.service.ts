import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
    await this.conversations.assertCanCommunicate(userId, dto.conversation_id);

    const roomName = randomUUID();
    const call = await this.prisma.call.create({
      data: {
        conversationId: dto.conversation_id,
        initiatorId: userId,
        kind: dto.kind,
        roomName,
      },
    });

    const initiator = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    const token = await this.livekit.createJoinToken(
      roomName,
      initiator?.publicId ?? 'unknown',
      initiator?.displayName ?? 'Unknown',
    );

    const memberIds = await this.conversations.memberIds(dto.conversation_id);
    const others = memberIds.filter((id) => id !== userId);

    const ring = {
      call_id: call.id,
      conversation_id: dto.conversation_id,
      initiator_public_id: initiator?.publicId ?? null,
      initiator_display_name: initiator?.displayName ?? 'Unknown',
      kind: dto.kind,
      room_name: roomName,
    };
    await this.realtime.emitToUsers(others, RT.CALL_INCOMING, ring);
    const timeout = setTimeout(() => {
      void this.markMissed(call.id);
    }, 45_000);
    timeout.unref?.();

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
    await this.conversations.assertCanCommunicate(userId, call.conversationId);
    if (
      call.endedAt ||
      call.status === 'missed' ||
      call.status === 'rejected'
    ) {
      throw new ForbiddenException('Call already ended');
    }

    await this.prisma.call.updateMany({
      where: { id: call.id, endedAt: null, status: 'ringing' },
      data: { status: 'answered', answeredAt: new Date() },
    });
    const callState = await this.prisma.call.findUnique({
      where: { id: call.id },
      select: { status: true, endedAt: true },
    });
    if (!callState || callState.endedAt || callState.status === 'missed' || callState.status === 'rejected') {
      throw new ForbiddenException('Call already ended');
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Account not found');
    const token = await this.livekit.createJoinToken(call.roomName, user.publicId, user.displayName);

    await this.realtime.emitToUsers(
      [call.initiatorId!].filter(Boolean),
      RT.CALL_ANSWERED,
      {
        call_id: call.id,
        user_public_id: user?.publicId ?? null,
      },
    );

    return {
      call_id: call.id,
      room_name: call.roomName,
      kind: call.kind,
      token,
    };
  }

  async decline(userId: string, callId: string): Promise<void> {
    const call = await this.requireCall(callId);
    await this.conversations.assertMember(userId, call.conversationId);
    if (call.status !== 'ringing' || call.endedAt) {
      throw new ForbiddenException('Only a ringing call can be declined.');
    }
    await this.finish(call.id, 'declined');
    const memberIds = await this.conversations.memberIds(call.conversationId);
    const actor = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { publicId: true },
    });
    await this.realtime.emitToUsers(
      memberIds.filter((id) => id !== userId),
      RT.CALL_DECLINED,
      { call_id: call.id, user_public_id: actor?.publicId ?? null },
    );
  }

  async end(userId: string, callId: string, reason = 'hangup'): Promise<void> {
    const call = await this.requireCall(callId);
    await this.conversations.assertMember(userId, call.conversationId);
    await this.finish(call.id, reason);
    const memberIds = await this.conversations.memberIds(call.conversationId);
    const actor = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { publicId: true },
    });
    await this.realtime.emitToUsers(
      memberIds.filter((id) => id !== userId),
      RT.CALL_ENDED,
      { call_id: call.id, user_public_id: actor?.publicId ?? null },
    );
  }

  /** Call history for the Calls tab. */
  async history(userId: string) {
    const memberships = await this.prisma.conversationMember.findMany({
      where: { userId },
      select: { conversationId: true },
    });
    const ids = memberships.map(
      (m: (typeof memberships)[number]) => m.conversationId,
    );
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
              (m: (typeof c.conversation.members)[number]) =>
                m.userId !== userId,
            )?.user
          : null;
      return {
        id: c.id,
        conversation_id: c.conversationId,
        kind: c.kind,
        status: c.status,
        direction: outgoing ? 'outgoing' : 'incoming',
        title:
          c.conversation.type === 'group'
            ? (c.conversation.title ?? 'Group call')
            : (peer?.displayName ?? c.initiator?.displayName ?? 'Unknown'),
        avatar_url: peer?.avatarUrl ?? null,
        peer_public_id: peer?.publicId ?? null,
        started_at: c.startedAt,
        answered_at: c.answeredAt,
        ended_at: c.endedAt,
        end_reason: c.endReason,
        duration_sec:
          c.endedAt && c.answeredAt
            ? Math.max(
                0,
                Math.round(
                  (c.endedAt.getTime() - c.answeredAt.getTime()) / 1000,
                ),
              )
            : null,
      };
    });
  }

  private async finish(callId: string, reason: string): Promise<void> {
    const call = await this.prisma.call.findUnique({
      where: { id: callId },
      select: { status: true },
    });
    const status =
      reason === 'declined'
        ? 'rejected'
        : call?.status === 'ringing'
          ? 'missed'
          : reason === 'failed'
            ? 'failed'
            : 'ended';
    await this.prisma.call.updateMany({
      where: { id: callId, endedAt: null },
      data: { endedAt: new Date(), endReason: reason, status },
    });
  }

  private async markMissed(callId: string): Promise<void> {
    const result = await this.prisma.call.updateMany({
      where: { id: callId, status: 'ringing', endedAt: null },
      data: { status: 'missed', endReason: 'missed', endedAt: new Date() },
    });
    if (!result.count) return;
    const call = await this.prisma.call.findUnique({
      where: { id: callId },
      select: { conversationId: true },
    });
    if (!call) return;
    await this.realtime.emitToUsers(
      await this.conversations.memberIds(call.conversationId),
      RT.CALL_ENDED,
      {
        call_id: callId,
        status: 'missed',
        user_public_id: null,
      },
    );
  }

  private async requireCall(callId: string) {
    const call = await this.prisma.call.findUnique({ where: { id: callId } });
    if (!call) throw new NotFoundException('Call not found');
    return call;
  }
}
