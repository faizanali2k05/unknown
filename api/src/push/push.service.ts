import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as admin from 'firebase-admin';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Firebase Cloud Messaging dispatcher (Android now; iOS data pushes too).
 * Reads a service-account JSON (path in FCM_SERVICE_ACCOUNT_JSON, kept out of
 * git, mounted read-only). If not configured, push is a safe no-op so the rest
 * of the app keeps working.
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

  /** Look up a user's device tokens and send a data+notification push. */
  async sendToUser(
    userId: string,
    notification: { title: string; body: string },
    data: Record<string, string> = {},
    options: { highPriority?: boolean } = {},
  ): Promise<void> {
    if (!this.enabled) return;
    const devices = await this.prisma.device.findMany({
      where: { userId, fcmToken: { not: null } },
    });
    const tokens = devices.map((d) => d.fcmToken!).filter(Boolean);
    if (tokens.length === 0) return;

    try {
      const res = await admin.messaging().sendEachForMulticast({
        tokens,
        notification,
        data,
        android: {
          priority: options.highPriority ? 'high' : 'normal',
          ...(options.highPriority ? { ttl: 30 } : {}),
        },
        apns: {
          headers: { 'apns-priority': options.highPriority ? '10' : '5' },
          payload: { aps: { sound: 'default' } },
        },
      });
      // Prune tokens FCM reports as invalid/unregistered.
      res.responses.forEach((r, i) => {
        if (!r.success) {
          const code = r.error?.code ?? '';
          if (code.includes('registration-token-not-registered') || code.includes('invalid-argument')) {
            void this.prisma.device
              .updateMany({ where: { fcmToken: tokens[i] }, data: { fcmToken: null } })
              .catch(() => undefined);
          }
        }
      });
    } catch (e) {
      this.logger.error(`FCM send failed: ${(e as Error).message}`);
    }
  }
}
