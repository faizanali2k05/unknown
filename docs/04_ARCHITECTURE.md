# 04 — Architecture

How the pieces fit together, how data moves, and how it scales.

---

## 1. High-level diagram

```
                         ┌─────────────────────────────────────────────┐
                         │                MOBILE CLIENTS                │
                         │   React Native app  (iOS  +  Android)        │
                         │   • UI (green/black, money-bag brand)        │
                         │   • LiveKit SDK (audio)  • CallKit/CallKeep  │
                         │   • WebSocket client     • REST client       │
                         └───────────────┬─────────────────────────────┘
                                         │  HTTPS / WSS  (TLS via Caddy)
                                         ▼
        ┌────────────────────────────────────────────────────────────────────┐
        │                         YOUR KVM VPS (Docker)                       │
        │                                                                     │
        │   ┌──────────┐    reverse proxy + auto-HTTPS                        │
        │   │  Caddy   │────────────────────────────────────────────────┐    │
        │   └────┬─────┘                                                 │    │
        │        │                                                       │    │
        │        ▼                                                       ▼    │
        │  ┌───────────────┐   pub/sub   ┌─────────┐            ┌──────────┐  │
        │  │   NestJS      │◀───────────▶│  Redis  │            │ LiveKit  │  │
        │  │  API + Auth   │             │ presence│            │  (SFU)   │  │
        │  │  + WS Gateway │             │ pub/sub │            │  audio   │  │
        │  └───┬────────┬──┘             └─────────┘            └────┬─────┘  │
        │      │        │                                            │        │
        │      ▼        ▼                                            ▼        │
        │ ┌─────────┐ ┌────────┐                               ┌─────────┐    │
        │ │Postgres │ │ MinIO  │                               │ coturn  │    │
        │ │  (data) │ │(voice- │                               │TURN/STUN│    │
        │ │         │ │ mail)  │                               └─────────┘    │
        │ └─────────┘ └────────┘                                              │
        └──────────────────────┬──────────────────────────────────────────────┘
                               │  outbound push
                               ▼
                  ┌──────────────────────────┐
                  │  FCM (Android) / APNs     │
                  │  + PushKit (iOS calls)    │
                  └──────────────────────────┘
```

---

## 2. Service responsibilities

| Service | Owns |
|---------|------|
| **Caddy** | TLS termination, routing `api.` / `livekit.` subdomains, auto-renew certs |
| **NestJS API + Auth + WS** | Users, numbers, subscriptions, conversations, messages, call signaling, voicemail metadata, JWT, push dispatch |
| **Redis** | Online presence, WS pub/sub fan-out across instances, ephemeral call/session state, rate-limit counters |
| **PostgreSQL** | Durable system of record (all entities in TRD §2) |
| **LiveKit (SFU)** | Real-time WebRTC audio rooms; issues media; mixes/forwards streams |
| **coturn** | STUN (discover public IP) + TURN (relay media when peers are behind strict NAT) |
| **MinIO** | Voicemail audio (and later message media), served via signed URLs |
| **Push (FCM/APNs/PushKit)** | Waking devices for incoming messages and calls |

---

## 3. Two planes: signaling vs media

A key architectural idea — keep these separate:

- **Signaling plane** (NestJS + WS + Redis): "who is calling whom," "a message arrived," presence, call setup/teardown. Low bandwidth, all through the API.
- **Media plane** (LiveKit + coturn): the actual audio packets. High bandwidth, handled by the SFU, *not* through the NestJS API.

This separation is why a modest VPS can handle many users: the API only shuffles small JSON events; LiveKit handles the heavy real-time streams.

---

## 4. Call sequence (who talks to what)

```
Caller app          NestJS API        Push/WS         Callee app        LiveKit
    │  POST /calls       │                │                │                │
    │ ──────────────────▶│ create room+token              │                │
    │ ◀── room+token ────│                │                │                │
    │                    │ call:incoming ─┼───────────────▶│ (CallKit rings)│
    │                    │  (WS or VoIP push w/ display#)  │                │
    │                    │                │  POST /answer  │                │
    │                    │ ◀──────────────┼────────────────│                │
    │                    │ ── token ──────┼───────────────▶│                │
    │  join room ────────┼────────────────┼────────────────┼───────────────▶│
    │                    │                │  join room ────┼───────────────▶│
    │ ◀══════════════ WebRTC audio (via LiveKit / coturn) ════════════════▶ │
    │  call:end ────────▶│ close room                                       │
```

Note: `display_number` chosen by the caller is carried in `call:incoming` and rendered by the callee. Routing is by internal `user_id` — the public phone network is never involved.

---

## 5. Message sequence

```
Sender app           NestJS WS/API        Redis          Recipient app
   │ message:send         │                 │                  │
   │ ────────────────────▶│ persist Message │                  │
   │                      │ ── publish ─────▶│                  │
   │                      │                 │ ── fan-out ──────▶│ message:new
   │                      │  (if offline → FCM/APNs push)       │
   │ ◀── message:delivered│                 │                  │
```

---

## 6. Scaling path (start simple, grow only if needed)

| Stage | Setup | When |
|-------|-------|------|
| **MVP / demo** | Everything on one VPS via Docker Compose | Now |
| **Early users** | Same box; tune Postgres/Redis; enable backups | First users |
| **Growth** | Split **LiveKit + coturn** onto a dedicated media VPS (media is the bottleneck) | Many concurrent calls |
| **Scale-out** | Multiple NestJS API instances behind Caddy; Redis as shared pub/sub; managed Postgres | Larger base |

The architecture is **stateless at the API layer** (state lives in Postgres/Redis), so horizontal scaling is just "run more API containers."

---

## 7. Backups & resilience

- **Postgres:** nightly `pg_dump` to MinIO (or off-box); test restore.
- **MinIO:** versioning on; periodic off-box sync.
- **Config:** all infra in `docker-compose.yml` + `.env` kept in a private repo.
- **Monitoring:** Uptime Kuma pings API + LiveKit; alerts on downtime.
