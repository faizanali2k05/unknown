import { Module } from '@nestjs/common';
import { VoicemailController } from './voicemail.controller';
import { VoicemailService } from './voicemail.service';
import { StorageService } from './storage.service';
import { NumbersModule } from '../numbers/numbers.module';

@Module({
  imports: [NumbersModule],
  controllers: [VoicemailController],
  providers: [VoicemailService, StorageService],
  exports: [VoicemailService],
})
export class VoicemailModule {}
