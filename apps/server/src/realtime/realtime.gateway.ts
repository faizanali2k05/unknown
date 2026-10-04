import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { RedisService } from '../redis/redis.service';
import { UsersService } from '../users/users.service';
import { MessagesService } from '../messages/messages.service';
import { ConversationsService } from '../conversations/conversations.service';
import { REALTIME_CHANNEL, RealtimeEnvelope, RT } from './realtime.constants';
import { PrismaService } from '../prisma/prisma.service';

interface AuthedSocket extends Socket {
  userId?: string;
  displayName?: string;
}

/**
 * Socket.IO gateway on /ws. Authenticates with the access JWT, tracks presence
 * in Redis, and bridges WS <-> Redis pub/sub so any API instance can deliver
 * to its locally-connected sockets.
 */
@WebSocketGateway({ path: '/ws', cors: { origin: true } })
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger('Realtime');
  @WebSocketServer() server!: Server;

  /** userId -> local socket ids (this instance only). */
  private readonly local = new Map<string, Set<string>>();

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Inject(forwardRef(() => UsersService))
    private readonly users: UsersService,
    @Inject(forwardRef(() => MessagesService))
    private readonly messages: MessagesService,
    @Inject(forwardRef(() => ConversationsService))
    private readonly conversations: ConversationsService,
  ) {}

  afterInit(): void {
    this.redis.subscribe(REALTIME_CHANNEL, (raw) => {
      const env = raw as RealtimeEnvelope;
      for (const userId of env.targets) {
        const sockets = this.local.get(userId);
        if (!sockets) continue;
        for (const sid of sockets)
          this.server.to(sid).emit(env.event, env.data);
      }
    });
    this.logger.log('WebSocket gateway initialised on /ws');
  }

  async handleConnection(client: AuthedSocket): Promise<void> {
    try {
      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.query.token as string);
      const payload = await this.jwt.verifyAsync(token, {
        secret: this.config.get<string>('jwt.accessSecret'),
      });
      const principal = await this.prisma.user.findFirst({
        where: { OR: [{ publicId: payload.sub }, { id: payload.sub }] },
        select: { id: true, username: true, displayName: true },
      });
      if (!principal) throw new Error('Unknown user');
      client.userId = principal.id;
      client.displayName = principal.displayName;

      const set = this.local.get(principal.id) ?? new Set<string>();
      set.add(client.id);
      this.local.set(principal.id, set);
      await this.redis.setOnline(principal.id, client.id);

      await this.broadcastPresence(principal.id, true);
      this.logger.debug(`connected: ${principal.username}`);
    } catch {
      client.emit('error', { message: 'unauthorized' });
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: AuthedSocket): Promise<void> {
    if (!client.userId) return;
    const set = this.local.get(client.userId);
    set?.delete(client.id);
    if (set && set.size === 0) this.local.delete(client.userId);

    const remaining = await this.redis.setOffline(client.userId, client.id);
    if (remaining === 0) {
      await this.users.touchLastSeen(client.userId);
      await this.broadcastPresence(client.userId, false);
    }
  }

  // ---- Client -> server ----------------------------------------------------

  @SubscribeMessage('message:send')
  async onMessageSend(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody()
    body: {
      conversation_id: string;
      client_id: string;
      body?: string;
      type?: 'text' | 'image' | 'voice' | 'file';
      media_url?: string;
      reply_to_id?: string;
    },
  ): Promise<{ ok: boolean; client_id?: string; error?: string }> {
    if (!client.userId) return { ok: false, error: 'unauthorized' };
    try {
      await this.messages.send(client.userId, body.conversation_id, {
        client_id: body.client_id,
        body: body.body,
        type: body.type,
        media_url: body.media_url,
        reply_to_id: body.reply_to_id,
      });
      return { ok: true, client_id: body.client_id };
    } catch (e) {
      return {
        ok: false,
        client_id: body.client_id,
        error: (e as Error).message,
      };
    }
  }

  @SubscribeMessage('message:typing')
  async onTyping(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { conversation_id: string },
  ): Promise<void> {
    if (!client.userId) return;
    try {
      await this.conversations.assertCanCommunicate(
        client.userId,
        body.conversation_id,
      );
    } catch {
      return;
    }
    const memberIds = await this.conversations.memberIds(body.conversation_id);
    const publicId = await this.users.publicIdFor(client.userId);
    await this.redis.publish(REALTIME_CHANNEL, {
      targets: memberIds.filter((id) => id !== client.userId),
      event: RT.MESSAGE_TYPING,
      data: { conversation_id: body.conversation_id, user_public_id: publicId },
    } satisfies RealtimeEnvelope);
  }

  @SubscribeMessage('message:read')
  async onRead(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { conversation_id: string },
  ): Promise<void> {
    if (!client.userId) return;
    await this.conversations
      .markRead(client.userId, body.conversation_id)
      .catch(() => undefined);
  }

  /** Presence fan-out: everyone this user shares a conversation with. */
  private async broadcastPresence(
    userId: string,
    online: boolean,
  ): Promise<void> {
    const memberships = await this.conversations
      .peersOf(userId)
      .catch(() => [] as string[]);
    if (memberships.length === 0) return;
    const publicId = await this.users.publicIdFor(userId);
    if (!publicId) return;
    await this.redis.publish(REALTIME_CHANNEL, {
      targets: memberships,
      event: RT.PRESENCE_UPDATE,
      data: {
        user_public_id: publicId,
        online,
        last_seen_at: new Date().toISOString(),
      },
    } satisfies RealtimeEnvelope);
  }
}
