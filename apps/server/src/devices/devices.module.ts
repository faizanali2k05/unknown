import {
  Body,
  Controller,
  HttpCode,
  Injectable,
  Module,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

class RegisterDeviceDto {
  @IsString()
  @MaxLength(512)
  fcm_token!: string;

  @IsOptional()
  @IsString()
  platform?: string;
}

@Injectable()
class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * fcm_token is unique across the table: if a device is handed to another
   * user (or the app is reinstalled), the token moves to the new owner rather
   * than delivering their messages to the previous one.
   */
  async register(userId: string, dto: RegisterDeviceDto): Promise<void> {
    await this.prisma.device.upsert({
      where: { fcmToken: dto.fcm_token },
      create: { userId, fcmToken: dto.fcm_token, platform: dto.platform ?? 'android' },
      update: { userId, platform: dto.platform ?? 'android' },
    });
  }

  async unregister(token: string): Promise<void> {
    await this.prisma.device.deleteMany({ where: { fcmToken: token } });
  }
}

@UseGuards(JwtAuthGuard)
@Controller('devices')
class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Post()
  @HttpCode(204)
  async register(
    @CurrentUser() user: AuthUser,
    @Body() dto: RegisterDeviceDto,
  ): Promise<void> {
    await this.devices.register(user.userId, dto);
  }

  @Post('unregister')
  @HttpCode(204)
  async unregister(@Body() dto: RegisterDeviceDto): Promise<void> {
    await this.devices.unregister(dto.fcm_token);
  }
}

@Module({
  controllers: [DevicesController],
  providers: [DevicesService],
})
export class DevicesModule {}
