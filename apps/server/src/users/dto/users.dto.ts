import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(48)
  display_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  status_text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  avatar_url?: string;
}
