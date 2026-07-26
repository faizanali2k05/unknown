# 06 — Deployment on Your KVM VPS ($0 infra)

A practical, copy-pasteable path to get the whole stack running on your VPS with HTTPS. Everything here is free.

> Assumes a fresh Ubuntu 22.04/24.04 KVM VPS with a public IP and a domain you point at it. If you don't have a domain yet, you can test with a free subdomain service, but a real domain (~$10/yr) is recommended for production and clean SSL.

---

## 1. Prerequisites

- VPS with root/sudo, public IPv4.
- A domain, with DNS A-records:
  - `api.yourdomain.com  → VPS IP`
  - `livekit.yourdomain.com → VPS IP`
  - `turn.yourdomain.com → VPS IP`
- Open firewall ports: `80, 443` (web/TLS), `3478` + `49152–65535/udp` (coturn/RTP), LiveKit's UDP range.

---

## 2. Base setup

```bash
# Update + essentials
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git ufw

# Docker + Compose plugin
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # re-login after this

# Firewall
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw allow 3478/tcp
sudo ufw allow 3478/udp
sudo ufw allow 49152:65535/udp
sudo ufw enable
```

---

## 3. Project layout on the server

```
/opt/unknown/
├── docker-compose.yml
├── .env                  # secrets (never commit)
├── Caddyfile             # reverse proxy + auto HTTPS
├── livekit.yaml          # LiveKit config
├── coturn/turnserver.conf
├── api/                  # NestJS backend (git clone or build)
└── data/                 # postgres, minio, redis volumes
```

---

## 4. Caddy (automatic HTTPS, zero cert hassle)

`Caddyfile`:
```
api.yourdomain.com {
    reverse_proxy api:3000
}

livekit.yourdomain.com {
    reverse_proxy livekit:7880
}
```
Caddy fetches and renews Let's Encrypt certificates automatically. No manual cert steps.

---

## 5. docker-compose.yml (skeleton)

```yaml
services:
  caddy:
    image: caddy:2
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
    restart: unless-stopped

  api:
    build: ./api            # NestJS
    env_file: .env
    depends_on: [postgres, redis, minio]
    restart: unless-stopped

  postgres:
    image: postgres:16
    env_file: .env
    volumes: ["./data/pg:/var/lib/postgresql/data"]
    restart: unless-stopped

  redis:
    image: redis:7
    restart: unless-stopped

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    env_file: .env
    volumes: ["./data/minio:/data"]
    restart: unless-stopped

  livekit:
    image: livekit/livekit-server:latest
    command: --config /etc/livekit.yaml
    volumes: ["./livekit.yaml:/etc/livekit.yaml"]
    network_mode: host       # recommended for media/UDP
    restart: unless-stopped

  coturn:
    image: coturn/coturn:latest
    network_mode: host
    volumes: ["./coturn/turnserver.conf:/etc/turnserver.conf"]
    restart: unless-stopped

volumes:
  caddy_data:
```

---

## 6. .env (example — fill with real secrets)

```env
# Postgres
POSTGRES_USER=unknown
POSTGRES_PASSWORD=change_me_strong
POSTGRES_DB=unknown
DATABASE_URL=postgresql://unknown:change_me_strong@postgres:5432/unknown

# JWT
JWT_ACCESS_SECRET=long_random_string
JWT_REFRESH_SECRET=another_long_random_string

# MinIO
MINIO_ROOT_USER=unknown
MINIO_ROOT_PASSWORD=change_me_strong
S3_ENDPOINT=http://minio:9000
S3_BUCKET=voicemail

# LiveKit
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=long_random_secret

# Push
FCM_SERVER_KEY=...
APNS_KEY_ID=...
APNS_TEAM_ID=...
```

---

## 7. LiveKit + coturn essentials

- In `livekit.yaml`, set the API key/secret, the public IP, and TURN config so mobile clients behind NAT can connect.
- In `coturn/turnserver.conf`, set `realm`, a static auth secret (shared with LiveKit), the external IP, and the UDP relay range you opened in the firewall.
- These two are the most fiddly parts of any WebRTC deploy — budget time to test calls across real mobile networks (cellular + Wi-Fi), not just localhost.

---

## 8. Bring it up

```bash
cd /opt/unknown
docker compose pull
docker compose build api
docker compose up -d
docker compose logs -f api      # watch boot
```

Run DB migrations (Prisma):
```bash
docker compose exec api npx prisma migrate deploy
```

---

## 9. Optional: Coolify for a GUI

If you'd rather click than SSH, install **Coolify** (self-hosted, free) on the VPS — it gives a Heroku-like dashboard for deploys, env vars, logs, and SSL. Same $0 cost.

---

## 10. Mobile build & test handover

- **Android:** build a release APK → sideload to test devices, or upload to Play (needs the $25 dev account).
- **iOS:** build via Xcode → **TestFlight** (needs the $99/yr Apple Developer account; there is no free way to install on a real iPhone for testing beyond 7-day personal builds).
- Configure the app's API base URL to `https://api.yourdomain.com`.

---

## 11. Go-live checklist

- [ ] DNS records resolve to the VPS.
- [ ] HTTPS green on `api.` and `livekit.`.
- [ ] Two physical phones can call each other across different networks.
- [ ] Messaging + voicemail verified end-to-end.
- [ ] Push wakes a killed app for calls (iOS via PushKit/CallKit).
- [ ] Nightly Postgres backup running.
- [ ] Uptime Kuma monitoring live.
