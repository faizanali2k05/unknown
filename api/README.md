# Unknown API (NestJS)

REST + WebSocket backend. TypeScript end-to-end, Prisma + PostgreSQL, Redis
pub/sub, MinIO object storage, LiveKit token minting.

## Run locally (without Docker)
```bash
npm install
npx prisma generate          # REQUIRED before typecheck/build (downloads engine)
cp .env.example .env         # point DATABASE_URL/REDIS_URL at local services
npx prisma migrate dev
npm run start:dev
```

> The repo typechecks cleanly once `prisma generate` has run. Before generation,
> `tsc` reports a few `implicitly any` notes on Prisma result `.map()` callbacks —
> generation gives them their real model types. The Dockerfile does this for you.

## Module map (`src/`)
```
config/         typed env configuration
common/         JwtAuthGuard, @CurrentUser, global exception filter
prisma/         PrismaService (global)
redis/          RedisService — presence, pub/sub (global)
auth/           signup/login/refresh/logout · argon2 · JWT access+rotating refresh
users/          /users/me, directory search
numbers/        acquire/manage in-app numbers · free/subscriber limits
conversations/  direct conversations (find-or-create)
messages/       REST history + send (shared by WS) · unread counters
realtime/       Socket.IO gateway · Redis fan-out · RealtimePublisher
calls/          signaling (ring/answer/decline/end) + LiveKit token (livekit.service)
voicemail/      MinIO presigned upload/playback (storage.service)
devices/        push-token registration (Phase 4 dispatch)
subscriptions/  server-side tier verification (Phase 6 provider stub)
health/         /v1/health (used by the container healthcheck)
```

## API surface
All routes under `/v1`. Bearer access token on protected routes. WebSocket at
`/ws?token=<access>`. Full contract in [`../docs/02_TRD.md`](../docs/02_TRD.md) §3–4.

## Security
argon2id passwords · short-lived access JWT + rotating refresh (stored hashed,
revocable) · class-validator on every DTO · global rate limiting (`@nestjs/throttler`,
tighter on auth) · per-call LiveKit tokens · short-lived signed media URLs.
