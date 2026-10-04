#!/usr/bin/env bash
# =============================================================================
#  Deploys the LiveKit SFU for the Unknown app.
# -----------------------------------------------------------------------------
#  Renders infra/livekit.yaml from infra/.env, points the app to the existing
#  HTTPS hostname, and brings the SFU + embedded TURN up. Safe to re-run.
#
#  Run on the VPS:  bash /opt/unknown/scripts/deploy-livekit.sh
#
#  It does NOT touch UFW or Nginx. Configure the app-only Nginx routes and
#  open the documented ports before running this script.
# =============================================================================
set -euo pipefail

INFRA=/opt/unknown/infra
cd "$INFRA"

set -a
# shellcheck disable=SC1091
. ./.env
set +a

set_env() {
  local name="$1" value="$2"
  if grep -q "^${name}=" .env; then
    sed -i "s|^${name}=.*|${name}=${value}|" .env
  else
    printf '%s=%s\n' "$name" "$value" >> .env
  fi
}

RTC_DOMAIN="unknown.5kassi.com"
LIVEKIT_ADMIN_HOST="$(docker network inspect unknown-net --format '{{(index .IPAM.Config 0).Gateway}}' 2>/dev/null || true)"
if [ -z "$LIVEKIT_ADMIN_HOST" ]; then
  LIVEKIT_ADMIN_HOST="host.docker.internal"
fi

# --- 1. a real key/secret, not the placeholder the old stack shipped with ----
if [ -z "${LIVEKIT_API_SECRET:-}" ] || [ "${LIVEKIT_API_KEY:-}" = "unknown_dev_key" ]; then
  NEW_KEY="unknown_$(openssl rand -hex 6)"
  NEW_SECRET="$(openssl rand -hex 32)"
  set_env LIVEKIT_API_KEY "$NEW_KEY"
  set_env LIVEKIT_API_SECRET "$NEW_SECRET"
  LIVEKIT_API_KEY="$NEW_KEY"
  LIVEKIT_API_SECRET="$NEW_SECRET"
  echo "generated a fresh LiveKit key pair"
else
  echo "keeping the existing LiveKit key pair"
fi

# --- 2. the API and the app must agree on the URL ---------------------------
set_env LIVEKIT_URL "wss://${RTC_DOMAIN}"
set_env LIVEKIT_HTTP_URL "http://${LIVEKIT_ADMIN_HOST}:7880"
set_env RTC_DOMAIN "$RTC_DOMAIN"
echo "LIVEKIT_URL -> wss://${RTC_DOMAIN}"
if [ ! -r "/etc/letsencrypt/live/${RTC_DOMAIN}/fullchain.pem" ] || [ ! -r "/etc/letsencrypt/live/${RTC_DOMAIN}/privkey.pem" ]; then
  echo "ERROR: LiveKit TURN/TLS certificate is unavailable for ${RTC_DOMAIN}" >&2
  exit 1
fi

# --- 3. render the config ---------------------------------------------------
sed -e "s|__API_KEY__|${LIVEKIT_API_KEY}|" \
    -e "s|__API_SECRET__|${LIVEKIT_API_SECRET}|" \
    livekit.yaml > livekit.runtime.yaml
echo "livekit.yaml rendered"

# --- 4. up ------------------------------------------------------------------
docker compose up -d --force-recreate unknown-livekit
# The API mints room tokens, so it has to pick up the new key/secret.
docker compose up -d --force-recreate unknown-api

echo "waiting for LiveKit to come up…"
for _ in $(seq 1 20); do
  if curl -sf -o /dev/null "http://127.0.0.1:7880/"; then
    echo "LiveKit is answering on :7880"
    break
  fi
  sleep 2
done

docker ps --filter 'name=unknown-' --format 'table {{.Names}}\t{{.Status}}'
