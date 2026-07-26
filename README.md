# Unknown — Closed-Network Calling & Messaging

A self-hosted, **closed-network** VoIP calling + messaging app (iOS + Android).
Users get in-app numbers, set a **display number** (a user-chosen label, like a
username), and call / text / leave voicemail with **other Unknown users** — all
inside the app's own network. No PSTN, no carrier caller-ID. See
[`docs/07_SCOPE_AND_LEGAL.md`](docs/07_SCOPE_AND_LEGAL.md).

```
┌──────────────┐   HTTPS / WSS   ┌──────────────────────────────────────────┐
│  Mobile app  │ ───────────────▶│  VPS (Docker, isolated `unknown_net`)     │
│  Expo / RN   │                 │  unknown_api · unknown_postgres ·         │
│  green/black │                 │  unknown_redis · unknown_minio            │
└──────────────┘                 │  (+ unknown_livekit · unknown_coturn P4)  │
                                  └──────────────────────────────────────────┘
```

## Repository layout

```
unknown/
├── docker-compose.yml          # data + API layer (unknown_ namespaced, isolated net)
├── docker-compose.media.yml    # LiveKit + coturn (Phase 4, host networking)
├── .env.example                # every port/secret — copy to .env
├── deploy/
│   ├── caddy/unknown.caddy      # vhost snippet to ADD to the existing proxy
│   ├── livekit/livekit.yaml
│   └── coturn/turnserver.conf
├── scripts/
│   ├── audit.sh                 # Phase 0 read-only VPS audit
│   ├── preflight.sh             # verify chosen host ports are free
│   └── gen-secrets.sh           # fill .env with strong random secrets
├── api/                         # NestJS backend (REST + WebSocket + Prisma)
├── mobile/                      # Expo React Native app
└── docs/                        # product/tech/scope documentation set
```

## n8n-safety contract (this server already runs n8n + app.seemaai.co.uk)

This stack is built to coexist with the live containers **without any conflict**:

| Guarantee | How |
|-----------|-----|
| No name collisions | Everything prefixed `unknown_` (containers, volumes, `unknown_net`) |
| No network bleed | Dedicated isolated bridge `unknown_net`; never the default bridge or n8n's net |
| No port clash with n8n's Postgres/Redis | Internal services publish **no host ports** — reached only by DNS over `unknown_net` |
| No accidental 80/443 grab | API binds `127.0.0.1:8090` only; the existing proxy routes the subdomain to it |
| Isolated on disk | Lives entirely under `/opt/unknown/` |

**Confirm-before actions** (these touch shared infra — ask first, show the diff):
binding 80/443 · editing the existing reverse proxy · opening any firewall port ·
restarting anything not prefixed `unknown_`.

---

## Deploy on the VPS (`ssh root@69.62.110.2`)

### Phase 0 — audit (read-only, changes nothing)
```bash
git clone <repo> /opt/unknown && cd /opt/unknown
bash scripts/audit.sh | tee /tmp/unknown_audit.txt
```
Review: who owns 80/443, n8n's network/volume names, and that ports
`8090 / 7880 / 7881 / 50000-50100 / 50200-50300 / 3478` are free. Adjust `.env`
if any chosen port is taken.

### Phase 1 — secrets + data layer
```bash
cp .env.example .env
bash scripts/gen-secrets.sh          # fills strong random secrets
# IMPORTANT: ensure DATABASE_URL password == POSTGRES_PASSWORD (see gen-secrets note)
bash scripts/preflight.sh            # confirm host ports free

docker compose -p unknown up -d unknown_postgres unknown_redis unknown_minio
docker compose -p unknown ps
docker ps --format '{{.Names}}\t{{.Status}}' | grep -i n8n   # prove n8n untouched
```

### Phase 2 — API
```bash
docker compose -p unknown up -d --build unknown_api
docker compose -p unknown logs -f unknown_api      # watch boot + migrations
curl -s http://127.0.0.1:8090/v1/health | jq       # expect {"status":"ok"}
```
Migrations run automatically on container start (`prisma migrate deploy`).

### Expose the API (Confirm-before — touches the shared proxy)
Add the vhost in [`deploy/caddy/unknown.caddy`](deploy/caddy/unknown.caddy) to the
**existing** proxy (Caddy/Nginx/NPM) — a new `api.seemaai.co.uk` block routing to
`127.0.0.1:8090`, with WebSocket upgrade. Never edit n8n's vhost. Present the diff first.

### Phase 4 — real calls (after MVP demo, on go-ahead)
```bash
# Confirm-before: open the media UDP ranges in the firewall first.
docker compose -p unknown -f docker-compose.yml -f docker-compose.media.yml \
  up -d unknown_livekit unknown_coturn
```
Set `external-ip` in `deploy/coturn/turnserver.conf` and the public IP in
`deploy/livekit/livekit.yaml`.

---

## Mobile app
```bash
cd mobile
npm install
# point the app at your API (defaults to api.seemaai.co.uk in app.json `extra`)
npm run start        # Expo dev client / Expo Go
```
Screens: Splash → Login (username/password/sequence) → Numpad (home, 3 actions) ·
Contacts · Recents · Messages · Chat · Voicemail · Settings. Green/black theme,
money-bag brand. Login + messaging are wired live; calls show signaling state
until Phase 4 LiveKit audio.

---

## Status vs. the docs

| Area | State |
|------|-------|
| Auth (argon2, JWT access + rotating refresh) | ✅ |
| Users + Numbers (free/subscriber limits, custom display number) | ✅ |
| Conversations + Messages (REST history + WS realtime, Redis fan-out) | ✅ |
| Calls — signaling + LiveKit token minting | ✅ (audio = Phase 4) |
| Voicemail — MinIO signed upload/playback URLs | ✅ |
| Devices + Subscriptions (server-verified tier) | ✅ (provider receipt verify = Phase 6 stub) |
| Push (FCM/APNs/PushKit) | ⛔ Phase 4 |
| Real WebRTC audio (LiveKit + coturn) | ⛔ Phase 4 |

See [`docs/08_ROADMAP_TIMELINE.md`](docs/08_ROADMAP_TIMELINE.md) for the honest timeline.
