# 03 — Tech Stack

Every choice below is **free and open-source**, self-hostable on your KVM VPS, and chosen to be production-grade yet light on resources. Where there's a trade-off, the reasoning is stated so the client sees this was a deliberate engineering decision.

---

## At a glance

| Layer | Choice | License | Why |
|-------|--------|---------|-----|
| Mobile app | **React Native (Expo, bare workflow)** | MIT | One codebase → iOS + Android. Native modules (CallKit, LiveKit) supported via bare workflow. Huge ecosystem. |
| Voice (WebRTC SFU) | **LiveKit** | Apache-2.0 | Best self-hosted real-time audio/video server. Official RN/iOS/Android SDKs. Scales rooms cleanly. |
| NAT traversal | **coturn** | BSD | Standard TURN/STUN; required so calls connect across mobile NATs/firewalls. |
| Backend API | **NestJS (TypeScript)** | MIT | Structured, modular, fast to build, first-class WebSocket + REST. TS shared mental model with the RN app. |
| Realtime | **NestJS Gateway + Redis pub/sub** | MIT / BSD | Simple, horizontally scalable messaging + presence. |
| Database | **PostgreSQL + Prisma ORM** | PostgreSQL / Apache-2.0 | Rock-solid relational store; Prisma = typed, migration-friendly schema. |
| Cache / presence / pub-sub | **Redis** | BSD | Presence, fan-out, ephemeral call state. |
| Object storage | **MinIO** | AGPL-3.0 | S3-compatible voicemail/media store, self-hosted; works with AWS SDK. |
| Auth | **JWT (Passport + argon2)** | MIT | Stateless, refresh rotation, no paid auth vendor. |
| Push | **Firebase Cloud Messaging** + **APNs/PushKit** | Free tier / Apple | Free reliable push; PushKit+CallKit for iOS call wake-up. |
| Reverse proxy + TLS | **Caddy** | Apache-2.0 | Automatic Let's Encrypt HTTPS, tiny config. |
| Containerization | **Docker + Docker Compose** | Apache-2.0 | One-command, reproducible deploy. |
| Optional deploy UI | **Coolify** | Apache-2.0 | Self-hosted Heroku-like panel if you want a GUI on the VPS. |
| Monitoring | **Uptime Kuma** | MIT | Free status/uptime dashboard + alerts. |

---

## Why these over the obvious alternatives

### Calls: LiveKit vs Asterisk/FreeSWITCH vs raw SIP
- **Asterisk / FreeSWITCH** are classic PBXs built around SIP and the telephone network. Powerful, but heavy, SIP-centric, and overkill for a **closed app network** that talks WebRTC to mobile clients. They shine when bridging to real phone lines — which we deliberately don't do.
- **LiveKit** is WebRTC-native, has official mobile SDKs, and is dramatically simpler to run for app-to-app audio. It maps perfectly onto "users calling users in-app." **Winner for this product.**

### Mobile: React Native vs Flutter vs native
- **Native (Swift + Kotlin)** = best polish, 2× the work, 2× the time. No.
- **Flutter** = great, but LiveKit/CallKit integration and the JS/TS ecosystem favor RN here, and you keep one language (TS) across app + backend.
- **React Native (bare)** = single codebase, native modules where needed, fastest path to a working iOS+Android build. **Winner.**

### Backend: NestJS vs plain Express vs Go
- **Go** is the most resource-efficient and a fine choice if raw performance is the priority — but slower to build, and splits the language from the RN frontend.
- **Plain Express** is too unstructured for a system with this many moving parts.
- **NestJS** gives structure (modules, DI, guards), REST + WS out of the box, and TypeScript end-to-end. Best **build-speed-to-quality** ratio for this project. **Winner.** (If you later need to squeeze the VPS, the messaging gateway can be rewritten in Go without touching the app.)

### Messaging: custom NestJS+Redis vs Matrix (Synapse)
- **Matrix/Synapse** is a full federated chat system — comprehensive but RAM-hungry and heavy to operate on a single modest VPS, and federation isn't a requirement.
- **Custom gateway + Redis** is lean, fully under your control, and exactly scoped to what's needed. **Winner.**

### Auth: JWT vs Firebase Auth vs Supabase
- All can work. **Self-hosted JWT** keeps everything on your VPS at $0 with no vendor lock-in. (Supabase self-hosted is also fine if you want batteries-included Postgres+Auth+Storage — noted as an alternative.)

---

## Versions / key packages (indicative)

```
React Native        0.74+ (Expo SDK 51+, bare/dev-client)
@livekit/react-native + livekit-client
react-native-callkeep        # CallKit (iOS) + ConnectionService (Android)
react-native-webrtc
@react-native-firebase/messaging
NestJS              10.x
Prisma              5.x
PostgreSQL          16
Redis               7
LiveKit server      latest stable
coturn              latest
MinIO               latest
Caddy               2.x
```

---

## Resource footprint on a KVM "4" VPS

Assuming ~4 GB RAM / 2–4 vCPU:

| Service | Approx RAM | Notes |
|---------|-----------|-------|
| NestJS API + WS | 150–300 MB | Node process |
| PostgreSQL | 150–300 MB | Tunable |
| Redis | 30–80 MB | Small dataset |
| LiveKit | 100–250 MB idle | Scales with active calls |
| coturn | 30–60 MB | Spikes with relayed media |
| MinIO | 100–200 MB | |
| Caddy | 20–40 MB | |
| **Total idle** | **~0.7–1.4 GB** | Comfortable for MVP + early users |

This fits comfortably for development, demo, and an early user base. Media-heavy concurrent calls are the thing to watch; LiveKit/coturn can be split onto a second box when you grow.
