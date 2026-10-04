import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as {
  apiBaseUrl?: string;
  wsBaseUrl?: string;
  livekitUrl?: string;
};
export const API_BASE_URL = extra.apiBaseUrl ?? 'https://unknown.5kassi.com/v1';
export const WS_BASE_URL = extra.wsBaseUrl ?? 'wss://unknown.5kassi.com';
export const LIVEKIT_URL = extra.livekitUrl ?? 'wss://unknown.5kassi.com';

// ---------------------------------------------------------------------------
//  Types (mirrors packages/shared)
// ---------------------------------------------------------------------------

export interface Tokens {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: string;
}

export interface User {
  public_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  status_text: string | null;
  last_seen_at?: string | null;
  online?: boolean;
}

export interface Conversation {
  id: string;
  type: 'direct' | 'group';
  title: string;
  avatar_url: string | null;
  peer_public_id: string | null;
  member_count: number;
  unread_count: number;
  last_message: {
    id: string;
    type: string;
    body: string | null;
    sender_public_id: string | null;
    created_at: string;
  } | null;
  updated_at: string;
}

export type MessageStatus = 'sending' | 'sent' | 'failed';

export interface Message {
  id: string;
  client_id: string;
  conversation_id: string;
  sender_public_id: string | null;
  type: 'text' | 'image' | 'voice' | 'file' | 'system';
  body: string | null;
  media_url: string | null;
  reply_to_id: string | null;
  created_at: string;
  deleted_at: string | null;
  /** Client-only: not persisted, drives the tick indicator. */
  status?: MessageStatus;
}

export interface CallRecord {
  id: string;
  conversation_id: string;
  kind: 'audio' | 'video';
  direction: 'incoming' | 'outgoing';
  title: string;
  avatar_url: string | null;
  peer_public_id: string | null;
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
  end_reason: string | null;
  status: 'ringing' | 'answered' | 'rejected' | 'missed' | 'ended' | 'failed';
  duration_sec: number | null;
}

export interface MeetingJoin {
  meeting_code: string;
  token: string;
  expires_at: string;
  is_creator: boolean;
  creator_name?: string;
}

export interface ConversationDetail {
  id: string;
  type: 'direct' | 'group';
  title: string;
  avatar_url: string | null;
  members: {
    public_id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    role: 'member' | 'admin';
  }[];
}

// ---------------------------------------------------------------------------
//  Token storage + transport
// ---------------------------------------------------------------------------

const ACCESS_KEY = 'unknown.access';
const REFRESH_KEY = 'unknown.refresh';

let accessToken: string | null = null;
let refreshToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export const tokenStore = {
  async load(): Promise<void> {
    const [[, a], [, r]] = await AsyncStorage.multiGet([
      ACCESS_KEY,
      REFRESH_KEY,
    ]);
    accessToken = a;
    refreshToken = r;
  },
  async set(t: Tokens): Promise<void> {
    accessToken = t.access_token;
    refreshToken = t.refresh_token;
    await AsyncStorage.multiSet([
      [ACCESS_KEY, t.access_token],
      [REFRESH_KEY, t.refresh_token],
    ]);
  },
  async clear(): Promise<void> {
    accessToken = null;
    refreshToken = null;
    await AsyncStorage.multiRemove([ACCESS_KEY, REFRESH_KEY]);
  },
  getAccess: () => accessToken,
  getRefresh: () => refreshToken,
  setOnUnauthorized: (cb: () => void) => {
    onUnauthorized = cb;
  },
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function refreshAccess(): Promise<boolean> {
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { tokens: Tokens };
    await tokenStore.set(data.tokens);
    return true;
  } catch {
    return false;
  }
}

async function request<T>(
  path: string,
  opts: {
    method?: string;
    body?: unknown;
    auth?: boolean;
    _retry?: boolean;
  } = {},
): Promise<T> {
  const { method = 'GET', body, auth = true, _retry = false } = opts;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && auth && !_retry) {
    if (await refreshAccess())
      return request<T>(path, { ...opts, _retry: true });
    await tokenStore.clear();
    onUnauthorized?.();
    throw new ApiError(401, 'Session expired');
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const m = data?.message;
    throw new ApiError(
      res.status,
      Array.isArray(m) ? m.join(', ') : (m ?? `Error ${res.status}`),
    );
  }
  return data as T;
}

// ---------------------------------------------------------------------------
//  Endpoints
// ---------------------------------------------------------------------------

export const api = {
  // Auth
  register: (username: string, password: string, display_name: string) =>
    request<{ user: User; tokens: Tokens }>('/auth/register', {
      method: 'POST',
      auth: false,
      body: { username, password, display_name },
    }),
  login: (username: string, password: string) =>
    request<{ user: User; tokens: Tokens }>('/auth/login', {
      method: 'POST',
      auth: false,
      body: { username, password },
    }),
  logout: (refresh_token: string) =>
    request<void>('/auth/logout', {
      method: 'POST',
      auth: false,
      body: { refresh_token },
    }),

  // Users
  me: () => request<User>('/users/me'),
  updateMe: (patch: {
    display_name?: string;
    status_text?: string;
    avatar_url?: string;
  }) => request<User>('/users/me', { method: 'PATCH', body: patch }),
  lookupUser: (public_id: string) =>
    request<{
      public_id: string;
      display_name: string;
      avatar_url: string | null;
    }>(`/users/lookup/${encodeURIComponent(public_id)}`),
  friends: () => request<User[]>('/friends'),
  friendRequests: (direction: 'incoming' | 'outgoing' = 'incoming') =>
    request<{ direction: string; user: User; created_at: string }[]>(
      `/friends/requests?direction=${direction}`,
    ),
  sendFriendRequest: (public_id: string) =>
    request<{ sent: boolean }>('/friends/requests', {
      method: 'POST',
      body: { public_id },
    }),
  acceptFriendRequest: (public_id: string) =>
    request<{ accepted: boolean }>(
      `/friends/requests/${encodeURIComponent(public_id)}/accept`,
      { method: 'POST' },
    ),
  rejectFriendRequest: (public_id: string) =>
    request<{ updated: boolean }>(
      `/friends/requests/${encodeURIComponent(public_id)}/reject`,
      { method: 'POST' },
    ),
  cancelFriendRequest: (public_id: string) =>
    request<{ updated: boolean }>(
      `/friends/requests/${encodeURIComponent(public_id)}/cancel`,
      { method: 'POST' },
    ),
  removeFriend: (public_id: string) =>
    request<{ removed: boolean }>(`/friends/${encodeURIComponent(public_id)}`, {
      method: 'DELETE',
    }),
  blockedUsers: () => request<User[]>('/friends/blocks'),
  blockUser: (public_id: string) =>
    request<{ blocked: boolean }>('/friends/blocks', {
      method: 'POST',
      body: { public_id },
    }),
  unblockUser: (public_id: string) =>
    request<{ unblocked: boolean }>(
      `/friends/blocks/${encodeURIComponent(public_id)}`,
      { method: 'DELETE' },
    ),

  // Conversations
  conversations: () => request<Conversation[]>('/conversations'),
  directConversation: (peer_public_id: string) =>
    request<{
      id: string;
      type: string;
      title: string;
      peer_public_id: string;
    }>('/conversations/direct', { method: 'POST', body: { peer_public_id } }),
  createGroup: (title: string, member_public_ids: string[]) =>
    request<{ id: string; title: string }>('/conversations/group', {
      method: 'POST',
      body: { title, member_public_ids },
    }),
  conversation: (id: string) =>
    request<ConversationDetail>(`/conversations/${id}`),
  markRead: (id: string) =>
    request<void>(`/conversations/${id}/read`, { method: 'POST' }),

  // Messages
  history: (conversationId: string, before?: string) =>
    request<{ messages: Message[]; has_more: boolean }>(
      `/conversations/${conversationId}/messages${before ? `?before=${before}` : ''}`,
    ),
  sendMessage: (
    conversationId: string,
    payload: { client_id: string; body?: string; reply_to_id?: string },
  ) =>
    request<Message>(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: payload,
    }),
  deleteMessage: (id: string) =>
    request<void>(`/messages/${id}`, { method: 'DELETE' }),

  // Calls
  startCall: (conversation_id: string, kind: 'audio' | 'video') =>
    request<{
      call_id: string;
      room_name: string;
      kind: string;
      token: string;
    }>('/calls', {
      method: 'POST',
      body: { conversation_id, kind },
    }),
  answerCall: (id: string) =>
    request<{
      call_id: string;
      room_name: string;
      kind: string;
      token: string;
    }>(`/calls/${id}/answer`, { method: 'POST' }),
  declineCall: (id: string) =>
    request<void>(`/calls/${id}/decline`, { method: 'POST' }),
  endCall: (id: string) =>
    request<void>(`/calls/${id}/end`, { method: 'POST', body: {} }),
  callHistory: () => request<CallRecord[]>('/calls/history'),

  // Meetings (links do not provide access unless the viewer is signed in).
  createMeeting: () =>
    request<MeetingJoin & { meeting_url: string | null }>('/meetings', {
      method: 'POST',
    }),
  joinMeeting: (code: string) =>
    request<MeetingJoin>(`/meetings/${encodeURIComponent(code)}/join`, {
      method: 'POST',
    }),
  endMeeting: (code: string) =>
    request<{ ended: boolean }>(`/meetings/${encodeURIComponent(code)}/end`, {
      method: 'POST',
    }),

  // Devices
  registerDevice: (fcm_token: string) =>
    request<void>('/devices', { method: 'POST', body: { fcm_token } }),
};
