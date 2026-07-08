import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { VoicemailService } from './voicemail.service';
import { UploadUrlDto, CreateVoicemailDto } from './dto/voicemail.dto';

@UseGuards(JwtAuthGuard)
@Controller('voicemail')
export class VoicemailController {
  constructor(private readonly voicemail: VoicemailService) {}

  @Post('upload-url')
  uploadUrl(@CurrentUser() user: AuthUser, @Body() dto: UploadUrlDto) {
    return this.voicemail.uploadUrl(user.userId, dto);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateVoicemailDto) {
    return this.voicemail.create(user.userId, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.voicemail.list(user.userId);
  }

  @Get(':id/play-url')
  playUrl(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.voicemail.playUrl(user.userId, id);
  }

  @Post(':id/read')
  @HttpCode(204)
  async read(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    await this.voicemail.markRead(user.userId, id);
  }
}
