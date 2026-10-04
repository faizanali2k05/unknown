import {
  ArrayMinSize,
  IsArray,
  Matches,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateDirectDto {
  @IsString()
  @MaxLength(16)
  @Matches(/^KASSI-[A-Z0-9]{10}$/)
  peer_public_id!: string;
}

export class CreateGroupDto {
  @IsString()
  @MaxLength(64)
  title!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @Matches(/^KASSI-[A-Z0-9]{10}$/, { each: true })
  member_public_ids!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(512)
  avatar_url?: string;
}

export class UpdateGroupDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  avatar_url?: string;
}

export class MembersDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @Matches(/^KASSI-[A-Z0-9]{10}$/, { each: true })
  member_public_ids!: string[];
}
