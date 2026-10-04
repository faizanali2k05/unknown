import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { LivekitService } from '../calls/livekit.service';

const MEETING_TTL_MS = 4 * 60 * 60 * 1000;

@Injectable()
export class MeetingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly livekit: LivekitService,
    private readonly config: ConfigService,
  ) {}

  async create(userId: string) {
    const owner = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { publicId: true, displayName: true },
    });
    if (!owner) throw new NotFoundException('Account not found');

    const meetingCode = randomBytes(12).toString('base64url');
    const roomName = `meeting-${randomUUID()}`;
    const expiresAt = new Date(Date.now() + MEETING_TTL_MS);
    const meeting = await this.prisma.meeting.create({
      data: { meetingCode, roomName, createdById: userId, expiresAt },
    });
    const token = await this.livekit.createJoinToken(
      roomName,
      owner.publicId,
      owner.displayName,
      '5m',
    );
    const appUrl = this.config.get<string>('appUrl')?.replace(/\/$/, '');
    return {
      meeting_code: meeting.meetingCode,
      meeting_url: appUrl ? `${appUrl}/meeting/${meeting.meetingCode}` : null,
      token,
      expires_at: meeting.expiresAt,
      is_creator: true,
    };
  }

  async join(userId: string, meetingCode: string) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { meetingCode },
      include: {
        createdBy: { select: { id: true, publicId: true, displayName: true } },
      },
    });
    if (!meeting) throw new NotFoundException('Meeting link not found.');
    if (meeting.status !== 'active' || meeting.expiresAt <= new Date()) {
      if (meeting.status === 'active') {
        await this.prisma.meeting.update({
          where: { id: meeting.id },
          data: { status: 'expired' },
        });
      }
      throw new NotFoundException('This meeting has ended or expired.');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { publicId: true, displayName: true },
    });
    if (!user) throw new NotFoundException('Account not found');
    const token = await this.livekit.createJoinToken(
      meeting.roomName,
      user.publicId,
      user.displayName,
      '5m',
    );
    return {
      meeting_code: meeting.meetingCode,
      token,
      expires_at: meeting.expiresAt,
      is_creator: meeting.createdById === userId,
      creator_name: meeting.createdBy.displayName,
    };
  }

  async end(userId: string, meetingCode: string) {
    const meeting = await this.prisma.meeting.findUnique({
      where: { meetingCode },
    });
    if (!meeting) throw new NotFoundException('Meeting link not found.');
    if (meeting.createdById !== userId)
      throw new ForbiddenException(
        'Only the meeting creator can end this meeting.',
      );
    if (meeting.status === 'active')
      await this.livekit.deleteRoom(meeting.roomName);
    await this.prisma.meeting.updateMany({
      where: { id: meeting.id, status: 'active' },
      data: { status: 'ended', endedAt: new Date() },
    });
    return { ended: true };
  }
}
