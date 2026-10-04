import { IsString, Matches, MaxLength } from 'class-validator';

// Existing accounts are backfilled from UUID hex while new accounts use a
// human-friendly alphabet, so the public format accepts all uppercase hex too.
const PUBLIC_ID = /^KASSI-[A-Z0-9]{10}$/;

export class PublicIdDto {
  @IsString()
  @MaxLength(16)
  @Matches(PUBLIC_ID, { message: 'Enter an exact ID such as KASSI-A7F92X4MBC' })
  public_id!: string;
}
