# 02 — Technical Requirements Document (TRD)

This document describes *how* Unknown works under the hood: services, data models, APIs, and the exact flow of a call, a message, and a voicemail.

---

## 1. System overview

Unknown is a set of self-hosted services behind a single domain:

- **API + Auth service** (NestJS) — REST + WebSocket; owns users, numbers, subscriptions, messaging.
- **Realtime messaging** (NestJS WebSocket gateway + Redis pub/sub) — delivers messages and presence.
- **Voice media** (LiveKit SFU + coturn) — WebRTC audio between users.
- **PostgreSQL** — system of record.
- **Redis** — presence, pub/sub fan-out, short-lived call/session state.
- **MinIO** — voicemail and (later) media object storage.
- **Push dispatcher** — FCM + APNs/PushKit for waking devices.

All services run as Docker containers; Caddy terminates TLS and reverse-proxies.

---

## 2. Core concepts & data model

### 2.1 The "display number" is a label, not a telecom route
A `Number` row is an **in-app identifier** owned by a user. When user A calls/texts user B, the payload carries a `display_number` field A chose. B's client renders that value. Routing is always by internal `user_id` / `number_id` — never by dialing the public phone network. This is the whole legal foundation (see [`07_SCOPE_AND_LEGAL.md`](07_SCOPE_AND_LEGAL.md)).

### 2.2 Entities

```
User
  id (uuid, pk)
  username (unique)
  password_hash (argon2)
  sequence_no (unique, human sign-in id)
  subscription_tier (free | subscriber)
  subscription_expires_at (nullable)
  created_at

Number
  id (uuid, pk)
  user_id (fk -> User)
  value (string, the in-app number/label, unique)
  label (string, e.g. "Work")
  is_default_display (bool)
  created_at

Conversation
  id (uuid, pk)
  type (direct)            # group: later
  created_at

ConversationMember
  conversation_id (fk)
  user_id (fk)
  unread_count (int)

Message
  id (uuid, pk)
  conversation_id (fk)
  sender_user_id (fk)
  sender_display_number (string)   # the chosen label shown to recipient
  body (text)
  media_url (nullable)
  created_at
  delivered_at (nullable)
  read_at (nullable)

CallSession
  id (uuid, pk)
  caller_user_id (fk)
  callee_user_id (fk)
  caller_display_number (string)   # what callee sees
  livekit_room (string)
  status (ringing | active | ended | missed | declined)
  started_at, ended_at

Voicemail
  id (uuid, pk)
  from_user_id (fk)
  to_user_id (fk)
  from_display_number (string)
  audio_object_key (string)        # MinIO key
  duration_sec (int)
  is_read (bool)
  created_at

Device
  id (uuid, pk)
  user_id (fk)
  platform (ios | android)
  fcm_token (string, nullable)
  apns_voip_token (string, nullable)   # PushKit, for call wake-up
  updated_at

Subscription (optional ledger)
  id, user_id, provider (apple_iap | google_play | web_stripe | web_paddle)
  external_id, status, current_period_end, created_at
```

---

## 3. API surface (REST)

Base: `https://api.<domain>/v1`  · Auth: `Authorization: Bearer <access_token>`

### Auth
```
POST  /auth/signup        { username, password, sequence_no }  -> { user, tokens }
POST  /auth/login         { username|sequence_no, password }   -> { user, tokens }
POST  /auth/refresh       { refresh_token }                    -> { tokens }
POST  /auth/logout        { refresh_token }                    -> 204
```

### Numbers
```
GET   /numbers                                   -> [Number]
POST  /numbers            { label }               -> Number     (acquire in-app number)
PATCH /numbers/:id        { label?, is_default_display? } -> Number
DELETE/numbers/:id                                -> 204
```

### Messaging (REST for history; realtime over WS)
```
GET   /conversations                              -> [Conversation + last message]
GET   /conversations/:id/messages?cursor=...      -> [Message]
POST  /conversations/:id/messages
        { body, display_number, media_url? }      -> Message
POST  /conversations      { peer_user_id }        -> Conversation   (start/find direct)
POST  /messages/:id/read                          -> 204
```

### Calls
```
POST  /calls             { callee_user_id, display_number } -> { call_id, livekit_room, token }
POST  /calls/:id/answer                            -> { token }
POST  /calls/:id/decline                           -> 204
POST  /calls/:id/end                               -> 204
GET   /calls/recent                                -> [CallSession]
```

### Voicemail
```
POST  /voicemail/upload-url  { to_user_id, duration_sec } -> { upload_url, object_key }
POST  /voicemail             { to_user_id, object_key, display_number, duration_sec } -> Voicemail
GET   /voicemail                                   -> [Voicemail]
GET   /voicemail/:id/play-url                       -> { url }   (signed, short-lived)
POST  /voicemail/:id/read                           -> 204
```

### Devices & subscription
```
POST  /devices           { platform, fcm_token?, apns_voip_token? } -> 204
POST  /subscriptions/verify  { provider, receipt }  -> { tier, expires_at }
```

---

## 4. Realtime protocol (WebSocket)

Connect: `wss://api.<domain>/ws?token=<access_token>`

**Client → server events**
- `presence:online`
- `message:send` `{ conversation_id, body, display_number, client_msg_id }`
- `message:typing` `{ conversation_id }`
- `call:invite` `{ callee_user_id, display_number }`
- `call:answer` / `call:decline` / `call:end` `{ call_id }`

**Server → client events**
- `message:new` `{ message }`
- `message:delivered` / `message:read` `{ message_id }`
- `call:incoming` `{ call_id, caller_display_number, livekit_room }`
- `call:answered` / `call:declined` / `call:ended` `{ call_id }`
- `presence:update` `{ user_id, online }`

Redis pub/sub fans these out so multiple API instances stay in sync.

---

## 5. Flows

### 5.1 Send a message
1. Client emits `message:send` with chosen `display_number`.
2. API persists `Message`, sets `sender_display_number`.
3. If recipient online → push `message:new` over WS. If offline → queue + send FCM/APNs push.
4. Recipient renders the `display_number` as the sender. Reply targets the same conversation; routing is by `conversation_id`, never the public network.

### 5.2 Place a call
1. Caller `POST /calls` (or `call:invite`) with `display_number`.
2. API creates `CallSession`, a LiveKit room, and a join token for the caller.
3. API pushes `call:incoming` (WS if online; **PushKit/VoIP push** to wake iOS, high-priority FCM for Android) carrying `caller_display_number`.
4. Callee answers → `POST /calls/:id/answer` → gets a LiveKit token → both join the room → WebRTC audio flows via LiveKit SFU (coturn relays if NAT-restricted).
5. Hang up → `call:end` → room closed, `CallSession.ended_at` set.

### 5.3 Voicemail (callee unavailable)
1. If callee declines/misses, caller is offered to record.
2. Client requests `upload-url`, uploads audio straight to MinIO.
3. Client `POST /voicemail` with `object_key` + `display_number`.
4. Callee gets a push; plays back via short-lived signed URL.

---

## 6. Push notifications (the tricky part — document clearly)

- **Android:** Firebase Cloud Messaging, high-priority data messages. Free.
- **iOS messages:** APNs (routed through FCM is fine).
- **iOS calls:** must use **PushKit + CallKit**. An incoming call sends a **VoIP push** that wakes the app and shows the native call UI even when the app is killed. This requires a VoIP push certificate from the Apple Developer account. Without CallKit, iOS calls won't ring reliably in the background — this is an Apple platform requirement, plan for it.

---

## 7. Security requirements

- Passwords hashed with **argon2id**.
- **JWT access tokens** short-lived (~15 min) + **refresh tokens** (rotating, stored hashed, revocable).
- All endpoints over **TLS** (Caddy auto-HTTPS).
- Voicemail/media URLs **signed and time-limited**.
- Rate limiting on auth and messaging endpoints.
- Input validation (class-validator) on every DTO.
- LiveKit room tokens scoped per-call, short TTL.

---

## 8. Environments

| Env | Purpose | Notes |
|-----|---------|-------|
| Local | Dev | Docker Compose, self-signed or mkcert |
| Staging | Demo to client | On the VPS, subdomain, TestFlight/APK |
| Prod | Live | Same VPS or scaled out; backups enabled |
