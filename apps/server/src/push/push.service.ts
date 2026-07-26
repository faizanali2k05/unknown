import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as admin from 'firebase-admin';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Firebase Cloud Messaging dispatcher (Android only).
 *
 * Only high-priority messages wake a device in Doze, so anything that must
 * arrive promptly — a new message or an incoming call — is sent with
 * `highPriority`. Nothing else should use it.
 *
 * If FCM is not configured the service degrades to a no-op so the rest of the
 * app keeps working in development.
 */
@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger('Push');
  private enabled = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    const path = process.env.FCM_SERVICE_ACCOUNT_JSON;
    if (!path || !fs.existsSync(path)) {
      this.logger.warn('FCM not configured (FCM_SERVICE_ACCOUNT_JSON missing) — push disabled');
      return;
    }
    try {
      const serviceAccount = JSON.parse(fs.readFileSync(path, 'utf8'));
      if (admin.apps.length === 0) {
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      }
      this.enabled = true;
      this.logger.log(`FCM initialised (project ${serviceAccount.project_id})`);
    } catch (e) {
      this.logger.error(`FCM init failed: ${(e as Error).message}`);
    }
  }

  async sendToUser(
    userId: string,
    notification: { title: string; body: string },
    data: Record<string, string> = {},
    options: { highPriority?: boolean } = {},
  ): Promise<void> {
    if (!this.enabled) return;

    const devices = await this.prisma.device.findMany({ where: { userId } });
    const tokens = devices.map((d: (typeof devices)[number]) => d.fcmToken);
    if (tokens.length === 0) return;

    const isCall = data.type === 'call';
    try {
      const res = await admin.messaging().sendEachForMulticast({
        tokens,
        notification,
        data,
        android: {
          priority: options.highPriority ? 'high' : 'normal',
          // A call is only worth delivering while it is still ringing.
          ...(isCall ? { ttl: 30_000 } : {}),
          notification: { channelId: isCall ? 'calls' : 'messages' },
        },
      });

      // Prune tokens FCM tells us are dead, so we stop paying for them.
      const dead: string[] = [];
      res.responses.forEach((r, i) => {
        const code = r.error?.code ?? '';
        if (
          !r.success &&
          (code.includes('registration-token-not-registered') ||
            code.includes('invalid-argument'))
        ) {
          dead.push(tokens[i]);
        }
      });
      if (dead.length > 0) {
        await this.prisma.device
          .deleteMany({ where: { fcmToken: { in: dead } } })
          .catch(() => undefined);
        this.logger.debug(`pruned ${dead.length} dead FCM token(s)`);
      }
    } catch (e) {
      this.logger.error(`FCM send failed: ${(e as Error).message}`);
    }
  }
}
