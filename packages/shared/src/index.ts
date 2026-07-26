/**
 * Shared contract between apps/server and apps/mobile.
 *
 * Every socket event name and payload type lives here and is imported by both
 * sides. If you find yourself re-declaring one of these in either app, delete
 * it and import from here instead.
 */

// ---------------------------------------------------------------------------
//  Socket.IO event names
// ---------------------------------------------------------------------------

/** Client -> server. */
export const ClientEvent = {
  MESSAGE_SEND: 'message:send',
  MESSAGE_TYPING: 'message:typing',
  MESSAGE_READ: 'message:read',
  CALL_INVITE: 'call:invite',
  CALL_ANSWER: 'call:answer',
  CALL_DECLINE: 'call:decline',
  CALL_END: 'call:end',
} as const;
export type ClientEvent = (typeof ClientEvent)[keyof typeof ClientEvent];

/** Server -> client. */
export const ServerEvent = {
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
export type ServerEvent = (typeof ServerEvent)[keyof typeof ServerEvent];

// ---------------------------------------------------------------------------
//  Enums that mirror the database CHECK constraints
// ---------------------------------------------------------------------------

export type ConversationType = 'direct' | 'group';
export type MemberRole = 'member' | 'admin';
export type MessageType = 'text' | 'image' | 'voice' | 'file' | 'system';
export type CallKind = 'audio' | 'video';

/**
 * Delivery state of a message in the UI. `client_id` is generated on the
 * device before send, so the app can render optimistically and reconcile the
 * server echo without duplicating.
 */
export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read';

// ---------------------------------------------------------------------------
//  Payloads
// ---------------------------------------------------------------------------

export interface MessageSendPayload {
  client_id: string;
  conversation_id: string;
  type: MessageType;
  body?: string;
  media_url?: string;
  reply_to_id?: string;
}

export interface MessageDto {
  id: string;
  client_id: string;
  conversation_id: string;
  sender_id: string;
  type: MessageType;
  body: string | null;
  media_url: string | null;
  media_meta: Record<string, unknown> | null;
  reply_to_id: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
}

export interface TypingPayload {
  conversation_id: string;
  user_id: string;
}

export interface PresencePayload {
  user_id: string;
  online: boolean;
  last_seen_at?: string | null;
}

export interface CallInvitePayload {
  conversation_id: string;
  kind: CallKind;
}

export interface CallIncomingPayload {
  call_id: string;
  conversation_id: string;
  initiator_id: string;
  initiator_display_name: string;
  kind: CallKind;
  room_name: string;
  token: string;
}
