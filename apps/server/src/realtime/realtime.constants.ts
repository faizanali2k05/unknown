/** Single Redis channel used to fan realtime events across API instances. */
export const REALTIME_CHANNEL = 'unknown:realtime';

/** Envelope published to REALTIME_CHANNEL. Each instance delivers it to any
 *  of `targets` that have a socket connected locally. */
export interface RealtimeEnvelope {
  targets: string[]; // user ids
  event: string;
  data: unknown;
}

/** Server -> client event names. Mirrors packages/shared. */
export const RT = {
  MESSAGE_NEW: 'message:new',
  MESSAGE_DELIVERED: 'message:delivered',
  MESSAGE_READ: 'message:read',
  MESSAGE_TYPING: 'message:typing',
  MESSAGE_DELETED: 'message:deleted',
  CONVERSATION_NEW: 'conversation:new',
  CALL_INCOMING: 'call:incoming',
  CALL_ANSWERED: 'call:answered',
  CALL_DECLINED: 'call:declined',
  CALL_ENDED: 'call:ended',
  PRESENCE_UPDATE: 'presence:update',
} as const;
