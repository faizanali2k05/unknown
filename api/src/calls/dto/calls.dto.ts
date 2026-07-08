import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCallDto {
  @IsString()
  callee_user_id!: string;

  // Caller-chosen display label shown to the callee.
  @IsOptional()
  @IsString()
  @MaxLength(32)
  display_number?: string;

  // Video call (vs audio-only).
  @IsOptional()
  @IsBoolean()
  video?: boolean;
}
