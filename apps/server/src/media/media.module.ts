import {
  Body,
  Controller,
  Injectable,
  Logger,
  Module,
  OnModuleInit,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  S3Client,
  PutObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

const KINDS = ['avatar', 'image', 'voice', 'file'] as const;

class UploadUrlDto {
  @IsEnum(KINDS)
  kind!: (typeof KINDS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(128)
  content_type?: string;
}

/**
 * Self-hosted MinIO storage. Files never pass through this server — the client
 * PUTs straight to MinIO with a presigned URL and then sends us the key.
 */
@Injectable()
export class MediaService implements OnModuleInit {
  private readonly logger = new Logger('Media');
  private readonly internal: S3Client;
  private readonly presigner: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    const s3 = this.config.get('s3') as {
      endpoint: string;
      publicEndpoint: string;
      region: string;
      bucket: string;
      accessKey: string;
      secretKey: string;
      forcePathStyle: boolean;
    };
    this.bucket = s3.bucket;
    const credentials = { accessKeyId: s3.accessKey, secretAccessKey: s3.secretKey };

    this.internal = new S3Client({
      region: s3.region,
      endpoint: s3.endpoint,
      forcePathStyle: s3.forcePathStyle,
      credentials,
    });

    // SigV4 signs the Host header, so presigning must use the PUBLIC endpoint
    // or the phone's request will fail the signature check. No network call is
    // made when presigning — it is pure local crypto.
    this.presigner = new S3Client({
      region: s3.region,
      endpoint: s3.publicEndpoint,
      forcePathStyle: s3.forcePathStyle,
      credentials,
    });
  }

  /** Create the bucket once at boot so uploads never 404 on a fresh install. */
  async onModuleInit(): Promise<void> {
    try {
      await this.internal.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`bucket "${this.bucket}" ready`);
    } catch {
      try {
        await this.internal.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.logger.log(`bucket "${this.bucket}" created`);
      } catch (e) {
        this.logger.warn(`could not ensure bucket: ${(e as Error).message}`);
      }
    }
  }

  async presignUpload(userId: string, dto: UploadUrlDto) {
    const key = `${dto.kind}/${userId}/${Date.now()}-${randomUUID()}`;
    const upload_url = await getSignedUrl(
      this.presigner,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: dto.content_type ?? 'application/octet-stream',
      }),
      { expiresIn: 900 },
    );
    const publicEndpoint = (this.config.get('s3') as { publicEndpoint: string }).publicEndpoint;
    return { upload_url, key, public_url: `${publicEndpoint}/${this.bucket}/${key}` };
  }
}

@UseGuards(JwtAuthGuard)
@Controller('media')
class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('upload-url')
  uploadUrl(@CurrentUser() user: AuthUser, @Body() dto: UploadUrlDto) {
    return this.media.presignUpload(user.userId, dto);
  }
}

@Module({
  controllers: [MediaController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
