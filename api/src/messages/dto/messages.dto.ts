import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SendMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;

  // The chosen display label (subscriber feature). Optional -> default number.
  @IsOptional()
  @IsString()
  @MaxLength(32)
  display_number?: string;

  @IsOptional()
  @IsString()
  media_url?: string;

  // Client-generated id for optimistic UI de-dup / ack.
  @IsOptional()
  @IsString()
  @MaxLength(64)
  client_msg_id?: string;
}

export class StartConversationDto {
  @IsString()
  peer_user_id!: string;
}
