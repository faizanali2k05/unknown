import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NumbersService } from '../numbers/numbers.service';
import { RealtimePublisher } from '../realtime/realtime.publisher';
import { PushService } from '../push/push.service';
import { LivekitService } from './livekit.service';
import { RT } from '../realtime/realtime.constants';

/**
 * Call SIGNALING only (Phase 2). Creates CallSession rows, mints LiveKit
 * tokens, and pushes call:* events. Real media is LiveKit (Phase 4).
 * Routing is by internal user_id — the public phone network is never involved.
 */
@Injectable()
export class CallsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbers: NumbersService,
    private readonly realtime: RealtimePublisher,
    private readonly livekit: LivekitService,
    private readonly push: PushService,
  ) {}

  async invite(callerUserId: string, calleeUserId: string, displayNumber?: string, video = false) {
    if (callerUserId === calleeUserId) {
      throw new BadRequestException('Cannot call yourself');
    }
    const callee = await this.prisma.user.findUnique({ where: { id: calleeUserId } });
    if (!callee) throw new NotFoundException('Callee not found');

    const callerDisplay = await this.numbers.assertOwnedOrDefault(callerUserId, displayNumber);

    const call = await this.prisma.callSession.create({
      data: {
        callerUserId,
        calleeUserId,
        callerDisplayNumber: callerDisplay,
        livekitRoom: '', // filled below using the id
        status: 'ringing',
      },
    });
    const room = this.livekit.roomFor(call.id);
    await this.prisma.callSession.update({
      where: { id: call.id },
      data: { livekitRoom: room },
    });

    const callerToken = await this.livekit.createJoinToken(room, callerUserId);

    // Ring the callee over WS, and wake the device with a high-priority push.
    await this.realtime.emitToUsers([calleeUserId], RT.CALL_INCOMING, {
      call_id: call.id,
      caller_user_id: callerUserId,
      caller_display_number: callerDisplay,
      livekit_room: room,
      video,
    });
    void this.push.sendToUser(
      calleeUserId,
      { title: video ? 'Incoming video call' : 'Incoming call', body: callerDisplay },
      { type: 'call', call_id: call.id, caller_display_number: callerDisplay, livekit_room: room, video: String(video) },
      { highPriority: true },
    );

    return {
      call_id: call.id,
      livekit_room: room,
      token: callerToken,
      status: 'ringing',
      video,
    };
  }

  async answer(calleeUserId: string, callId: string) {
    const call = await this.requireCall(callId);
    if (call.calleeUserId !== calleeUserId) {
      throw new ForbiddenException('Not your call to answer');
    }
    if (call.status !== 'ringing') {
      throw new BadRequestException(`Call is ${call.status}`);
    }
    await this.prisma.callSession.update({
      where: { id: callId },
      data: { status: 'active' },
    });

    const token = await this.livekit.createJoinToken(call.livekitRoom, calleeUserId);

    await this.realtime.emitToUsers([call.callerUserId], RT.CALL_ANSWERED, {
      call_id: callId,
    });

    return { token, livekit_room: call.livekitRoom };
  }

  async decline(userId: string, callId: string): Promise<void> {
    const call = await this.requireCall(callId);
    this.assertParticipant(call, userId);
    if (call.status === 'ended') return;
    await this.prisma.callSession.update({
      where: { id: callId },
      data: { status: 'declined', endedAt: new Date() },
    });
    const other = userId === call.callerUserId ? call.calleeUserId : call.callerUserId;
    await this.realtime.emitToUsers([other], RT.CALL_DECLINED, { call_id: callId });
  }

  async end(userId: string, callId: string): Promise<void> {
    const call = await this.requireCall(callId);
    this.assertParticipant(call, userId);
    if (call.status === 'ended') return;
    await this.prisma.callSession.update({
      where: { id: callId },
      data: { status: 'ended', endedAt: new Date() },
    });
    const other = userId === call.callerUserId ? call.calleeUserId : call.callerUserId;
    await this.realtime.emitToUsers([other], RT.CALL_ENDED, { call_id: callId });
  }

  async recent(userId: string) {
    const calls = await this.prisma.callSession.findMany({
      where: { OR: [{ callerUserId: userId }, { calleeUserId: userId }] },
      orderBy: { startedAt: 'desc' },
      take: 50,
      include: {
        caller: { select: { username: true } },
        callee: { select: { username: true } },
      },
    });
    return calls.map((c: (typeof calls)[number]) => ({
      id: c.id,
      direction: c.callerUserId === userId ? 'outgoing' : 'incoming',
      peer_username: c.callerUserId === userId ? c.callee.username : c.caller.username,
      caller_display_number: c.callerDisplayNumber,
      status: c.status,
      started_at: c.startedAt,
      ended_at: c.endedAt,
    }));
  }

  private async requireCall(callId: string) {
    const call = await this.prisma.callSession.findUnique({ where: { id: callId } });
    if (!call) throw new NotFoundException('Call not found');
    return call;
  }

  private assertParticipant(
    call: { callerUserId: string; calleeUserId: string },
    userId: string,
  ): void {
    if (call.callerUserId !== userId && call.calleeUserId !== userId) {
      throw new ForbiddenException('You are not part of this call');
    }
  }
}
