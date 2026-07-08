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
import { MessagesService } from '../messages/messages.service';
import { CallsService } from '../calls/calls.service';
import { REALTIME_CHANNEL, RealtimeEnvelope, RT } from './realtime.constants';

interface AuthedSocket extends Socket {
  userId?: string;
  username?: string;
}

/**
 * Socket.IO gateway. Authenticates on connect via ?token=<access_jwt>,
 * tracks presence in Redis, and bridges WS <-> Redis pub/sub so every API
 * instance can deliver to its locally-connected sockets (TRD §4).
 *
 * Path: /ws  (the proxy upgrades wss://api.<domain>/ws).
 */
@WebSocketGateway({ path: '/ws', cors: { origin: true } })
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger('Realtime');
  @WebSocketServer() server!: Server;

  // userId -> set of local socket ids (this instance only).
  private readonly local = new Map<string, Set<string>>();

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    @Inject(forwardRef(() => MessagesService))
    private readonly messages: MessagesService,
    @Inject(forwardRef(() => CallsService))
    private readonly calls: CallsService,
  ) {}

  afterInit(): void {
    // Subscribe once; deliver any envelope to locally-connected targets.
    this.redis.subscribe(REALTIME_CHANNEL, (raw) => {
      const env = raw as RealtimeEnvelope;
      for (const userId of env.targets) {
        const sockets = this.local.get(userId);
        if (!sockets) continue;
        for (const sid of sockets) {
          this.server.to(sid).emit(env.event, env.data);
        }
      }
    });
    this.logger.log('WebSocket gateway initialised on /ws');
  }

  async handleConnection(client: AuthedSocket): Promise<void> {
    try {
      const token =
        (client.handshake.query.token as string) ||
        (client.handshake.auth?.token as string);
      const payload = await this.jwt.verifyAsync(token, {
        secret: this.config.get<string>('jwt.accessSecret'),
      });
      client.userId = payload.sub;
      client.username = payload.username;

      const set = this.local.get(payload.sub) ?? new Set<string>();
      set.add(client.id);
      this.local.set(payload.sub, set);
      await this.redis.setOnline(payload.sub, client.id);

      // Broadcast presence to others (best-effort).
      await this.redis.publish(REALTIME_CHANNEL, {
        targets: [],
        event: RT.PRESENCE_UPDATE,
        data: { user_id: payload.sub, online: true },
      } satisfies RealtimeEnvelope);

      this.logger.debug(`connected: ${payload.username} (${client.id})`);
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
      await this.redis.publish(REALTIME_CHANNEL, {
        targets: [],
        event: RT.PRESENCE_UPDATE,
        data: { user_id: client.userId, online: false },
      } satisfies RealtimeEnvelope);
    }
  }

  // ----- Client -> server events (TRD §4) -----------------------------------

  @SubscribeMessage('message:send')
  async onMessageSend(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { conversation_id: string; body: string; display_number?: string; client_msg_id?: string },
  ): Promise<{ ok: boolean; client_msg_id?: string }> {
    if (!client.userId) return { ok: false };
    await this.messages.send(client.userId, body.conversation_id, {
      body: body.body,
      display_number: body.display_number,
      client_msg_id: body.client_msg_id,
    });
    return { ok: true, client_msg_id: body.client_msg_id };
  }

  @SubscribeMessage('message:typing')
  async onTyping(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { conversation_id: string; targets: string[] },
  ): Promise<void> {
    if (!client.userId) return;
    await this.redis.publish(REALTIME_CHANNEL, {
      targets: body.targets ?? [],
      event: RT.MESSAGE_TYPING,
      data: { conversation_id: body.conversation_id, user_id: client.userId },
    } satisfies RealtimeEnvelope);
  }

  @SubscribeMessage('call:invite')
  async onCallInvite(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { callee_user_id: string; display_number?: string; video?: boolean },
  ): Promise<unknown> {
    if (!client.userId) return { ok: false };
    return this.calls.invite(client.userId, body.callee_user_id, body.display_number, body.video ?? false);
  }

  @SubscribeMessage('call:answer')
  async onCallAnswer(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { call_id: string },
  ): Promise<unknown> {
    if (!client.userId) return { ok: false };
    return this.calls.answer(client.userId, body.call_id);
  }

  @SubscribeMessage('call:decline')
  async onCallDecline(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { call_id: string },
  ): Promise<void> {
    if (!client.userId) return;
    await this.calls.decline(client.userId, body.call_id);
  }

  @SubscribeMessage('call:end')
  async onCallEnd(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { call_id: string },
  ): Promise<void> {
    if (!client.userId) return;
    await this.calls.end(client.userId, body.call_id);
  }
}
