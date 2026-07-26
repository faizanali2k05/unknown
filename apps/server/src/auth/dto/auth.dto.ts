import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  /** Registration is invite-only — an admin mints these. */
  @IsString()
  @MinLength(6)
  @MaxLength(64)
  invite_code!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(32)
  @Matches(/^[a-zA-Z0-9_.]+$/, {
    message: 'username may contain letters, numbers, underscore and dot only',
  })
  username!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(48)
  display_name!: string;
}

export class LoginDto {
  @IsString()
  @MinLength(1)
  username!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

export class RefreshDto {
  @IsString()
  refresh_token!: string;
}

export class LogoutDto {
  @IsString()
  refresh_token!: string;
}

export class CreateInviteDto {
  /** How many codes to mint in one go. */
  @IsOptional()
  @IsInt()
  @Min(1)
  count?: number;

  /** Optional expiry in days. Omit for a code that never expires. */
  @IsOptional()
  @IsInt()
  @Min(1)
  expires_in_days?: number;
}
