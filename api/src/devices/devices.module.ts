import { Module } from '@nestjs/common';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import {
  Body,
  Controller,
  HttpCode,
  Injectable,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

class RegisterDeviceDto {
  @IsEnum(['ios', 'android'])
  platform!: 'ios' | 'android';

  @IsOptional()
  @IsString()
  fcm_token?: string;

  @IsOptional()
  @IsString()
  apns_voip_token?: string;
}

@Injectable()
class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  async register(userId: string, dto: RegisterDeviceDto): Promise<void> {
    // One row per (user, platform); upsert push tokens (Phase 4 dispatch).
    await this.prisma.device.upsert({
      where: { userId_platform: { userId, platform: dto.platform } },
      create: {
        userId,
        platform: dto.platform,
        fcmToken: dto.fcm_token ?? null,
        apnsVoipToken: dto.apns_voip_token ?? null,
      },
      update: {
        fcmToken: dto.fcm_token ?? null,
        apnsVoipToken: dto.apns_voip_token ?? null,
      },
    });
  }
}

@UseGuards(JwtAuthGuard)
@Controller('devices')
class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Post()
  @HttpCode(204)
  async register(@CurrentUser() user: AuthUser, @Body() dto: RegisterDeviceDto): Promise<void> {
    await this.devices.register(user.userId, dto);
  }
}

@Module({
  controllers: [DevicesController],
  providers: [DevicesService],
})
export class DevicesModule {}
