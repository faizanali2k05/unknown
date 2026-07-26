import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

const MESSAGE_TYPES = ['text', 'image', 'voice', 'file'] as const;

export class SendMessageDto {
  /** Generated on the device. Makes retries idempotent. */
  @IsUUID()
  client_id!: string;

  @IsOptional()
  @IsEnum(MESSAGE_TYPES)
  type?: (typeof MESSAGE_TYPES)[number];

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  media_url?: string;

  @IsOptional()
  @IsObject()
  media_meta?: Record<string, unknown>;

  @IsOptional()
  @IsUUID()
  reply_to_id?: string;
}
