# Project Unknown — Documentation Set

A self-hosted private messaging and calling app (web, iOS, Android) with 1-to-1 and group chats, audio/video calls, friend requests, and signed-in meeting links. Contacts are added by exact unique public ID; there is no public user directory.

> **Design principle:** Internal database IDs stay private. Users can discover one another only by entering an exact public ID; messaging and calling use authenticated membership and friendship checks.

---

## How to read this set

| # | Document | What it answers |
|---|----------|-----------------|
| 01 | [`PRD.md`](01_PRD.md) | What we're building, for whom, every feature, every screen |
| 02 | [`TRD.md`](02_TRD.md) | How it works technically — APIs, data models, call/message flow |
| 03 | [`TECH_STACK.md`](03_TECH_STACK.md) | Exact tools, why each was chosen, all free/open-source |
| 04 | [`ARCHITECTURE.md`](04_ARCHITECTURE.md) | System diagram, services, data flow, scaling |
| 05 | [`PAYMENTS_MONETIZATION.md`](05_PAYMENTS_MONETIZATION.md) | Subscriptions, how to take money with lowest fees, legally |
| 06 | [`DEPLOYMENT_VPS.md`](06_DEPLOYMENT_VPS.md) | Step-by-step deploy on your KVM 4 VPS, $0 infra |
| 07 | [`SCOPE_AND_LEGAL.md`](07_SCOPE_AND_LEGAL.md) | What's in/out of scope and why — your legal shield |
| 08 | [`ROADMAP_TIMELINE.md`](08_ROADMAP_TIMELINE.md) | Honest timeline: what ships in 5 hrs vs full product |

---

## TL;DR of the whole stack (all free, self-hosted)

```
Mobile:        React Native (Expo, bare workflow)  — iOS + Android, one codebase
Voice/video:   LiveKit (self-hosted WebRTC SFU)    — real browser/native media
NAT fallback: LiveKit UDP/TCP fallback configured; standalone Coturn not active
Messaging:     NestJS WebSocket gateway + Redis pub/sub
Backend API:   NestJS (TypeScript)
Database:      PostgreSQL + Prisma
Cache/presence:Redis
Voicemail store:MinIO (S3-compatible, self-hosted)
Auth:          JWT (access + refresh)
Push:          Firebase Cloud Messaging (free) + APNs (via FCM) + PushKit for call wake-up
Proxy/SSL:     Caddy + Let's Encrypt (auto HTTPS, free)
Deploy:        Docker Compose on your KVM VPS (optionally Coolify UI)
Monitoring:    Uptime Kuma (free)
```

## The only unavoidable costs (be honest with the client)

| Item | Cost | Why |
|------|------|-----|
| Apple Developer account | $99 / year | Mandatory for any iOS install, even TestFlight. Apple's rule, not ours. |
| Google Play Developer | $25 one-time | Only if publishing to Play Store. Sideload APK is free. |
| Domain name | ~$10 / year | For a clean production URL + SSL. (A free subdomain works for testing.) |
| **Everything else** | **$0** | VPS already owned; all software open-source. |

Total to go live properly: **~$110 first year, ~$110/yr after.** Server hosting and these accounts are billed directly to the client, exactly as your proposal already states.
