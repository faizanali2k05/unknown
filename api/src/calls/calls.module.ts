import { Module } from '@nestjs/common';
import { CallsController } from './calls.controller';
import { CallsService } from './calls.service';
import { LivekitService } from './livekit.service';
import { NumbersModule } from '../numbers/numbers.module';

@Module({
  imports: [NumbersModule],
  controllers: [CallsController],
  providers: [CallsService, LivekitService],
  exports: [CallsService],
})
export class CallsModule {}
