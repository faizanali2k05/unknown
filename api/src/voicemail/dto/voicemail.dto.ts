import { IsInt, IsOptional, IsString, Max, Min, MaxLength } from 'class-validator';

export class UploadUrlDto {
  @IsString()
  to_user_id!: string;

  @IsInt()
  @Min(1)
  @Max(600)
  duration_sec!: number;
}

export class CreateVoicemailDto {
  @IsString()
  to_user_id!: string;

  @IsString()
  object_key!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  display_number?: string;

  @IsInt()
  @Min(1)
  @Max(600)
  duration_sec!: number;
}
