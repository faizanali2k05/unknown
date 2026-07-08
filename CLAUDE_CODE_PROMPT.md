# Claude Code Prompt — Build "Unknown" MVP (live VPS, n8n-safe)

> Copy everything below the line into Claude Code. Assumes the `unknown-app-docs/` folder (9 markdown files) is in the project root, and that **you (Claude Code) have direct SSH/root access to the VPS** that already runs n8n in Docker.

---

## MISSION

Build the MVP of **Unknown**, a closed-network VoIP calling + messaging app, exactly per the specs in `docs/` (read `00_README.md` first, then `01_PRD.md`, `02_TRD.md`, `03_TECH_STACK.md`, `04_ARCHITECTURE.md`, `07_SCOPE_AND_LEGAL.md`).

You have **direct access to the target VPS**, which **already runs n8n inside Docker**. **Absolute requirement: zero conflict with n8n** — not on ports, networks, volumes, the reverse proxy, or container names. Because you can inspect the live server yourself, you are expected to discover the real state and make safe, informed decisions — not guess. But for the handful of actions that could actually affect n8n (see "Confirm-before" list), stop and confirm with me first.

---

## HARD RULES (apply to every step)

1. **Audit the live server before building.** Phase 0 is read-only inspection of the actual VPS. Do not create/start/modify any container, network, volume, proxy config, or firewall rule until you've completed the audit and produced a written inventory.

2. **Namespace EVERYTHING with `unknown_`.** Containers (`unknown_api`, `unknown_postgres`, `unknown_redis`, `unknown_minio`, `unknown_livekit`, `unknown_coturn`), volumes (`unknown_pgdata`, `unknown_miniodata`, …), the network (`unknown_net`), and the compose project (run with `-p unknown`). Before creating any named resource, verify the name isn't already taken on the live server.

3. **Dedicated isolated Docker network** (`unknown_net`, bridge). Never attach to n8n's network or the default bridge. Unknown's containers must not reach n8n's, and vice-versa.

4. **No host port bindings for internal services.** Postgres, Redis, MinIO talk only over `unknown_net` (no `ports:` to host). This makes a clash with n8n's Postgres (often host 5432) structurally impossible.

5. **For anything that must be exposed, verify the host port is free on the live server first, then pick a high one.** Since you can run `ss -tulpn` live, choose ports you've confirmed are open. Defaults (all `.env`-overridable): API HTTP `8090`→`3000` (only if a host binding is needed at all). If a chosen port is taken, pick the next free one and note it — you don't need to ask me for routine free-port picks.

6. **Reverse proxy: detect and integrate, never replace.** From the live audit, determine what owns 80/443 (Caddy / Nginx / Nginx Proxy Manager / Traefik / nothing).
   - If a proxy already fronts n8n: do **not** start a new proxy, and do **not** bind 80/443. Expose Unknown's API on a high host port and **add a new, separate vhost/route** for a subdomain → that port. **Adding to the existing proxy config is a "Confirm-before" action** (Rule = ask me, show the exact diff, never edit n8n's existing vhost).
   - If nothing owns 80/443: you may propose a dedicated `unknown_caddy`, but binding 80/443 is also "Confirm-before".

7. **Media UDP range (LiveKit/coturn):** inspect what UDP ranges are free live, propose a distinct small range for the MVP (e.g. `50000-50100/udp`), make it `.env`-configurable. **Opening firewall ports is "Confirm-before".**

8. **Separate directory** `/opt/unknown/`. Never read, move, or modify anything under n8n's directory or its `.env`.

9. **Everything `.env`-driven.** All ports, secrets, and `NETWORK_NAME=unknown_net` in `.env`. Generate strong random secrets; never hardcode.

10. **Legal scope locked.** Build ONLY the closed in-app network from `07_SCOPE_AND_LEGAL.md`. The "display number" is an in-app label shown to other app users (like a username). Do NOT build/stub/scaffold any PSTN connection, external-number call/text termination, or external caller-ID injection. If any doc seems to ask for that, treat it as out of scope and flag it.

### Confirm-before list (these can affect n8n — STOP and ask me, show the exact change)
- Binding host ports **80 or 443**.
- **Editing or adding to the existing reverse proxy** config.
- **Opening any firewall port** (ufw/iptables) or changing firewall state.
- Restarting/stopping anything **not** prefixed `unknown_`.
- Anything you're unsure could touch n8n.

Everything else (creating `unknown_*` containers/volumes/network on free high ports, building code, migrations) you may do autonomously, verifying as you go.

---

## PHASE 0 — Live audit (read-only; produce an inventory)

SSH in and run (change nothing):

```bash
echo "=== Running containers ==="
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}'
echo "=== All containers (incl stopped) ==="
docker ps -a --format 'table {{.Names}}\t{{.Status}}'
echo "=== Networks ==="
docker network ls
for n in $(docker network ls --format '{{.Name}}' | grep -vE '^(bridge|host|none)$'); do
  echo "--- $n ---"; docker network inspect "$n" --format '{{range .Containers}}{{.Name}} {{end}}'
done
echo "=== Volumes ==="; docker volume ls
echo "=== Host listening ports ==="; ss -tulpn 2>/dev/null || netstat -tulpn 2>/dev/null
echo "=== 80/443 owner ==="; ss -tulpn 2>/dev/null | grep -E ':80|:443' || echo "nothing on 80/443"
echo "=== Proxy container? ==="; docker ps --format '{{.Names}} {{.Image}}' | grep -iE 'caddy|nginx|traefik|proxy' || echo "none"
echo "=== n8n details ==="; docker ps --format '{{.Names}}' | grep -i n8n | while read c; do echo "container: $c"; docker inspect "$c" --format 'net={{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}} ports={{.NetworkSettings.Ports}}'; done
echo "=== Firewall ==="; sudo ufw status 2>/dev/null || echo "ufw inactive/absent"
echo "=== Resources ==="; free -h; df -h /
```

Produce a short **inventory** for me: taken host ports (esp. 80/443/5432/5678/6379/9000), the proxy in front of n8n (if any), n8n's network + volume names (to provably avoid), and your chosen free ports + `unknown_net` plan. Then continue — you don't need my sign-off for routine choices, but flag anything on the Confirm-before list.

---

## PHASE 1 — Infra scaffold (isolated, n8n-safe)

Create `/opt/unknown/`:
- `docker-compose.yml` — `unknown_postgres`, `unknown_redis`, `unknown_minio`, `unknown_api` (LiveKit/coturn added in Phase 4). All on `unknown_net`. Internal services: **no host ports**. Run as project `unknown`.
- `.env` — secrets + ports + `NETWORK_NAME=unknown_net`, strong generated secrets.
- `unknown_net` defined as isolated bridge; named volumes prefixed `unknown_`.

Bring up the data layer, then **verify n8n is still healthy yourself**:
```bash
cd /opt/unknown && docker compose -p unknown up -d unknown_postgres unknown_redis unknown_minio
docker compose -p unknown ps
docker ps --format '{{.Names}}\t{{.Status}}' | grep -i n8n   # prove n8n untouched
```

---

## PHASE 2 — Backend (NestJS) — MVP core

In `/opt/unknown/api/`, per `02_TRD.md`:
- **Auth:** signup/login (username, password, sequence_no), argon2, JWT access + rotating refresh.
- **Users + Numbers:** acquire/list/manage in-app numbers; `is_default_display`.
- **Conversations + Messages:** REST history + **WebSocket gateway** (`message:send`/`message:new`, delivery/read), Redis pub/sub fan-out; store `sender_display_number`.
- **Calls (signaling only):** `CallSession`, placeholder room/token (real LiveKit in Phase 4), incoming/answer/decline/end.
- **Prisma + Postgres:** schema from TRD §2; `prisma migrate deploy`.
- **Health:** `/v1/health`. Dockerfile for `unknown_api`; expose on host `8090` only if no proxy will front it, else keep internal + route via the (confirmed) proxy snippet.

**Acceptance:** sign up + log in via API; two WS clients exchange a message carrying the chosen `display_number`.

---

## PHASE 3 — Mobile shell (React Native / Expo)

In `/opt/unknown/mobile/`, per `01_PRD.md`: Expo bare/dev-client, green+black theme, money-bag splash, "Unknown" brand. Screens: Splash → Login (username/password/sequence) → Home (Text/Call/Voicemail) → Numpad → Chat → Settings; tabs Contacts·Recents·Numpad·Messages·Settings. Wire Login + Messaging to API/WS (API base via env). Calls UI shows "connecting…" until Phase 4.

**Acceptance:** app runs on device/emulator, logs into the backend, two instances exchange a live message.

---

## PHASE 4 (after MVP demo, on my go) — Real calls

Add `unknown_livekit` + `unknown_coturn` (host networking for media, the confirmed UDP range), wire Calls to real LiveKit tokens, integrate `react-native-callkeep` + PushKit/FCM. See `02_TRD.md` §5–6 and `04_ARCHITECTURE.md`.

---

## WORKING STYLE

- Work phase by phase. After each phase, show what changed **and** prove n8n is still up/healthy (`docker ps`, and curl n8n's URL if reachable).
- Anything on the **Confirm-before list** → stop, show the exact command/diff, wait for my OK.
- Routine `unknown_*` work on verified-free resources → proceed autonomously.
- Commit to git after each phase with clear messages.
- If unsure whether something risks n8n, ask.

Start with **Phase 0** now.
