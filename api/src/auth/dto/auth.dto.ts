import { IsString, MinLength, MaxLength, Matches, IsOptional } from 'class-validator';

export class SignupDto {
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
  @MinLength(3)
  @MaxLength(32)
  sequence_no!: string;
}

export class LoginDto {
  // Either username or sequence_no may be supplied as the identifier.
  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  sequence_no?: string;

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
