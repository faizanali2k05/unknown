import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // All routes under /v1, except /health which stays at the root so the
  // reverse proxy and uptime checks can hit a stable, unversioned URL.
  app.setGlobalPrefix('v1', { exclude: ['health'] });

  // Strict DTO validation everywhere (TRD §7).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  const origins = config.get<string[]>('corsOrigins') ?? ['*'];
  app.enableCors({
    origin: origins.includes('*') ? true : origins,
    credentials: true,
  });

  // Graceful shutdown so containers stop cleanly.
  app.enableShutdownHooks();

  const port = config.get<number>('port') ?? 3000;
  await app.listen(port, '0.0.0.0');
  logger.log(`Unknown API listening on :${port} (prefix /v1)`);
}

void bootstrap();
