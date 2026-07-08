import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { nanoid } from 'nanoid';
import { PrismaService } from '../prisma/prisma.service';
import { NumbersService } from '../numbers/numbers.service';
import { RealtimePublisher } from '../realtime/realtime.publisher';
import { StorageService } from './storage.service';
import { UploadUrlDto, CreateVoicemailDto } from './dto/voicemail.dto';

@Injectable()
export class VoicemailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbers: NumbersService,
    private readonly storage: StorageService,
    private readonly realtime: RealtimePublisher,
  ) {}

  /** Step 1: client asks for a presigned upload URL + object key. */
  async uploadUrl(fromUserId: string, dto: UploadUrlDto) {
    const objectKey = `vm/${dto.to_user_id}/${Date.now()}_${nanoid(10)}.m4a`;
    const upload_url = await this.storage.presignUpload(objectKey);
    return { upload_url, object_key: objectKey };
  }

  /** Step 2: after upload, create the voicemail record + notify recipient. */
  async create(fromUserId: string, dto: CreateVoicemailDto) {
    const to = await this.prisma.user.findUnique({ where: { id: dto.to_user_id } });
    if (!to) throw new NotFoundException('Recipient not found');

    const fromDisplay = await this.numbers.assertOwnedOrDefault(fromUserId, dto.display_number);

    const vm = await this.prisma.voicemail.create({
      data: {
        fromUserId,
        toUserId: dto.to_user_id,
        fromDisplayNumber: fromDisplay,
        audioObjectKey: dto.object_key,
        durationSec: dto.duration_sec,
      },
    });

    await this.realtime.emitToUsers([dto.to_user_id], 'voicemail:new', {
      id: vm.id,
      from_display_number: fromDisplay,
      duration_sec: vm.durationSec,
      created_at: vm.createdAt,
    });

    return this.toPublic(vm);
  }

  async list(userId: string) {
    const vms = await this.prisma.voicemail.findMany({
      where: { toUserId: userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { from: { select: { username: true } } },
    });
    return vms.map((v: (typeof vms)[number]) => ({
      ...this.toPublic(v),
      from_username: v.from.username,
    }));
  }

  /** Short-lived signed playback URL. */
  async playUrl(userId: string, id: string) {
    const vm = await this.prisma.voicemail.findUnique({ where: { id } });
    if (!vm) throw new NotFoundException('Voicemail not found');
    if (vm.toUserId !== userId) throw new ForbiddenException('Not your voicemail');
    const url = await this.storage.presignDownload(vm.audioObjectKey);
    return { url };
  }

  async markRead(userId: string, id: string): Promise<void> {
    const vm = await this.prisma.voicemail.findUnique({ where: { id } });
    if (!vm) return;
    if (vm.toUserId !== userId) throw new ForbiddenException('Not your voicemail');
    await this.prisma.voicemail.update({ where: { id }, data: { isRead: true } });
  }

  private toPublic = (v: {
    id: string;
    fromUserId: string;
    fromDisplayNumber: string;
    durationSec: number;
    isRead: boolean;
    createdAt: Date;
  }) => ({
    id: v.id,
    from_user_id: v.fromUserId,
    from_display_number: v.fromDisplayNumber,
    duration_sec: v.durationSec,
    is_read: v.isRead,
    created_at: v.createdAt,
  });
}
