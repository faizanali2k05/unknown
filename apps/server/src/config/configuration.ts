/**
 * Centralised, typed configuration. Everything is env-driven (HARD RULE #9).
 * Never hardcode secrets — all come from process.env.
 */
export interface AppConfig {
  nodeEnv: string;
  port: number;
  logLevel: string;
  corsOrigins: string[];
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: string;
    refreshTtl: string;
  };
  rateLimit: { ttl: number; max: number };
  redisUrl: string;
  s3: {
    endpoint: string;
    publicEndpoint: string;
    region: string;
    bucket: string;
    accessKey: string;
    secretKey: string;
    forcePathStyle: boolean;
  };
  livekit: { apiKey: string; apiSecret: string; url: string };
}

const required = (key: string, fallback?: string): string => {
  const v = process.env[key] ?? fallback;
  if (v === undefined) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return v;
};

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.API_PORT ?? '3000', 10),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  corsOrigins: (process.env.CORS_ORIGINS ?? '*').split(',').map((s) => s.trim()),
  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET', 'dev_access_secret'),
    refreshSecret: required('JWT_REFRESH_SECRET', 'dev_refresh_secret'),
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '30d',
  },
  rateLimit: {
    ttl: parseInt(process.env.RATE_LIMIT_TTL ?? '60', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX ?? '100', 10),
  },
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  s3: {
    endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
    publicEndpoint: process.env.S3_PUBLIC_ENDPOINT ?? process.env.S3_ENDPOINT ?? 'http://localhost:9000',
    region: process.env.S3_REGION ?? 'us-east-1',
    bucket: process.env.S3_BUCKET ?? 'unknown-voicemail',
    accessKey: process.env.MINIO_ROOT_USER ?? 'unknown',
    secretKey: process.env.MINIO_ROOT_PASSWORD ?? 'unknown',
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? 'true') === 'true',
  },
  livekit: {
    apiKey: process.env.LIVEKIT_API_KEY ?? 'unknown_dev_key',
    apiSecret: process.env.LIVEKIT_API_SECRET ?? 'dev_livekit_secret',
    url: process.env.LIVEKIT_URL ?? 'ws://localhost:7880',
  },
});
