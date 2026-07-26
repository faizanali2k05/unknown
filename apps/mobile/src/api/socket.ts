import { io, Socket } from 'socket.io-client';
import { WS_BASE_URL, tokenStore } from './index';

/**
 * Single Socket.IO connection for the whole app.
 *   server -> client: message:new, message:read, message:typing, message:deleted,
 *                     conversation:new, call:incoming/answered/declined/ended,
 *                     presence:update
 *   client -> server: message:send, message:typing, message:read
 */
let socket: Socket | null = null;

export function connectSocket(): Socket {
  if (socket?.connected) return socket;
  socket?.disconnect();
  socket = io(WS_BASE_URL, {
    path: '/ws',
    transports: ['websocket'],
    auth: { token: tokenStore.getAccess() },
    reconnection: true,
    reconnectionDelay: 1000,
  });
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

export function getSocket(): Socket | null {
  return socket;
}

/** Subscribe; returns an unsubscribe function for useEffect cleanup. */
export function on<T = unknown>(event: string, handler: (data: T) => void): () => void {
  const s = connectSocket();
  s.on(event, handler as (d: unknown) => void);
  return () => {
    s.off(event, handler as (d: unknown) => void);
  };
}

export function emit(event: string, payload: unknown): void {
  connectSocket().emit(event, payload);
}
