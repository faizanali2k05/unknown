import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * MinIO-backed object storage for voicemail audio. Produces short-lived signed
 * URLs (TRD §7) so clients upload/download directly without proxying bytes
 * through the API.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger('Storage');
  private readonly s3: S3Client; // internal ops (bucket create, server-side)
  private readonly s3Public: S3Client; // presigning (signs for the public host)
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    const s3cfg = this.config.get('s3') as {
      endpoint: string;
      publicEndpoint: string;
      region: string;
      bucket: string;
      accessKey: string;
      secretKey: string;
      forcePathStyle: boolean;
    };
    this.bucket = s3cfg.bucket;
    const credentials = { accessKeyId: s3cfg.accessKey, secretAccessKey: s3cfg.secretKey };

    this.s3 = new S3Client({
      region: s3cfg.region,
      endpoint: s3cfg.endpoint,
      forcePathStyle: s3cfg.forcePathStyle,
      credentials,
    });

    // Presign against the PUBLIC endpoint so SigV4 (which signs the Host header)
    // matches what the phone sends through the media proxy. No network call is
    // made here — presigning is a local crypto operation.
    this.s3Public = new S3Client({
      region: s3cfg.region,
      endpoint: s3cfg.publicEndpoint,
      forcePathStyle: s3cfg.forcePathStyle,
      credentials,
    });
  }

  /** Presigned PUT for the client to upload audio directly to MinIO. */
  async presignUpload(objectKey: string, expiresIn = 900): Promise<string> {
    return getSignedUrl(
      this.s3Public,
      new PutObjectCommand({ Bucket: this.bucket, Key: objectKey, ContentType: 'audio/m4a' }),
      { expiresIn },
    );
  }

  /** Presigned GET for short-lived playback. */
  async presignDownload(objectKey: string, expiresIn = 300): Promise<string> {
    return getSignedUrl(
      this.s3Public,
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      { expiresIn },
    );
  }
}
