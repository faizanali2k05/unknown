import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class StartCallDto {
  @IsUUID()
  conversation_id!: string;

  @IsEnum(['audio', 'video'])
  kind!: 'audio' | 'video';
}

export class EndCallDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  reason?: string;
}
