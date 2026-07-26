import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateDirectDto {
  @IsUUID()
  peer_user_id!: string;
}

export class CreateGroupDto {
  @IsString()
  @MaxLength(64)
  title!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  member_ids!: string[];

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
  @IsUUID('4', { each: true })
  member_ids!: string[];
}
