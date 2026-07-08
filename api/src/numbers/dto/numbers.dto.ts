import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateNumberDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  label?: string;

  // Subscribers may request a custom display value; free users get auto-assigned.
  @IsOptional()
  @IsString()
  @MaxLength(32)
  value?: string;
}

export class UpdateNumberDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  label?: string;

  @IsOptional()
  @IsBoolean()
  is_default_display?: boolean;
}
