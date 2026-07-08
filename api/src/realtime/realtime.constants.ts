/** Single Redis channel used to fan realtime events across API instances. */
export const REALTIME_CHANNEL = 'unknown:realtime';

/** Envelope published to REALTIME_CHANNEL. Each API instance receives it and
 *  emits `event`+`data` to any of `targets` that have a local socket. */
export interface RealtimeEnvelope {
  targets: string[]; // user ids
  event: string; // e.g. 'message:new'
  data: unknown;
}

// Server -> client event names (TRD §4).
export const RT = {
  MESSAGE_NEW: 'message:new',
  MESSAGE_DELIVERED: 'message:delivered',
  MESSAGE_READ: 'message:read',
  MESSAGE_TYPING: 'message:typing',
  CALL_INCOMING: 'call:incoming',
  CALL_ANSWERED: 'call:answered',
  CALL_DECLINED: 'call:declined',
  CALL_ENDED: 'call:ended',
  PRESENCE_UPDATE: 'presence:update',
} as const;
